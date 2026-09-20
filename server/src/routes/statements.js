/**
 * Account statement PDF download.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../auth.js';
import { buildStatementPdf } from '../pdfStatement.js';

const router = Router();

function periodLabel(from, to) {
  const fmt = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;
  const a = fmt(from);
  const b = fmt(to);
  if (a && b) return `${a} – ${b}`;
  if (b) return `Until ${b}`;
  if (a) return `From ${a}`;
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// GET /api/accounts/:id/statement.pdf?from=&to=
router.get('/api/accounts/:id/statement.pdf', authMiddleware, async (req, res) => {
  try {
    const accountId = req.params.id;
    const { from, to } = req.query || {};

    const { rows: accounts } = await query(
      `SELECT id, account_number, account_name, currency, balance, routing_number, user_id
       FROM accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.user.id]
    );
    if (!accounts[0]) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const account = accounts[0];

    const { rows: profiles } = await query(
      `SELECT full_name, email FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    const profile = profiles[0] || {};

    const params = [accountId];
    let sql = `
      SELECT id, amount, currency, type, description, reference, status, created_at
      FROM transactions
      WHERE account_id = $1
    `;
    if (from) {
      params.push(from);
      sql += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND created_at <= $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;

    let transactions = [];
    try {
      transactions = (await query(sql, params)).rows;
    } catch {
      // Fallback if columns differ
      try {
        transactions = (
          await query(
            `SELECT id, amount, currency, type, description, status, created_at
             FROM transactions WHERE account_id = $1
             ORDER BY created_at DESC LIMIT 200`,
            [accountId]
          )
        ).rows;
      } catch (e) {
        console.error('statement tx fetch:', e.message);
      }
    }

    const label = periodLabel(from, to);
    const pdf = buildStatementPdf({
      fullName: profile.full_name,
      email: profile.email,
      account,
      transactions,
      periodLabel: label,
    });

    const filename = `rubicon-statement-${account.currency || 'account'}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('statement.pdf:', err);
    res.status(500).json({ error: 'Failed to generate statement' });
  }
});

export default router;
