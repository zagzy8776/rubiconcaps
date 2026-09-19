/**
 * Customer withdrawal requests → admin approve/reject (mirrors deposits).
 */
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authMiddleware, adminMiddleware } from '../auth.js';
import { createNotification } from '../helpers.js';

const router = Router();

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL REFERENCES profiles(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      amount NUMERIC(24,2) NOT NULL,
      currency TEXT NOT NULL,
      destination TEXT,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed_at TIMESTAMPTZ
    )
  `).catch((e) => console.warn('withdrawal_requests:', e.message));
}

let ready = false;
async function boot() {
  if (!ready) {
    await ensureTable();
    ready = true;
  }
}

router.post('/api/withdrawals', authMiddleware, async (req, res) => {
  try {
    await boot();
    const { account_id, amount, destination, reference } = req.body || {};
    if (!account_id || amount === undefined) {
      return res.status(400).json({ error: 'Account and amount are required' });
    }
    const amt = parseFloat(typeof amount === 'string' ? String(amount).replace(/,/g, '') : amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }

    const acctRes = await query(
      `SELECT id, currency, balance, status, is_locked FROM accounts WHERE id = $1 AND user_id = $2`,
      [account_id, req.user.id]
    );
    if (!acctRes.rows.length) return res.status(404).json({ error: 'Account not found' });
    const acct = acctRes.rows[0];
    if (acct.is_locked || acct.status === 'blocked' || acct.status === 'closed') {
      return res.status(403).json({ error: 'Account is not eligible for withdrawals' });
    }
    const bal = parseFloat(acct.balance) || 0;
    if (amt > bal) return res.status(400).json({ error: 'Insufficient balance' });

    const { rows } = await query(
      `INSERT INTO withdrawal_requests (customer_id, account_id, amount, currency, destination, reference)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, account_id, amt, acct.currency, destination || null, reference || null]
    );

    await createNotification(req.user.id, 'withdrawal_requested', 'Withdrawal requested', `Your withdrawal of ${amt} ${acct.currency} is pending review.`).catch(() => {});
    res.status(201).json({ withdrawal: rows[0] });
  } catch (err) {
    console.error('withdrawals create:', err);
    res.status(500).json({ error: 'Could not submit withdrawal' });
  }
});

router.get('/api/withdrawals', authMiddleware, async (req, res) => {
  try {
    await boot();
    const { rows } = await query(
      `SELECT w.*, a.account_number, a.account_name
       FROM withdrawal_requests w
       LEFT JOIN accounts a ON a.id = w.account_id
       WHERE w.customer_id = $1
       ORDER BY w.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ withdrawals: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load withdrawals' });
  }
});

router.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await boot();
    const status = req.query.status || 'all';
    const params = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = `WHERE w.status = $1`;
    }
    const { rows } = await query(
      `SELECT w.*, p.full_name as customer_name, p.email as customer_email, a.account_number
       FROM withdrawal_requests w
       LEFT JOIN profiles p ON p.id = w.customer_id
       LEFT JOIN accounts a ON a.id = w.account_id
       ${where}
       ORDER BY w.created_at ASC LIMIT 100`,
      params
    );
    res.json({ withdrawals: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load withdrawals' });
  }
});

router.patch('/api/admin/withdrawals/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await boot();
    const { status, admin_note } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    const result = await withTransaction(async (client) => {
      const cur = await client.query(`SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!cur.rows.length) throw new Error('Not found');
      const w = cur.rows[0];
      if (w.status !== 'pending') throw new Error('Already reviewed');

      if (status === 'approved') {
        const acct = await client.query(`SELECT * FROM accounts WHERE id = $1 FOR UPDATE`, [w.account_id]);
        if (!acct.rows.length) throw new Error('Account missing');
        const bal = parseFloat(acct.rows[0].balance) || 0;
        const amt = parseFloat(w.amount);
        if (amt > bal) throw new Error('Insufficient balance at approval time');
        await client.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [amt, w.account_id]);
        await client.query(
          `INSERT INTO transactions (account_id, type, amount, currency, description, reference, status)
           VALUES ($1, 'withdrawal', $2, $3, $4, $5, 'completed')`,
          [w.account_id, amt, w.currency, admin_note || 'Withdrawal approved', w.reference || null]
        ).catch(() => {});
      }

      const upd = await client.query(
        `UPDATE withdrawal_requests SET status = $1, admin_note = $2, reviewed_at = now() WHERE id = $3 RETURNING *`,
        [status, admin_note || null, req.params.id]
      );
      return upd.rows[0];
    });

    await createNotification(
      result.customer_id,
      'withdrawal_' + status,
      status === 'approved' ? 'Withdrawal approved' : 'Withdrawal declined',
      admin_note || (status === 'approved' ? 'Funds have been withdrawn from your account.' : 'Your withdrawal request was declined.')
    ).catch(() => {});

    res.json({ withdrawal: result });
  } catch (err) {
    console.error('withdrawals review:', err);
    res.status(400).json({ error: err.message || 'Review failed' });
  }
});

export default router;
