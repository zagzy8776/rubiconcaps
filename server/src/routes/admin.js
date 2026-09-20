/**
 * Enhanced admin routes — account controls, audit log, transaction management.
 */
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authMiddleware, adminMiddleware } from '../auth.js';
import { createNotification, createAuditLog } from '../helpers.js';
import { getUserContact, emailBalanceAdjust, emailAccountLock, voidEmail } from '../email.js';

const router = Router();

async function tryInSavepoint(client, name, fn) {
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, result };
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    console.warn(`savepoint ${name} rolled back:`, err.message);
    return { ok: false, error: err };
  }
}

router.post('/api/admin/accounts/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { action, reason } = req.body;
    const valid = ['block', 'unblock', 'close', 'reopen', 'lock', 'unlock', 'suspend_deposits', 'suspend_transfers'];
    if (!action || !valid.includes(action)) {
      return res.status(400).json({ error: `Action must be one of: ${valid.join(', ')}` });
    }

    const result = await withTransaction(async (client) => {
      const a = (
        await client.query(
          `SELECT a.*, p.id as profile_id FROM accounts a JOIN profiles p ON p.id = a.user_id WHERE a.id = $1 FOR UPDATE`,
          [req.params.id]
        )
      ).rows[0];
      if (!a) throw new Error('Account not found');

      const before = { status: a.status, is_locked: a.is_locked };
      let ns = a.status;
      let nl = a.is_locked;
      if (action === 'block') ns = 'blocked';
      else if (action === 'unblock' || action === 'reopen') ns = 'active';
      else if (action === 'close') ns = 'closed';
      else if (action === 'lock') nl = true;
      else if (action === 'unlock') nl = false;
      else ns = 'suspended';

      await client.query(`UPDATE accounts SET status = $1, is_locked = $2 WHERE id = $3`, [ns, nl, req.params.id]);
      await tryInSavepoint(client, 'sp_profile_status', async () => {
        await client.query(`UPDATE profiles SET account_status = $1 WHERE id = $2`, [ns, a.profile_id]);
      });

      return { status: ns, is_locked: nl, profile_id: a.profile_id, before };
    });

    const labels = {
      block: 'blocked', unblock: 'unblocked', close: 'closed', reopen: 'reopened',
      lock: 'locked', unlock: 'unlocked', suspend_deposits: 'suspended', suspend_transfers: 'suspended',
    };
    await createNotification(
      result.profile_id,
      `account_${action}`,
      `Account ${labels[action]}`,
      `Your account has been ${labels[action]}.${req.body.reason ? ` Reason: ${req.body.reason}` : ''}`,
      { account_id: req.params.id, action, reason: req.body.reason }
    );
    if (['lock', 'unlock', 'block', 'unblock'].includes(action)) {
      voidEmail((async () => {
        const contact = await getUserContact(result.profile_id);
        if (contact?.email) {
          await emailAccountLock({
            to: contact.email,
            fullName: contact.full_name,
            locked: ['lock', 'block'].includes(action),
            reason: req.body.reason,
            scope: 'account',
          });
        }
      })());
    }
    await createAuditLog(
      req.user.id, action, 'account', req.params.id,
      result.before, { status: result.status, is_locked: result.is_locked },
      req.body.reason, req.ip
    );

    res.json({ success: true, status: result.status, is_locked: result.is_locked });
  } catch (err) {
    console.error('account status error:', err);
    res.status(400).json({ error: err.message || 'Action failed' });
  }
});

router.post('/api/admin/accounts/:id/adjust', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, reason, description } = req.body || {};
    const raw = typeof amount === 'string' ? String(amount).replace(/,/g, '').trim() : amount;
    const amt = parseFloat(raw);
    if (!Number.isFinite(amt) || amt === 0) {
      return res.status(400).json({ error: 'Valid non-zero amount required' });
    }

    let newBalance;
    let currency;
    let userId;
    let oldBalance;

    await withTransaction(async (client) => {
      const a = (await client.query(`SELECT * FROM accounts WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!a) throw new Error('Account not found');
      if (!a.user_id) throw new Error('Account has no owner (user_id is null)');

      userId = a.user_id;
      currency = a.currency || 'GBP';
      oldBalance = parseFloat(a.balance) || 0;
      newBalance = oldBalance + amt;
      if (newBalance < 0) throw new Error('Resulting balance cannot be negative');

      await client.query(`UPDATE accounts SET balance = $1 WHERE id = $2`, [newBalance, req.params.id]);
      await tryInSavepoint(client, 'sp_avail', async () => {
        await client.query(`UPDATE accounts SET available_balance = $1 WHERE id = $2`, [newBalance, req.params.id]);
      });
      await tryInSavepoint(client, 'sp_updated', async () => {
        await client.query(`UPDATE accounts SET updated_at = now() WHERE id = $1`, [req.params.id]);
      });

      const txType = amt > 0 ? 'deposit' : 'withdrawal';
      const desc = description || reason || (amt > 0 ? 'Deposit credited' : 'Withdrawal completed');
      const ref = `ADJ-${Date.now().toString(36).toUpperCase()}`;

      const attempt1 = await tryInSavepoint(client, 'sp_tx1', async () => {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')`,
          [req.params.id, userId, txType, amt, currency, desc, ref]
        );
      });
      if (!attempt1.ok) {
        const attempt2 = await tryInSavepoint(client, 'sp_tx2', async () => {
          await client.query(
            `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.params.id, userId, txType, Math.abs(amt), currency, desc, ref]
          );
        });
        if (!attempt2.ok) {
          await client.query(
            `INSERT INTO transactions (account_id, user_id, type, amount, currency)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.params.id, userId, txType, Math.abs(amt), currency]
          );
        }
      }
    });

    await createNotification(
      userId,
      amt > 0 ? 'balance_credit' : 'balance_debit',
      `Balance ${amt > 0 ? 'credited' : 'debited'}`,
      `${Math.abs(amt).toLocaleString('en-GB')} ${currency} ${amt > 0 ? 'added to' : 'removed from'} your account.`,
      { account_id: req.params.id, amount: amt, reason }
    );
    voidEmail((async () => {
      const contact = await getUserContact(userId);
      if (contact?.email) {
        await emailBalanceAdjust({
          to: contact.email,
          fullName: contact.full_name,
          amount: amt,
          currency,
          credit: amt > 0,
          reason: reason || description,
          newBalance,
        });
      }
    })());
    await createAuditLog(
      req.user?.id,
      'balance_adjust',
      'account',
      req.params.id,
      { balance: oldBalance },
      { balance: newBalance },
      reason || description,
      req.ip
    );

    res.json({ success: true, newBalance, currency });
  } catch (err) {
    console.error('accounts/:id/adjust error:', err);
    res.status(400).json({ error: err.message || 'Adjustment failed' });
  }
});

