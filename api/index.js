/**
 * Vercel Serverless Function entry point.
 * Keeps the API available against the legacy Aiven schema. Registration is
 * schema-adaptive, so optional/new columns do not take the whole API offline.
 */
import app from '../server/src/index.js';
import { query } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';

let migrationPromise;

async function ensureCoreSchema() {
  // Do not run DDL on every request. Some production DB roles may not own the
  // legacy tables, and registration does not need optional migrations.
  await query('SELECT 1');

  const result = await query(
    `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'`
  );

  const columns = new Map(
    result.rows.map((r) => [r.column_name, r])
  );

  for (const name of ['id', 'email', 'password_hash', 'full_name']) {
    if (!columns.has(name)) {
      throw new Error(`Required database column is missing: profiles.${name}`);
    }
  }

  const idColumn = columns.get('id');
  if (idColumn?.udt_name && idColumn.udt_name !== 'uuid') {
    // The rest of the Rubicon auth/account model uses UUID foreign keys.
    throw new Error(
      `profiles.id must be UUID in production (found ${idColumn.udt_name})`
    );
  }
}

function ensureMigrations() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      // Optional migrations must never make registration unavailable. Keep the
      // exact PostgreSQL diagnostics in Vercel logs for follow-up repair.
      console.error('Optional migration error:', {
        code: err?.code,
        message: err?.message,
        constraint: err?.constraint,
        detail: err?.detail,
        table: err?.table,
        column: err?.column,
      });
      // Do not retry a known legacy-schema migration failure on every request.
      // A fresh serverless instance can try again naturally.
    });
  }
  return migrationPromise;
}

export default async function handler(req, res) {
  try {
    await ensureCoreSchema();
    // Best-effort optional migrations. Registration is not coupled to them.
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
      error: 'Database is unavailable. Please try again shortly.',
    });
  }
  return app(req, res);
}
