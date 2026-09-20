import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rubicon-capital-change-this-in-production-2026';
const JWT_EXPIRES = '7d';

export function signToken(user, extra = {}) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      ...extra,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId, req) {
  const id = crypto.randomUUID();
  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 400);
  const ip = String(req?.headers?.['x-forwarded-for'] || req?.ip || '')
    .split(',')[0]
    .trim()
    .slice(0, 64);
  await query(
    `INSERT INTO user_sessions (id, user_id, user_agent, ip)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, ua || null, ip || null]
  ).catch((err) => {
    console.error('createSession insert failed:', err.message);
  });
  let sv = 1;
  try {
    const { rows } = await query(
      `SELECT COALESCE(session_version, 1) AS session_version FROM profiles WHERE id = $1`,
      [userId]
    );
    if (rows[0]) sv = Number(rows[0].session_version) || 1;
  } catch {
    /* column may not exist yet on first boot */
  }
  return { sid: id, sv };
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyToken(header.slice(7));

    if (payload.id !== 'admin-owner') {
      if (payload.sv != null && payload.id) {
        try {
          const { rows } = await query(
            `SELECT COALESCE(session_version, 1) AS session_version FROM profiles WHERE id = $1`,
            [payload.id]
          );
          if (rows[0] && Number(rows[0].session_version) !== Number(payload.sv)) {
            return res.status(401).json({ error: 'Session ended. Sign in again.' });
          }
        } catch {
          /* ignore if column missing */
        }
      }

      if (payload.sid && payload.id) {
        try {
          const { rows } = await query(
            `SELECT revoked_at FROM user_sessions WHERE id = $1 AND user_id = $2`,
            [payload.sid, payload.id]
          );
          if (rows[0]?.revoked_at) {
            return res.status(401).json({ error: 'Session ended. Sign in again.' });
          }
          if (rows[0]) {
            query(
              `UPDATE user_sessions SET last_seen_at = now() WHERE id = $1 AND revoked_at IS NULL`,
              [payload.sid]
            ).catch(() => {});
          }
        } catch {
          /* table may not exist yet */
        }
      }
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function adminMiddleware(req, res, next) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const tokenEmail = String(req.user?.email || '').toLowerCase().trim();
  const ownerToken = req.user?.id === 'admin-owner';
  if (!adminEmail || !ownerToken || tokenEmail !== adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export async function getProfile(userId) {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name, role, is_locked, phone, address, country, date_of_birth,
              kyc_status, account_status, created_at, last_login, avatar_url,
              notify_login, notify_transfers, notify_deposits, notify_marketing,
              COALESCE(session_version, 1) AS session_version
       FROM profiles WHERE id = $1`,
      [userId]
    );
    return rows[0] || null;
  } catch {
    const { rows } = await query(
      `SELECT id, email, full_name, role, is_locked, phone, address, country, date_of_birth,
              kyc_status, account_status, created_at, last_login,
              notify_login, notify_transfers, notify_deposits, notify_marketing,
              COALESCE(session_version, 1) AS session_version
       FROM profiles WHERE id = $1`,
      [userId]
    );
    return rows[0] || null;
  }
}
