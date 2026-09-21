/**
 * Email OTP step-up for customer login (bank-style).
 * POST /api/auth/login  → password check → OTP emailed → { requires_otp, challenge_id }
 * POST /api/auth/verify-otp → { user, token }
 * POST /api/auth/resend-otp
 */
import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import {
  signToken, createSession, comparePassword,
} from '../auth.js';
import { emailLoginOtp, emailLoginAlert, voidEmail } from '../email.js';

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LOCK_COUNT = 5;

const challenges = new Map();
const failCounts = new Map();

async function ensureOtpTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch((e) => console.warn('login_otps:', e.message));
}

let tableReady = false;
async function ready() {
  if (!tableReady) {
    await ensureOtpTable();
    tableReady = true;
  }
}

function maskEmail(email) {
  const [u, d] = String(email).split('@');
  if (!d) return '***';
  const show = u.slice(0, 1);
  return `${show}•••@${d}`;
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function noteFail(email) {
  const key = email.toLowerCase();
  const cur = failCounts.get(key) || { n: 0, at: Date.now() };
  if (Date.now() - cur.at > FAIL_WINDOW_MS) {
    failCounts.set(key, { n: 1, at: Date.now() });
    return 1;
  }
  cur.n += 1;
  cur.at = Date.now();
  failCounts.set(key, cur);
  return cur.n;
}

function isFailLocked(email) {
  const cur = failCounts.get(email.toLowerCase());
  if (!cur) return false;
  if (Date.now() - cur.at > FAIL_WINDOW_MS) {
    failCounts.delete(email.toLowerCase());
    return false;
  }
  return cur.n >= FAIL_LOCK_COUNT;
}

function clearFails(email) {
  failCounts.delete(email.toLowerCase());
}

router.post('/api/auth/login', async (req, res) => {
  try {
    await ready();
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const em = String(email).toLowerCase().trim();
    if (isFailLocked(em)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    const { rows } = await query(
      `SELECT id, email, full_name, role, password_hash, is_locked FROM profiles WHERE email = $1`,
      [em]
    );
    if (!rows.length) {
      noteFail(em);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = rows[0];
    if (user.is_locked) return res.status(403).json({ error: 'Account locked. Please contact support.' });
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      const n = noteFail(em);
      if (n >= FAIL_LOCK_COUNT) {
        return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    clearFails(em);

    // Trusted device: skip OTP when client asserts a previously remembered device
    const trustDevice = !!(req.body && req.body.trust_device);
    if (trustDevice) {
      await query('UPDATE profiles SET last_login = now() WHERE id = $1', [user.id]).catch(() => {});
      const sessionClaims = await createSession(user.id, req);
      const token = signToken(user, sessionClaims);
      voidEmail(emailLoginAlert({
        to: user.email,
        fullName: user.full_name,
        when: new Date().toUTCString(),
        ip: req.headers['x-forwarded-for'] || req.ip || '',
      }));
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_locked: user.is_locked,
        },
        token,
        trusted_device: true,
      });
    }

    const code = genCode();
    const challengeId = crypto.randomUUID();
    const expires = new Date(Date.now() + OTP_TTL_MS);

    await query(
      `INSERT INTO login_otps (id, user_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [challengeId, user.id, hashCode(code), expires.toISOString()]
    ).catch(() => {});

    challenges.set(challengeId, {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      hash: hashCode(code),
      expires: expires.getTime(),
      attempts: 0,
    });

    const sent = await emailLoginOtp({
      to: user.email,
      fullName: user.full_name,
      code,
      expiresMinutes: 10,
    });
    if (!sent?.ok) {
      console.error('[login] OTP email failed:', sent?.error || 'unknown');
      return res.status(503).json({
        error: 'We could not send the verification code. Check your email address or try again in a minute. If this continues, contact rubiconcapital@rubiconcapital.org.',
        email_error: true,
      });
    }

    res.json({
      requires_otp: true,
      challenge_id: challengeId,
      email_hint: maskEmail(user.email),
      expires_in: 600,
    });
  } catch (err) {
    console.error('login otp:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/api/auth/verify-otp', async (req, res) => {
  try {
    await ready();
    const { challenge_id, code } = req.body || {};
    if (!challenge_id || !code) {
      return res.status(400).json({ error: 'Verification code required' });
    }
    const clean = String(code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) {
      return res.status(400).json({ error: 'Enter the 6-digit code from your email' });
    }

    let ch = challenges.get(challenge_id);
    let dbRow = null;
    if (!ch) {
      const { rows } = await query(
        `SELECT * FROM login_otps WHERE id = $1`,
        [challenge_id]
      ).catch(() => ({ rows: [] }));
      dbRow = rows[0];
      if (!dbRow || dbRow.used_at) {
        return res.status(401).json({ error: 'Code expired or invalid. Sign in again.' });
      }
      if (new Date(dbRow.expires_at).getTime() < Date.now()) {
        return res.status(401).json({ error: 'Code expired. Sign in again.' });
      }
      if ((dbRow.attempts || 0) >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many attempts. Sign in again.' });
      }
    } else {
      if (ch.expires < Date.now()) {
        challenges.delete(challenge_id);
        return res.status(401).json({ error: 'Code expired. Sign in again.' });
      }
      if (ch.attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many attempts. Sign in again.' });
      }
    }

    const expectedHash = ch ? ch.hash : dbRow.code_hash;
    const ok = hashCode(clean) === expectedHash;
    if (!ok) {
      if (ch) {
        ch.attempts += 1;
        challenges.set(challenge_id, ch);
      }
      if (dbRow) {
        await query(`UPDATE login_otps SET attempts = attempts + 1 WHERE id = $1`, [challenge_id]).catch(() => {});
      }
      return res.status(401).json({ error: 'Incorrect code. Check your email and try again.' });
    }

    const userId = ch ? ch.userId : dbRow.user_id;
    challenges.delete(challenge_id);
    await query(`UPDATE login_otps SET used_at = now() WHERE id = $1`, [challenge_id]).catch(() => {});

    const { rows } = await query(
      `SELECT id, email, full_name, role, is_locked, created_at, last_login, phone
       FROM profiles WHERE id = $1`,
      [userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    const user = rows[0];
    if (user.is_locked) return res.status(403).json({ error: 'Account locked. Please contact support.' });

    await query('UPDATE profiles SET last_login = now() WHERE id = $1', [user.id]);
    const sessionClaims = await createSession(user.id, req);
    const token = signToken(user, sessionClaims);
    voidEmail(emailLoginAlert({
      to: user.email,
      fullName: user.full_name,
      when: new Date().toUTCString(),
      ip: req.ip,
    }));

    res.json({ user, token });
  } catch (err) {
    console.error('verify-otp:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/api/auth/resend-otp', async (req, res) => {
  try {
    await ready();
    const { challenge_id } = req.body || {};
    if (!challenge_id) return res.status(400).json({ error: 'Missing challenge' });
    let ch = challenges.get(challenge_id);
    if (!ch) {
      const { rows } = await query(`SELECT * FROM login_otps WHERE id = $1 AND used_at IS NULL`, [challenge_id]).catch(() => ({ rows: [] }));
      if (!rows[0]) return res.status(401).json({ error: 'Session expired. Sign in again.' });
      const { rows: users } = await query(`SELECT id, email, full_name, role FROM profiles WHERE id = $1`, [rows[0].user_id]);
      if (!users[0]) return res.status(401).json({ error: 'Session expired. Sign in again.' });
      ch = { userId: users[0].id, email: users[0].email, fullName: users[0].full_name, role: users[0].role, attempts: 0 };
    }

    const code = genCode();
    const expires = new Date(Date.now() + OTP_TTL_MS);
    challenges.set(challenge_id, {
      ...ch,
      hash: hashCode(code),
      expires: expires.getTime(),
      attempts: 0,
    });
    await query(
      `UPDATE login_otps SET code_hash = $1, expires_at = $2, attempts = 0 WHERE id = $3`,
      [hashCode(code), expires.toISOString(), challenge_id]
    ).catch(() => {});

    const sent = await emailLoginOtp({
      to: ch.email,
      fullName: ch.fullName,
      code,
      expiresMinutes: 10,
    });
    if (!sent?.ok) {
      console.error('[resend-otp] email failed:', sent?.error || 'unknown');
      return res.status(503).json({
        error: 'Could not resend the code. Wait a moment and try again, or contact rubiconcapital@rubiconcapital.org.',
        email_error: true,
      });
    }

    res.json({ success: true, email_hint: maskEmail(ch.email), expires_in: 600 });
  } catch (err) {
    console.error('resend-otp:', err);
    res.status(500).json({ error: 'Could not resend code' });
  }
});

export default router;
