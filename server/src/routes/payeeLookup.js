import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

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
        name: a.full_name || a.account_name || 'Rubicon client',
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

export default router;
