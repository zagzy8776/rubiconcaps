/**
 * Vercel Serverless Function entry point.
 * Do not await migrations before serving — a stuck Aiven pool was taking
 * down every /api request (browser showed Failed to fetch).
 */
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';

let migrationPromise;

async function ensureCoreSchema() {
  // The production Aiven database predates some of the newer optional tables.
  // Registration only needs the core customer/account schema. Do not block the
  // entire API because an optional migration has an incompatible legacy FK.
  await query('SELECT 1');

  const required = await query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('profiles', 'accounts', 'activity_log')`
  );

  const columns = new Set(
    required.rows.map((r) => `${r.table_name}.${r.column_name}`)
  );

  for (const name of ['profiles.id', 'profiles.email', 'profiles.password_hash', 'profiles.full_name', 'profiles.role']) {
    if (!columns.has(name)) {
      throw new Error(`Required database column is missing: ${name}`);
    }
  }

  // Registration writes these fields. Add them safely if this is an older DB.
  for (const [column, type] of [
    ['phone', 'TEXT'],
    ['date_of_birth', 'DATE'],
    ['address', 'TEXT'],
    ['country', `TEXT DEFAULT 'GB'`],
  ]) {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }

  for (const name of ['accounts.user_id', 'accounts.account_number', 'accounts.currency', 'accounts.account_name', 'accounts.balance']) {
    if (!columns.has(name)) {
      throw new Error(`Required database column is missing: ${name}`);
    }
  }
}

function ensureMigrations() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      // Optional migrations must not make registration unavailable. The
      // individual migration errors are logged for deployment diagnostics.
      console.error('Optional migration error:', {
        code: err?.code,
        message: err?.message,
        constraint: err?.constraint,
        detail: err?.detail,
      });
      migrationPromise = undefined;
    });
  }
  return migrationPromise;
}

export default async function handler(req, res) {
  try {
    await ensureCoreSchema();
    // Start optional migrations after the core schema is verified. They are
    // intentionally non-blocking because legacy production schemas may differ.
    void ensureMigrations();
  } catch (err) {
    console.error('Core database initialization failed:', {
      code: err?.code,
      message: err?.message,
      constraint: err?.constraint,
      detail: err?.detail,
    });
    return res.status(503).json({
      error: 'Core database is unavailable. Please try again shortly.',
    });
  }
  return app(req, res);
}
