/**
 * Transaction PIN — set, change, status, verify.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware, hashPassword, comparePassword } from '../auth.js';

const router = Router();

function normalizePin(pin) {
  const p = String(pin || '').replace(/\s/g, '');
  if (!/^\d{4,6}$/.test(p)) return null;
  return p;
}

// GET /api/profile/pin-status
router.get('/api/profile/pin-status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT transaction_pin_hash IS NOT NULL AS has_pin FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    res.json({ has_pin: !!rows[0]?.has_pin });
  } catch (err) {
    console.error('pin-status:', err);
    res.status(500).json({ error: 'Failed to check PIN status' });
  }
});

// POST /api/profile/pin — set or change (requires current_pin if already set)
router.post('/api/profile/pin', authMiddleware, async (req, res) => {
  try {
    const pin = normalizePin(req.body?.pin);
    if (!pin) {
      return res.status(400).json({ error: 'PIN must be 4–6 digits' });
    }
    const { rows } = await query(
      `SELECT transaction_pin_hash FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });

    const existing = rows[0].transaction_pin_hash;
    if (existing) {
      const current = normalizePin(req.body?.current_pin);
      if (!current) {
        return res.status(400).json({ error: 'Current PIN required to change it' });
      }
      const ok = await comparePassword(current, existing);
      if (!ok) return res.status(401).json({ error: 'Current PIN is incorrect' });
    }

    const hash = await hashPassword(pin);
    await query(`UPDATE profiles SET transaction_pin_hash = $1 WHERE id = $2`, [hash, req.user.id]);
    res.json({ success: true, has_pin: true });
  } catch (err) {
    console.error('set pin:', err);
    res.status(500).json({ error: 'Failed to set PIN' });
  }
});

// POST /api/profile/pin/verify
router.post('/api/profile/pin/verify', authMiddleware, async (req, res) => {
  try {
    const pin = normalizePin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: 'Enter your 4–6 digit PIN' });
    const { rows } = await query(
      `SELECT transaction_pin_hash FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]?.transaction_pin_hash) {
      return res.status(400).json({ error: 'No transaction PIN set. Set one in Profile first.' });
    }
    const ok = await comparePassword(pin, rows[0].transaction_pin_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect PIN' });
    res.json({ success: true });
  } catch (err) {
    console.error('verify pin:', err);
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

/** Helper used by transfer routes */
export async function assertTransactionPin(userId, pinRaw) {
  const { rows } = await query(
    `SELECT transaction_pin_hash FROM profiles WHERE id = $1`,
    [userId]
  );
  const hash = rows[0]?.transaction_pin_hash;
  if (!hash) {
    // PIN not set — allow (user can set later). Require once set.
    return { ok: true, required: false };
  }
  const pin = normalizePin(pinRaw);
  if (!pin) return { ok: false, error: 'Transaction PIN required' };
  const match = await comparePassword(pin, hash);
  if (!match) return { ok: false, error: 'Incorrect transaction PIN' };
  return { ok: true, required: true };
}

export default router;