router.post('/api/admin/accounts/:id/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, amount, description, reference, update_balance, reason } = req.body || {};
    if (!type || amount === undefined) return res.status(400).json({ error: 'Type and amount required' });
    const amt = parseFloat(typeof amount === 'string' ? String(amount).replace(/,/g, '') : amount);
    if (!Number.isFinite(amt)) return res.status(400).json({ error: 'Invalid amount' });

    const result = await withTransaction(async (client) => {
      const a = (await client.query(`SELECT * FROM accounts WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!a) throw new Error('Account not found');
      if (!a.user_id) throw new Error('Account has no owner (user_id is null)');

      let txRow = null;
      const attempt1 = await tryInSavepoint(client, 'sp_tx1', async () => {
        const r = await client.query(
          `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed') RETURNING *`,
          [req.params.id, a.user_id, type, amt, a.currency, description || `Simulated ${type}`, reference || `SIM-${Date.now().toString(36).toUpperCase()}`]
        );
        txRow = r.rows[0];
      });
      if (!attempt1.ok) {
        const r = await client.query(
          `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [req.params.id, a.user_id, type, amt, a.currency, description || `Simulated ${type}`, reference || `SIM-${Date.now().toString(36).toUpperCase()}`]
        );
        txRow = r.rows[0];
      }

      if (update_balance) {
        const nb = (parseFloat(a.balance) || 0) + amt;
        if (nb < 0) throw new Error('Resulting balance cannot be negative');
        await client.query(`UPDATE accounts SET balance = $1 WHERE id = $2`, [nb, req.params.id]);
        await tryInSavepoint(client, 'sp_avail', async () => {
          await client.query(`UPDATE accounts SET available_balance = $1 WHERE id = $2`, [nb, req.params.id]);
        });
      }
      return { transaction: txRow };
    });

    await createAuditLog(
      req.user?.id, 'add_transaction', 'account', req.params.id,
      null, { type, amount: amt, description, update_balance }, reason, req.ip
    );
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('accounts/:id/transactions error:', err);
    res.status(400).json({ error: err.message || 'Failed' });
  }
});

router.get('/api/admin/audit-logs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { target_type, target_id, limit } = req.query;
    let sql = `SELECT al.*, p.full_name as actor_name FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_id`;
    const params = [];
    const conds = [];
    if (target_type) {
      conds.push(`al.target_type = $${params.length + 1}`);
      params.push(target_type);
    }
    if (target_id) {
      conds.push(`al.target_id = $${params.length + 1}`);
      params.push(target_id);
    }
    if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`;
    sql += ` ORDER BY al.created_at DESC LIMIT ${Math.min(parseInt(limit) || 100, 500)}`;
    const { rows } = await query(sql, params);
    res.json({ audit_logs: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});


// Admin: edit customer profile fields
router.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ['full_name', 'email', 'phone', 'address', 'country', 'date_of_birth'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const f of allowed) {
      if (body[f] !== undefined && body[f] !== null) {
        sets.push(`${f} = $${i++}`);
        vals.push(typeof body[f] === 'string' ? body[f].trim() : body[f]);
      }
    }
    if (body.is_locked !== undefined) {
      sets.push(`is_locked = $${i++}`);
      vals.push(!!body.is_locked);
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE profiles SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, email, full_name, phone, address, country, date_of_birth, is_locked, role, created_at`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    await createAuditLog(req.user.id, 'user_edit', 'profile', req.params.id, null, rows[0], body.reason || 'Admin profile edit', req.ip);
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('admin user edit:', err);
    res.status(500).json({ error: err.message || 'Failed to update user' });
  }
});

// Admin: edit account fields (name, type, status)
router.patch('/api/admin/accounts/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    if (body.account_name !== undefined) {
      sets.push(`account_name = $${i++}`);
      vals.push(String(body.account_name).trim());
    }
    if (body.account_type !== undefined) {
      sets.push(`account_type = $${i++}`);
      vals.push(String(body.account_type).trim());
    }
    if (body.status !== undefined) {
      sets.push(`status = $${i++}`);
      vals.push(String(body.status).trim());
    }
    if (body.is_locked !== undefined) {
      sets.push(`is_locked = $${i++}`);
      vals.push(!!body.is_locked);
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE accounts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    await createAuditLog(req.user.id, 'account_edit', 'account', req.params.id, null, rows[0], body.reason || 'Admin account edit', req.ip);
    res.json({ success: true, account: rows[0] });
  } catch (err) {
    console.error('admin account edit:', err);
    res.status(500).json({ error: err.message || 'Failed to update account' });
  }
});


export default router;
