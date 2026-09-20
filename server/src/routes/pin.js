import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authMiddleware, getProfile } from '../auth.js';

const router = Router();

router.get('/api/profile/pin-status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(`SELECT transaction_pin_hash FROM profiles WHERE id = $1`, [req.user.id]);
    res.json({ has_pin: Boolean(rows[0]?.transaction_pin_hash) });
  } catch (err) {
    res.json({ has_pin: false });
  }
});

router.post('/api/profile/pin', authMiddleware, async (req, res) => {
  try {
    const pin = String(req.body?.pin || '');
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4–6 digits' });
    const { rows } = await query(`SELECT transaction_pin_hash FROM profiles WHERE id = $1`, [req.user.id]);
    const existing = rows[0]?.transaction_pin_hash;
    if (existing) {
      const current = String(req.body?.current_pin || '');
      const ok = await bcrypt.compare(current, existing);
      if (!ok) return res.status(400).json({ error: 'Current PIN is incorrect' });
    }
    const hash = await bcrypt.hash(pin, 10);
    await query(`UPDATE profiles SET transaction_pin_hash = $1 WHERE id = $2`, [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not save PIN' });
  }
});

router.post('/api/profile/pin/verify', authMiddleware, async (req, res) => {
  try {
    const pin = String(req.body?.pin || '');
    const { rows } = await query(`SELECT transaction_pin_hash FROM profiles WHERE id = $1`, [req.user.id]);
    const hash = rows[0]?.transaction_pin_hash;
    if (!hash) return res.status(400).json({ error: 'No PIN set' });
    const ok = await bcrypt.compare(pin, hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect PIN' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Verify failed' });
  }
});

router.get('/api/profile/preferences', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT notify_login, notify_transfers, notify_deposits, notify_marketing FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    res.json({ preferences: rows[0] || {} });
  } catch (err) {
    res.json({ preferences: {} });
  }
});

router.patch('/api/profile/preferences', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    for (const f of ['notify_login', 'notify_transfers', 'notify_deposits', 'notify_marketing']) {
      if (typeof body[f] === 'boolean') {
        sets.push(`${f} = $${i++}`);
        vals.push(body[f]);
      }
    }
    if (!sets.length) {
      const p = await query(
        `SELECT notify_login, notify_transfers, notify_deposits, notify_marketing FROM profiles WHERE id = $1`,
        [req.user.id]
      );
      return res.json({ preferences: p.rows[0] || {} });
    }
    vals.push(req.user.id);
    const { rows } = await query(
      `UPDATE profiles SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING notify_login, notify_transfers, notify_deposits, notify_marketing`,
      vals
    );
    res.json({ preferences: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not save preferences' });
  }
});

router.patch('/api/profile', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ['full_name', 'phone', 'address', 'country', 'date_of_birth'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const f of allowed) {
      if (body[f] !== undefined) {
        sets.push(`${f} = $${i++}`);
        vals.push(body[f] === '' ? null : (typeof body[f] === 'string' ? body[f].trim() : body[f]));
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.user.id);
    await query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    const user = await getProfile(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    console.error('profile patch:', err);
    res.status(500).json({ error: err.message || 'Could not update profile' });
  }
});

export default router;
