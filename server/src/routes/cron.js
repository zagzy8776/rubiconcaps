/**
 * External cron endpoints (cron-job.org, EasyCron, etc.)
 * Set CRON_SECRET in env. Call with:
 *   Authorization: Bearer <CRON_SECRET>
 *   or header x-cron-secret: <CRON_SECRET>
 *
 * Keep-alive (prevents Aiven Postgres from sleeping):
 *   GET/POST https://www.rubiconcapital.org/api/cron/keepalive
 *   every 5–10 minutes
 *
 * Daily digest:
 *   GET/POST https://www.rubiconcapital.org/api/cron/daily-digest
 */
import { Router } from 'express';
import { query } from '../db.js';
import { emailAdminDigest } from '../email.js';

const router = Router();

function authorizeCron(req, res, next) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET not configured on server' });
  }
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const alt = req.headers['x-cron-secret'];
  if (bearer === secret || alt === secret) return next();
  return res.status(401).json({ error: 'Unauthorized cron request' });
}

/**
 * Cheap DB touch – forces Aiven to stay awake.
 * Also warms the Vercel/serverless function.
 */
async function runKeepalive(req, res) {
  const started = Date.now();
  try {
    const r = await query('SELECT 1 AS ok, NOW() AS db_time');
    const ms = Date.now() - started;
    res.json({
      ok: true,
      service: 'rubicon-keepalive',
      db: r.rows[0]?.ok === 1,
      db_time: r.rows[0]?.db_time,
      latency_ms: ms,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron keepalive:', err.message);
    res.status(503).json({
      ok: false,
      error: 'Database unreachable',
      detail: err.message,
      at: new Date().toISOString(),
    });
  }
}

async function runDailyDigest(req, res) {
  try {
    const to = (req.body?.to || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || '').toLowerCase();
    if (!to) return res.status(400).json({ error: 'No ADMIN_EMAIL configured' });

    const deposits = await query(
      `SELECT dr.*, p.full_name as customer_name, p.email as customer_email
       FROM deposit_requests dr
       LEFT JOIN profiles p ON p.id = dr.customer_id
       WHERE dr.status = 'pending'
       ORDER BY dr.created_at ASC LIMIT 50`
    ).catch(() => ({ rows: [] }));

    const pendingReq = await query(
      `SELECT COUNT(*)::int as c FROM account_requests WHERE status = 'pending'`
    ).catch(() => ({ rows: [{ c: 0 }] }));

    const locked = await query(
      `SELECT COUNT(*)::int as c FROM accounts WHERE is_locked = true OR status IN ('blocked','closed')`
    ).catch(() => ({ rows: [{ c: 0 }] }));

    await emailAdminDigest({
      to,
      pendingDeposits: deposits.rows,
      pendingRequests: pendingReq.rows[0]?.c || 0,
      lockedAccounts: locked.rows[0]?.c || 0,
      when: new Date().toUTCString(),
    });

    res.json({
      success: true,
      sent_to: to,
      pending_deposits: deposits.rows.length,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('cron digest:', err);
    res.status(500).json({ error: 'Digest failed' });
  }
}

router.get('/api/cron/daily-digest', authorizeCron, runDailyDigest);
router.post('/api/cron/daily-digest', authorizeCron, runDailyDigest);

// Real keep-alive: hits Postgres so Aiven never sleeps
router.get('/api/cron/keepalive', authorizeCron, runKeepalive);
router.post('/api/cron/keepalive', authorizeCron, runKeepalive);

// Alias – same behaviour (old clients still work)
router.get('/api/cron/health', authorizeCron, runKeepalive);
router.post('/api/cron/health', authorizeCron, runKeepalive);

export default router;
