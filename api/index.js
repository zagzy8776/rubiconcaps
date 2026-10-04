/**
 * Vercel Serverless Function entry point.
 * Keeps production API available even when the legacy Aiven schema is missing
 * newer optional fields/tables. Core auth/account columns are bootstrapped
 * safely before the Express handler runs.
 */
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';

let migrationPromise;

async function addColumn(table, column, definition) {
  await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
}

async function ensureCoreSchema() {
  // 1) Prove the database connection works before touching the schema.
  await query('SELECT 1');

  // 2) The original Rubicon database predates this repo in production.
  //    Create missing core tables, but never replace an existing table.
  await query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_locked BOOLEAN NOT NULL DEFAULT false,
      phone TEXT,
      date_of_birth DATE,
      address TEXT,
      country TEXT DEFAULT 'GB',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login TIMESTAMPTZ,
      avatar_url TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      account_number TEXT,
      currency TEXT,
      account_name TEXT,
      balance NUMERIC(24,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      is_locked BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      action TEXT NOT NULL,
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // 3) Add all columns registration/account creation can actually use.
  //    These statements are idempotent and safe on the legacy schema.
  const profileColumns = [
    ['id', 'UUID DEFAULT gen_random_uuid()'],
    ['email', 'TEXT'],
    ['password_hash', 'TEXT'],
    ['full_name', 'TEXT'],
    ['role', `TEXT DEFAULT 'user'`],
    ['is_locked', 'BOOLEAN DEFAULT false'],
    ['phone', 'TEXT'],
    ['date_of_birth', 'DATE'],
    ['address', 'TEXT'],
    ['country', `TEXT DEFAULT 'GB'`],
    ['created_at', 'TIMESTAMPTZ DEFAULT now()'],
    ['last_login', 'TIMESTAMPTZ'],
    ['avatar_url', 'TEXT'],
  ];
  for (const [column, definition] of profileColumns) {
    await addColumn('profiles', column, definition);
  }

  const accountColumns = [
    ['id', 'UUID DEFAULT gen_random_uuid()'],
    ['user_id', 'UUID'],
    ['account_number', 'TEXT'],
    ['currency', 'TEXT'],
    ['account_name', 'TEXT'],
    ['balance', 'NUMERIC(24,2) DEFAULT 0'],
    ['status', `TEXT DEFAULT 'active'`],
    ['is_locked', 'BOOLEAN DEFAULT false'],
    ['created_at', 'TIMESTAMPTZ DEFAULT now()'],
    ['updated_at', 'TIMESTAMPTZ DEFAULT now()'],
    ['account_type', `TEXT DEFAULT 'current'`],
    ['routing_number', 'TEXT'],
  ];
  for (const [column, definition] of accountColumns) {
    await addColumn('accounts', column, definition);
  }

  const activityColumns = [
    ['id', 'UUID DEFAULT gen_random_uuid()'],
    ['user_id', 'UUID'],
    ['action', 'TEXT'],
    ['description', 'TEXT'],
    ['metadata', 'JSONB'],
    ['created_at', 'TIMESTAMPTZ DEFAULT now()'],
  ];
  for (const [column, definition] of activityColumns) {
    await addColumn('activity_log', column, definition);
  }

  // 4) Verify only the columns required by /api/auth/register itself.
  const required = await query(
    `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('profiles', 'accounts')
        AND column_name IN (
          'id','email','password_hash','full_name','role',
          'user_id','account_number','currency','account_name','balance'
        )`
  );

  const columns = new Map(
    required.rows.map((r) => [
      `${r.table_name}.${r.column_name}`,
      r,
    ])
  );

  for (const name of [
    'profiles.id',
    'profiles.email',
    'profiles.password_hash',
    'profiles.full_name',
    'profiles.role',
  ]) {
    if (!columns.has(name)) {
      throw new Error(`Required database column is missing: ${name}`);
    }
  }

  // A generated customer id must be UUID because account/session tables use
  // UUID foreign keys throughout the application.
  const profileId = columns.get('profiles.id');
  if (profileId?.udt_name && profileId.udt_name !== 'uuid') {
    throw new Error(`profiles.id must be UUID in production (found ${profileId.udt_name})`);
  }

  for (const name of [
    'accounts.id',
    'accounts.user_id',
    'accounts.account_number',
    'accounts.currency',
    'accounts.account_name',
    'accounts.balance',
  ]) {
    if (!columns.has(name)) {
      throw new Error(`Required database column is missing: ${name}`);
    }
  }
}

function ensureMigrations() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      // Optional migrations must never take registration offline. Keep the
      // exact PostgreSQL diagnostics in Vercel logs for follow-up repair.
      console.error('Optional migration error:', {
        code: err?.code,
        message: err?.message,
        constraint: err?.constraint,
        detail: err?.detail,
        table: err?.table,
        column: err?.column,
      });
      migrationPromise = undefined;
    });
  }
  return migrationPromise;
}

export default async function handler(req, res) {
  try {
    await ensureCoreSchema();
    // Start optional migrations only after the core auth/account schema is usable.
    // They are intentionally non-blocking for legacy production databases.
    void ensureMigrations();
  } catch (err) {
    console.error('Core database initialization failed:', {
      code: err?.code,
      message: err?.message,
      constraint: err?.constraint,
      detail: err?.detail,
      table: err?.table,
      column: err?.column,
    });
    return res.status(503).json({
      error: 'Core database is unavailable. Please try again shortly.',
    });
  }
  return app(req, res);
}
