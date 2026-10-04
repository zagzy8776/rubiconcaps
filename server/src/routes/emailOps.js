/**
 * Password reset/change + admin email digests/statements.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import {
  authMiddleware, adminMiddleware, hashPassword, comparePassword,
} from '../auth.js';
import {
  emailPasswordReset,
  emailPasswordChanged,
  emailMonthlyStatement,
  emailAdminDigest,
  voidEmail,
} from '../email.js';

const router = Router();

async function ensureResetTable() {
  // profiles.id may be UUID or TEXT depending on how the DB was bootstrapped.
  // Prefer UUID + FK; fall back to TEXT without FK so resets never 500 on schema mismatch.
  const attempts = [
    `CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
  ];
  for (const sql of attempts) {
    try {
      await query(sql);
      break;
    } catch (e) {
      console.warn('password_resets table:', e.message);
    }
  }
  await query(
    `CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token_hash)`
  ).catch(() => {});
}

let tableReady = false;
async function ready() {
  if (!tableReady) {
    await ensureResetTable();
    tableReady = true;
  }
}

router.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const { rows } = await query(
      `SELECT id, email, full_name, password_hash FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    const ok = await comparePassword(current_password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    const password_hash = await hashPassword(new_password);
    await query(`UPDATE profiles SET password_hash = $1 WHERE id = $2`, [password_hash, user.id]);
    voidEmail(emailPasswordChanged({
      to: user.email,
      fullName: user.full_name,
      when: new Date().toUTCString(),
    }));
    res.json({ success: true });
  } catch (err) {
    console.error('change-password:', err);
    res.status(500).json({ error: 'Could not change password' });
  }
});

router.post('/api/auth/forgot-password', async (req, res) => {
  // Always return the same generic message to avoid email enumeration.
  const generic = { success: true, message: 'If that email is registered, a reset link has been sent.' };
  try {
    await ready();
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.json(generic);

    let rows = [];
    try {
      const r = await query(
        `SELECT id, email, full_name FROM profiles WHERE email = $1`,
        [email]
      );
      rows = r.rows || [];
    } catch (dbErr) {
      console.error('forgot-password lookup:', dbErr.message);
      // Still return generic — do not leak DB failures to clients
      return res.json(generic);
    }
    if (!rows.length) return res.json(generic);

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    try {
      await query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, token_hash, expires.toISOString()]
      );
    } catch (insErr) {
      console.error('forgot-password insert:', insErr.message);
      // Retry table create once then insert again
      tableReady = false;
      await ready();
      await query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, token_hash, expires.toISOString()]
      );
    }

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.rubiconcapital.org';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    // Email is best-effort — missing RESEND_API_KEY must not 500 the request
    voidEmail(emailPasswordReset({
      to: user.email,
      fullName: user.full_name,
      resetUrl,
      expiresMinutes: 60,
    }));

    res.json(generic);
  } catch (err) {
    console.error('forgot-password:', err);
    // Prefer generic success over 500 so the UI is not blocked; ops can check logs.
    res.json(generic);
  }
});

router.post('/api/auth/reset-password', async (req, res) => {
  try {
    await ready();
    const { token, new_password } = req.body || {};
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token and new password required' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const token_hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const { rows } = await query(
      `SELECT pr.*, p.email, p.full_name
       FROM password_resets pr
       JOIN profiles p ON p.id = pr.user_id
       WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now()
       ORDER BY pr.created_at DESC LIMIT 1`,
      [token_hash]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }
    const row = rows[0];
    const password_hash = await hashPassword(new_password);
    await query(`UPDATE profiles SET password_hash = $1 WHERE id = $2`, [password_hash, row.user_id]);
    await query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [row.id]);
    voidEmail(emailPasswordChanged({
      to: row.email,
      fullName: row.full_name,
      when: new Date().toUTCString(),
    }));
    res.json({ success: true });
  } catch (err) {
    console.error('reset-password:', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

router.post('/api/admin/emails/digest', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const to = (req.body?.to || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || '').toLowerCase();
    if (!to) return res.status(400).json({ error: 'No admin email configured' });

    const deposits = await query(
      `SELECT dr.*, p.full_name as customer_name, p.email as customer_email
       FROM deposit_requests dr
       LEFT JOIN profiles p ON p.id = dr.customer_id
       WHERE dr.status = 'pending'
       ORDER BY dr.created_at ASC LIMIT 50`
    ).catch(() => ({ rows: [] }));

    const pendingReq = await query(
      `SELECT COUNT(*)::int as c FROM account_requests WHERE status = 'pending'`
    ).catch(() => ({ rows: [{ c: 0 }] }));

    const locked = await query(
      `SELECT COUNT(*)::int as c FROM accounts WHERE is_locked = true OR status IN ('blocked','closed')`
    ).catch(() => ({ rows: [{ c: 0 }] }));

    await emailAdminDigest({
      to,
      pendingDeposits: deposits.rows,
      pendingRequests: pendingReq.rows[0]?.c || 0,
      lockedAccounts: locked.rows[0]?.c || 0,
      when: new Date().toUTCString(),
    });

    res.json({ success: true, sent_to: to, pending_deposits: deposits.rows.length });
  } catch (err) {
    console.error('admin digest:', err);
    res.status(500).json({ error: 'Failed to send digest' });
  }
});

router.post('/api/admin/emails/statements', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { user_id, period_label } = req.body || {};
    const periodLabel = period_label || new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    let users;
    if (user_id) {
      users = (await query(`SELECT id, email, full_name FROM profiles WHERE id = $1`, [user_id])).rows;
    } else {
      users = (await query(
        `SELECT id, email, full_name FROM profiles WHERE role IS DISTINCT FROM 'admin' ORDER BY created_at DESC LIMIT 200`
      )).rows;
    }

    let sent = 0;
    for (const u of users) {
      const accts = (await query(
        `SELECT account_number, account_name, currency, balance FROM accounts WHERE user_id = $1`,
        [u.id]
      )).rows;
      const tx = await query(
        `SELECT type, COUNT(*)::int as c FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         WHERE a.user_id = $1 AND t.created_at >= date_trunc('month', now())
         GROUP BY type`,
        [u.id]
      ).catch(() => ({ rows: [] }));
      const summary = { credits: 0, debits: 0, transfers: 0 };
      for (const r of tx.rows) {
        const ty = (r.type || '').toLowerCase();
        if (ty.includes('deposit') || ty.includes('credit') || ty === 'transfer_in') summary.credits += r.c;
        else if (ty.includes('withdraw') || ty.includes('debit') || ty === 'transfer_out') summary.debits += r.c;
        else if (ty.includes('transfer')) summary.transfers += r.c;
      }
      if (u.email) {
        await emailMonthlyStatement({
          to: u.email,
          fullName: u.full_name,
          periodLabel,
          accounts: accts,
          txSummary: summary,
        });
        sent += 1;
      }
    }
    res.json({ success: true, sent, period: periodLabel });
  } catch (err) {
    console.error('statements:', err);
    res.status(500).json({ error: 'Failed to send statements' });
  }
});

export default router;
