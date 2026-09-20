/**
 * Notification + audit helpers for Rubicon Capital.
 * Hardened so owner admin token (id: admin-owner) never blows up UUID columns.
 */

import { query } from './db.js';
import { buildAccountIdentity } from './bankIdentity.js';

const SYSTEM_ADMIN_UUID = '00000000-0000-0000-0000-000000000001';

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export function currencyFromCountry(country) {
  const c = String(country || 'GB').toUpperCase();
  if (c === 'US') return 'USD';
  if (['DE', 'FR', 'NL', 'IE', 'AT', 'BE', 'IT', 'ES', 'PT', 'FI', 'GR', 'LU'].includes(c)) return 'EUR';
  return 'GBP';
}

/**
 * Guarantee at least one currency wallet for a profile.
 * Signup used to create only a login row; admin then counted clients
 * without a matching accounts row. This closes that gap.
 */
export async function ensurePrimaryAccount(userId, opts = {}) {
  if (!userId || !isUuid(String(userId))) return null;
  const existing = await query(
    `SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const cur = ['GBP', 'USD', 'EUR'].includes(opts.currency)
    ? opts.currency
    : currencyFromCountry(opts.country);

  const identity = await buildAccountIdentity({
    currency: cur,
    account_name: opts.account_name || (opts.fullName ? `${String(opts.fullName).split(' ')[0]} ${cur}` : undefined),
    account_type: 'current',
  });

  try {
    const { rows } = await query(
      `INSERT INTO accounts (user_id, account_number, currency, account_name, account_type, routing_number, balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'active') RETURNING *`,
      [userId, identity.account_number, cur, identity.account_name, identity.account_type, identity.routing_number]
    );
    await query(
      `INSERT INTO activity_log (user_id, action, description, metadata) VALUES ($1, 'create_account', $2, $3)`,
      [userId, `Opened ${cur} account ${identity.account_number}`, JSON.stringify({ account_id: rows[0].id, auto: true })]
    ).catch(() => {});
    return rows[0];
  } catch (err) {
    console.warn('ensurePrimaryAccount full insert failed, retrying minimal:', err.message);
    try {
      const { rows } = await query(
        `INSERT INTO accounts (user_id, account_number, currency, account_name, balance)
         VALUES ($1, $2, $3, $4, 0) RETURNING *`,
        [userId, identity.account_number, cur, identity.account_name]
      );
      return rows[0];
    } catch (err2) {
      console.error('ensurePrimaryAccount failed:', err2.message);
      return null;
    }
  }
}

/** Open a wallet for every profile that still has none. */
export async function backfillMissingAccounts() {
  const { rows } = await query(
    `SELECT p.id, p.full_name, p.country
     FROM profiles p
     WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = p.id)`
  ).catch((err) => {
    console.warn('backfillMissingAccounts list failed:', err.message);
    return { rows: [] };
  });
  let created = 0;
  for (const p of rows) {
    const acct = await ensurePrimaryAccount(p.id, { fullName: p.full_name, country: p.country });
    if (acct) created += 1;
  }
  return { scanned: rows.length, created };
}

export async function createNotification(userId, type, title, message, metadata = null) {
  if (!userId || !isUuid(String(userId))) return; // skip if no real customer
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('createNotification failed (non-fatal):', err.message);
  }
}

export async function createAuditLog(actorId, action, targetType, targetId, beforeData, afterData, reason, ipAddress) {
  const safeActor = isUuid(String(actorId)) ? actorId : SYSTEM_ADMIN_UUID;
  const safeTarget = targetId && isUuid(String(targetId)) ? targetId : null;
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, before_data, after_data, reason, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        safeActor, action, targetType, safeTarget,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
        reason, ipAddress
      ]
    );
  } catch (err) {
    console.error('createAuditLog failed (non-fatal):', err.message);
  }
}
