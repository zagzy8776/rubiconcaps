import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware, adminMiddleware } from '../auth.js';

const router = Router();

const SUPPORT_PHONE = (process.env.SUPPORT_PHONE || process.env.SUPPORT_WHATSAPP || '+12136061732').replace(/\s+/g, '');
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'rubiconcapital@rubiconcapital.org';

query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch((e) => {
  console.warn('avatar_url column:', e.message);
});

router.get('/api/support', (_req, res) => {
  const digits = SUPPORT_PHONE.replace(/[^\d+]/g, '');
  const e164 = digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
  res.json({
    phone: SUPPORT_PHONE,
    phone_display: '+1 (213) 606-1732',
    tel_link: `tel:${e164.startsWith('+') ? e164 : '+'+e164}`,
    sms_link: `sms:${e164.startsWith('+') ? e164 : '+'+e164}`,
    email: SUPPORT_EMAIL,
  });
});

router.get('/api/transfers/lookup', authMiddleware, async (req, res) => {
  try {
    const raw = String(req.query.number || req.query.account_number || '').replace(/\s+/g, '');
    if (raw.length < 8) return res.json({ found: false });
    const { rows } = await query(
      `SELECT a.account_number, a.account_name, a.currency, a.status, a.is_locked,
              p.full_name
       FROM accounts a
       LEFT JOIN profiles p ON p.id = a.user_id
       WHERE a.account_number = $1
       LIMIT 1`,
      [raw]
    );
    const a = rows[0];
    if (!a) return res.json({ found: false });
    res.json({
      found: true,
      payee: {
        name: a.full_name || a.account_name || 'Client',
        account_name: a.account_name,
        account_number: a.account_number,
        currency: a.currency,
        active: !a.is_locked && (!a.status || a.status === 'active'),
      },
    });
  } catch (err) {
    console.error('lookup:', err);
    res.json({ found: false });
  }
});

router.patch('/api/admin/users/:id/avatar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const image = String(req.body?.image || req.body?.avatar_url || '');
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Upload a JPEG or PNG image' });
    }
    if (image.length > 450000) {
      return res.status(400).json({ error: 'Photo is too large. Use a smaller picture.' });
    }
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch(() => {});
    const { rows } = await query(
      `UPDATE profiles SET avatar_url = $1 WHERE id = $2 RETURNING id, full_name, avatar_url`,
      [image, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('avatar:', err);
    res.status(500).json({ error: err.message || 'Could not save photo' });
  }
});

export default router;
