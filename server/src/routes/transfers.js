/**
 * Transfer routes — 12-digit + legacy SIM numbers.
 */
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authMiddleware } from '../auth.js';
import { createNotification } from '../helpers.js';
import { assertTransactionPin } from './pin.js';
import {
  getUserContact,
  emailTransferSent,
  emailTransferReceived,
  emailTransferFailed,
  voidEmail,
} from '../email.js';

const router = Router();

function isValidAccountNumber(num) {
  const n = String(num || '').replace(/\s+/g, '').trim();
  if (/^\d{10,14}$/.test(n)) return n;
  if (/^SIM-[A-Z]{3}-\d{8}$/i.test(n)) return n.toUpperCase();
  return null;
}

async function tryInSavepoint(client, name, fn) {
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, result };
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    console.warn(`savepoint ${name}:`, err.message);
    return { ok: false, error: err };
  }
}

async function insertLedger(client, spPrefix, {
  accountId, userId, type, amount, currency, description, reference,
}) {
  const abs = Math.abs(Number(amount));
  if (!(abs > 0)) throw new Error('Invalid ledger amount');
  const typeAttempts = [type];
  if (type === 'transfer_out') typeAttempts.push('withdrawal', 'transfer', 'debit');
  if (type === 'transfer_in') typeAttempts.push('deposit', 'transfer', 'credit');
  for (let i = 0; i < typeAttempts.length; i++) {
    const t = typeAttempts[i];
    const a1 = await tryInSavepoint(client, `${spPrefix}_a${i}`, async () => {
      return client.query(
        `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed') RETURNING *`,
        [accountId, userId, t, abs, currency, description, reference]
      );
    });
    if (a1.ok) return a1.result;
    const a2 = await tryInSavepoint(client, `${spPrefix}_b${i}`, async () => {
      return client.query(
        `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [accountId, userId, t, abs, currency, description, reference]
      );
    });
    if (a2.ok) return a2.result;
  }
  throw new Error('Could not record transfer on the ledger');
}

router.post('/api/transfers', authMiddleware, async (req, res) => {
  try {
    const { from_account_id, to_account_number, amount, reference } = req.body || {};

    const pinCheck = await assertTransactionPin(req.user.id, req.body?.transaction_pin ?? req.body?.pin);
    if (!pinCheck.ok) {
      return res.status(401).json({ error: pinCheck.error, pin_required: true });
    }
    if (!from_account_id || !to_account_number || amount === undefined) {
      return res.status(400).json({ error: 'Sender account, recipient account number, and amount are required' });
    }
    const amt = parseFloat(typeof amount === 'string' ? String(amount).replace(/,/g, '') : amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }
    const cleanTo = isValidAccountNumber(to_account_number);
    if (!cleanTo) {
      return res.status(400).json({ error: 'Invalid recipient account number. Use a 12-digit number.' });
    }

    let notifyPayload = null;
    const result = await withTransaction(async (client) => {
      const senderRes = await client.query(
        `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [from_account_id, req.user.id]
      );
      if (!senderRes.rows.length) throw new Error('Sender account not found');
      const sender = senderRes.rows[0];
      if (sender.is_locked || (sender.status && sender.status !== 'active')) {
        throw new Error('Your account is not active');
      }
      const bal = parseFloat(sender.balance) || 0;
      const availRaw = sender.available_balance;
      const avail = availRaw == null ? NaN : parseFloat(availRaw);
      const spendable = Number.isFinite(avail) ? avail : bal;
      if (spendable < amt) throw new Error('Insufficient balance');

      const recipientRes = await client.query(
        `SELECT * FROM accounts WHERE account_number = $1 FOR UPDATE`,
        [cleanTo]
      );
      const recipient = recipientRes.rows[0] || null;
      if (recipient && recipient.id === sender.id) throw new Error('Cannot transfer to the same account');
      if (recipient && recipient.currency !== sender.currency) {
        throw new Error(`Currency mismatch: your account is ${sender.currency}, recipient is ${recipient.currency}`);
      }
      if (recipient && (recipient.is_locked || (recipient.status && recipient.status !== 'active'))) {
        throw new Error('Recipient account is not active');
      }

      await client.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [amt, from_account_id]);
      await tryInSavepoint(client, 'sp_avail_out', async () => {
        await client.query(
          `UPDATE accounts SET available_balance = COALESCE(available_balance, balance) - $1 WHERE id = $2`,
          [amt, from_account_id]
        );
      });

      const ref = (reference && String(reference).trim()) || `TRF-${Date.now().toString(36).toUpperCase()}`;
      const descOut = `Transfer to ${cleanTo}${reference ? ` · ${reference}` : ''}`;
      const senderTx = await insertLedger(client, 'sp_out', {
        accountId: from_account_id,
        userId: req.user.id,
        type: 'transfer_out',
        amount: amt,
        currency: sender.currency,
        description: descOut,
        reference: ref,
      });

      let recipientTx = null;
      let transferType = 'EXTERNAL_TRANSFER';
      if (recipient) {
        await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amt, recipient.id]);
        await tryInSavepoint(client, 'sp_avail_in', async () => {
          await client.query(
            `UPDATE accounts SET available_balance = COALESCE(available_balance, balance) + $1 WHERE id = $2`,
            [amt, recipient.id]
          );
        });
        const descIn = `Transfer from ${sender.account_number}${reference ? ` · ${reference}` : ''}`;
        recipientTx = await insertLedger(client, 'sp_in', {
          accountId: recipient.id,
          userId: recipient.user_id,
          type: 'transfer_in',
          amount: amt,
          currency: recipient.currency,
          description: descIn,
          reference: ref,
        });
        transferType = 'INTERNAL_TRANSFER';
      }

      const senderBal = await client.query(`SELECT balance FROM accounts WHERE id = $1`, [from_account_id]);
      notifyPayload = {
        recipientUserId: recipient?.user_id || null,
        senderUserId: req.user.id,
        amt,
        currency: sender.currency,
        fromNumber: sender.account_number,
        toNumber: cleanTo,
        transferType,
        ref,
      };
      return {
        transfer: senderTx.rows[0],
        recipientTx: recipientTx?.rows[0] || null,
        transferType,
        senderBalance: senderBal.rows[0]?.balance,
        currency: sender.currency,
      };
    });

    if (notifyPayload) {
      if (notifyPayload.recipientUserId) {
        await createNotification(
          notifyPayload.recipientUserId,
          'transfer_received',
          'Transfer received',
          `You received ${notifyPayload.amt.toLocaleString('en-GB')} ${notifyPayload.currency} from ${notifyPayload.fromNumber}.`,
          { amount: notifyPayload.amt, from: notifyPayload.fromNumber, reference: notifyPayload.ref }
        ).catch(() => {});
      }
      await createNotification(
        notifyPayload.senderUserId,
        'transfer_sent',
        'Transfer successful',
        `You sent ${notifyPayload.amt.toLocaleString('en-GB')} ${notifyPayload.currency} to ${notifyPayload.toNumber}.`,
        { amount: notifyPayload.amt, to: notifyPayload.toNumber, reference: notifyPayload.ref }
      ).catch(() => {});

      const when = new Date().toUTCString();
      voidEmail((async () => {
        const sender = await getUserContact(notifyPayload.senderUserId);
        if (sender?.email) {
          await emailTransferSent({
            to: sender.email,
            fullName: sender.full_name,
            amount: notifyPayload.amt,
            currency: notifyPayload.currency,
            toAccount: notifyPayload.toNumber,
            reference: notifyPayload.ref,
            when,
          });
        }
        if (notifyPayload.recipientUserId) {
          const recipient = await getUserContact(notifyPayload.recipientUserId);
          if (recipient?.email) {
            await emailTransferReceived({
              to: recipient.email,
              fullName: recipient.full_name,
              amount: notifyPayload.amt,
              currency: notifyPayload.currency,
              fromAccount: notifyPayload.fromNumber,
              reference: notifyPayload.ref,
              when,
            });
          }
        }
      })());
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('transfer error:', err);
    voidEmail((async () => {
      try {
        const contact = await getUserContact(req.user?.id);
        if (contact?.email) {
          await emailTransferFailed({
            to: contact.email,
            fullName: contact.full_name,
            amount: req.body?.amount,
            currency: undefined,
            toAccount: req.body?.to_account_number,
            reason: err.message || 'Transfer failed',
          });
        }
      } catch (_) {}
    })());
    res.status(400).json({ error: err.message || 'Transfer failed' });
  }
});

router.get('/api/transfers', authMiddleware, async (req, res) => {
  try {
    const account_id = req.query.account_id;
    let sql = `SELECT t.*, a.account_number, a.currency as account_currency
               FROM transactions t
               JOIN accounts a ON a.id = t.account_id
               WHERE a.user_id = $1
                 AND (
                   t.type IN ('transfer', 'transfer_out', 'transfer_in', 'withdrawal', 'deposit')
                   OR t.description ILIKE '%transfer%'
                 )`;
    const params = [req.user.id];
    if (account_id) {
      sql += ` AND t.account_id = $2`;
      params.push(account_id);
    }
    sql += ` ORDER BY t.created_at DESC LIMIT 100`;
    const { rows } = await query(sql, params);
    res.json({ transfers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

export default router;
