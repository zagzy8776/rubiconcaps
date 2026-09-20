/**
 * Session management — list devices, revoke one, sign out everywhere.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

function parseUa(ua) {
  if (!ua) return 'Unknown device';
  const s = String(ua);
  if (/iPhone/i.test(s)) return 'iPhone';
  if (/iPad/i.test(s)) return 'iPad';
  if (/Android/i.test(s)) return 'Android device';
  if (/Mac OS/i.test(s)) return 'Mac';
  if (/Windows/i.test(s)) return 'Windows PC';
  if (/Linux/i.test(s)) return 'Linux';
  return s.slice(0, 48);
}

// GET /api/sessions
router.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, user_agent, ip, created_at, last_seen_at, revoked_at
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY COALESCE(last_seen_at, created_at) DESC
       LIMIT 50`,
      [req.user.id]
    ).catch(() => ({ rows: [] }));

    const currentId = req.user.sid || null;
    const sessions = rows.map((r) => ({
      id: r.id,
      device: parseUa(r.user_agent),
      user_agent: r.user_agent,
      ip: r.ip,
      created_at: r.created_at,
      last_seen_at: r.last_seen_at,
      revoked: !!r.revoked_at,
      current: currentId && r.id === currentId,
    }));

    res.json({ sessions, current_session_id: currentId });
  } catch (err) {
    console.error('list sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// POST /api/sessions/:id/revoke — end one device
router.post('/api/sessions/:id/revoke', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [id, req.user.id]
    );
    if (!rowCount) {
      return res.status(404).json({ error: 'Session not found or already ended' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('revoke session:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// POST /api/sessions/revoke-all — sign out everywhere (including current)
router.post('/api/sessions/revoke-all', authMiddleware, async (req, res) => {
  try {
    await query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user.id]
    ).catch(() => {});

    // Bump session_version so any JWT without matching sv is rejected
    await query(
      `UPDATE profiles SET session_version = COALESCE(session_version, 1) + 1 WHERE id = $1`,
      [req.user.id]
    ).catch(() => {});

    res.json({
      success: true,
      message: 'All sessions ended. Please sign in again.',
    });
  } catch (err) {
    console.error('revoke-all:', err);
    res.status(500).json({ error: 'Failed to sign out everywhere' });
  }
});

// GET /api/profile/preferences
router.get('/api/profile/preferences', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(notify_login, true) AS notify_login,
         COALESCE(notify_transfers, true) AS notify_transfers,
         COALESCE(notify_deposits, true) AS notify_deposits,
         COALESCE(notify_marketing, false) AS notify_marketing
       FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });
    res.json({ preferences: rows[0] });
  } catch (err) {
    console.error('get preferences:', err);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

// PATCH /api/profile/preferences
router.patch('/api/profile/preferences', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const fields = ['notify_login', 'notify_transfers', 'notify_deposits', 'notify_marketing'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const f of fields) {
      if (typeof body[f] === 'boolean') {
        sets.push(`${f} = $${i++}`);
        vals.push(body[f]);
      }
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'No preference fields to update' });
    }
    vals.push(req.user.id);
    const { rows } = await query(
      `UPDATE profiles SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING
         COALESCE(notify_login, true) AS notify_login,
         COALESCE(notify_transfers, true) AS notify_transfers,
         COALESCE(notify_deposits, true) AS notify_deposits,
         COALESCE(notify_marketing, false) AS notify_marketing`,
      vals
    );
    res.json({ preferences: rows[0] });
  } catch (err) {
    console.error('patch preferences:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
