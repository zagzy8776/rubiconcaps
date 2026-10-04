/**
 * Transfer routes — 12-digit + legacy SIM numbers.
 */
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authMiddleware, adminMiddleware } from '../auth.js';
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
  accountId, userId, type, amount, currency, description, reference, status = 'completed',
}) {
  const abs = Math.abs(Number(amount));
  if (!(abs > 0)) throw new Error('Invalid ledger amount');
  const st = status || 'completed';
  const typeAttempts = [type];
  if (type === 'transfer_out') typeAttempts.push('withdrawal', 'transfer', 'debit');
  if (type === 'transfer_in') typeAttempts.push('deposit', 'transfer', 'credit');
  for (let i = 0; i < typeAttempts.length; i++) {
    const t = typeAttempts[i];
    const a1 = await tryInSavepoint(client, `${spPrefix}_a${i}`, async () => {
      return client.query(
        `INSERT INTO transactions (account_id, user_id, type, amount, currency, description, reference, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [accountId, userId, t, abs, currency, description, reference, st]
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

      // Prefer counterparty names on the ledger (not raw account numbers)
      let senderName = null;
      try {
        const sn = await client.query(`SELECT full_name FROM profiles WHERE id = $1`, [req.user.id]);
        senderName = (sn.rows[0]?.full_name || '').trim() || null;
      } catch { /* ignore */ }
      let recipientName = null;
      if (recipient?.user_id) {
        try {
          const rn = await client.query(`SELECT full_name FROM profiles WHERE id = $1`, [recipient.user_id]);
          recipientName = (rn.rows[0]?.full_name || '').trim() || null;
        } catch { /* ignore */ }
      }
      if (!recipientName && recipient?.account_name) {
        recipientName = String(recipient.account_name).trim() || null;
      }

      // Hold: debit sender immediately; transfer stays pending until admin releases or blocks.
      // Env TRANSFER_AUTO_COMPLETE=true completes internal transfers instantly (legacy behaviour).
      const autoComplete = String(process.env.TRANSFER_AUTO_COMPLETE || '').toLowerCase() === 'true';
      const transferType = recipient ? 'INTERNAL_TRANSFER' : 'EXTERNAL_TRANSFER';
      const initialStatus = autoComplete && recipient ? 'completed' : 'pending';

      await client.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [amt, from_account_id]);
      await tryInSavepoint(client, 'sp_avail_out', async () => {
        await client.query(
          `UPDATE accounts SET available_balance = COALESCE(available_balance, balance) - $1 WHERE id = $2`,
          [amt, from_account_id]
        );
      });

      const baseRef = (reference && String(reference).trim()) || `TRF-${Date.now().toString(36).toUpperCase()}`;
      const ref = `${baseRef}|to:${cleanTo}`;
      const toLabel = recipientName || cleanTo;
      const fromLabel = senderName || sender.account_number;
      // Keep account number in description suffix only for admin matching; primary label is the name
      const descOut = `Transfer to ${toLabel}${reference ? ` · ${reference}` : ''}`;
      const senderTx = await insertLedger(client, 'sp_out', {
        accountId: from_account_id,
        userId: req.user.id,
        type: 'transfer_out',
        amount: amt,
        currency: sender.currency,
        description: descOut,
        reference: ref,
        status: initialStatus,
      });

      let recipientTx = null;
      if (recipient && initialStatus === 'completed') {
        await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amt, recipient.id]);
        await tryInSavepoint(client, 'sp_avail_in', async () => {
          await client.query(
            `UPDATE accounts SET available_balance = COALESCE(available_balance, balance) + $1 WHERE id = $2`,
            [amt, recipient.id]
          );
        });
        const descIn = `Transfer from ${fromLabel}${reference ? ` · ${reference}` : ''}`;
        recipientTx = await insertLedger(client, 'sp_in', {
          accountId: recipient.id,
          userId: recipient.user_id,
          type: 'transfer_in',
          amount: amt,
          currency: recipient.currency,
          description: descIn,
          reference: ref,
          status: 'completed',
        });
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
        status: initialStatus,
        recipientAccountId: recipient?.id || null,
      };
      return {
        transfer: senderTx.rows[0],
        recipientTx: recipientTx?.rows[0] || null,
        transferType,
        status: initialStatus,
        held: initialStatus === 'pending',
        senderBalance: senderBal.rows[0]?.balance,
        currency: sender.currency,
        message:
          initialStatus === 'pending'
            ? 'Transfer submitted and is pending review. Funds are on hold until released.'
            : 'Transfer completed.',
      };
    });

    if (notifyPayload) {
      const pending = notifyPayload.status === 'pending';
      if (!pending && notifyPayload.recipientUserId) {
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
        pending ? 'transfer_pending' : 'transfer_sent',
        pending ? 'Transfer pending review' : 'Transfer successful',
        pending
          ? `Your transfer of ${notifyPayload.amt.toLocaleString('en-GB')} ${notifyPayload.currency} to ${notifyPayload.toNumber} is pending review. Funds are on hold.`
          : `You sent ${notifyPayload.amt.toLocaleString('en-GB')} ${notifyPayload.currency} to ${notifyPayload.toNumber}.`,
        { amount: notifyPayload.amt, to: notifyPayload.toNumber, reference: notifyPayload.ref, status: notifyPayload.status }
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


// ---------- Admin: list / release / block held transfers ----------
router.get('/api/admin/transfers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const status = String(req.query.status || 'pending').toLowerCase();
    let sql = `
      SELECT t.*, a.account_number AS from_account_number, a.currency AS account_currency,
             p.full_name AS customer_name, p.email AS customer_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      LEFT JOIN profiles p ON p.id = t.user_id
      WHERE t.type IN ('transfer_out', 'transfer', 'withdrawal')
    `;
    const params = [];
    if (status !== 'all') {
      params.push(status);
      sql += ` AND COALESCE(t.status, 'completed') = $1`;
    }
    sql += ` ORDER BY t.created_at DESC LIMIT 200`;
    const { rows } = await query(sql, params);
    res.json({ transfers: rows });
  } catch (err) {
    console.error('admin transfers list:', err);
    res.status(500).json({ error: 'Failed to load transfers' });
  }
});

router.patch('/api/admin/transfers/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const action = String(req.body?.status || req.body?.action || '').toLowerCase();
    // completed | released | approve → release hold
    // rejected | blocked | block → refund sender
    if (!['completed', 'released', 'approved', 'approve', 'rejected', 'blocked', 'block'].includes(action)) {
      return res.status(400).json({ error: 'status must be completed (release) or blocked/rejected' });
    }
    const release = ['completed', 'released', 'approved', 'approve'].includes(action);
    const finalStatus = release ? 'completed' : (action === 'blocked' || action === 'block' ? 'blocked' : 'rejected');
    const adminNote = req.body?.admin_note ? String(req.body.admin_note).slice(0, 500) : null;

    const result = await withTransaction(async (client) => {
      const txRes = await client.query(
        `SELECT * FROM transactions WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      const tx = txRes.rows[0];
      if (!tx) throw new Error('Transfer not found');
      if (String(tx.status || '').toLowerCase() !== 'pending') {
        throw new Error(`Transfer is already ${tx.status || 'completed'}`);
      }

      const amount = Math.abs(parseFloat(tx.amount) || 0);
      if (!(amount > 0)) throw new Error('Invalid transfer amount');

      // Destination account: prefer reference marker, then description, then trailing digits
      let toNumber = null;
      const refStr = String(tx.reference || '');
      const refTo = refStr.match(/\|to:([A-Z0-9-]+)/i) || refStr.match(/to:([A-Z0-9-]+)/i);
      if (refTo) toNumber = refTo[1];
      if (!toNumber) {
        const toMatch = String(tx.description || '').match(/Transfer to ([A-Z0-9-]{8,})/i);
        toNumber = toMatch?.[1] || null;
      }
      if (!toNumber) {
        const digits = String(tx.description || '').match(/\b(\d{10,14})\b/);
        toNumber = digits?.[1] || null;
      }

      if (release) {
        // Credit recipient if on-platform
        if (toNumber) {
          const recip = await client.query(
            `SELECT * FROM accounts WHERE account_number = $1 FOR UPDATE`,
            [toNumber]
          );
          const recipient = recip.rows[0];
          if (recipient) {
            await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, recipient.id]);
            await tryInSavepoint(client, 'sp_rel_avail', async () => {
              await client.query(
                `UPDATE accounts SET available_balance = COALESCE(available_balance, balance) + $1 WHERE id = $2`,
                [amount, recipient.id]
              );
            });
            let fromLabel = null;
            try {
              const sn = await client.query(
                `SELECT p.full_name, a.account_number FROM accounts a
                 LEFT JOIN profiles p ON p.id = a.user_id WHERE a.id = $1`,
                [tx.account_id]
              );
              fromLabel = (sn.rows[0]?.full_name || '').trim() || sn.rows[0]?.account_number || null;
            } catch { /* ignore */ }
            await insertLedger(client, 'sp_rel_in', {
              accountId: recipient.id,
              userId: recipient.user_id,
              type: 'transfer_in',
              amount,
              currency: recipient.currency || tx.currency,
              description: `Transfer from ${fromLabel || 'account'}`,
              reference: tx.reference,
              status: 'completed',
            });
          }
        }
        await client.query(
          `UPDATE transactions SET status = 'completed', description = CASE
             WHEN $2::text IS NOT NULL AND $2 <> '' THEN description || ' · ' || $2
             ELSE description END
           WHERE id = $1`,
          [tx.id, adminNote]
        );
      } else {
        // Block / reject — refund sender
        await client.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [amount, tx.account_id]);
        await tryInSavepoint(client, 'sp_ref_avail', async () => {
          await client.query(
            `UPDATE accounts SET available_balance = COALESCE(available_balance, balance) + $1 WHERE id = $2`,
            [amount, tx.account_id]
          );
        });
        await client.query(
          `UPDATE transactions SET status = $2, description = CASE
             WHEN $3::text IS NOT NULL AND $3 <> '' THEN description || ' · ' || $3
             ELSE description || ' · ' || $2 END
           WHERE id = $1`,
          [tx.id, finalStatus, adminNote]
        );
      }

      return { tx, amount, finalStatus, toNumber };
    });

    // Notify sender
    if (result?.tx?.user_id) {
      const verb = release ? 'released' : 'blocked';
      await createNotification(
        result.tx.user_id,
        release ? 'transfer_released' : 'transfer_blocked',
        release ? 'Transfer released' : 'Transfer blocked',
        release
          ? `Your transfer of ${result.amount} has been completed.`
          : `Your transfer of ${result.amount} was ${result.finalStatus}. Funds have been returned to your account.`,
        { transfer_id: result.tx.id, status: result.finalStatus }
      ).catch(() => {});
    }

    res.json({ success: true, status: result.finalStatus, transfer_id: req.params.id });
  } catch (err) {
    console.error('admin transfer review:', err);
    res.status(400).json({ error: err.message || 'Could not update transfer' });
  }
});

export default router;
