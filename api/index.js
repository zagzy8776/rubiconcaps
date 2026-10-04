/**
 * Vercel Serverless Function entry point.
 * Do not await migrations before serving — a stuck Aiven pool was taking
 * down every /api request (browser showed Failed to fetch).
 */
import app from '../server/src/index.js';
import { runMigrations } from '../server/src/migrations.js';

let migrationPromise;

function ensureMigrations() {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      console.error('Migration error:', err);
      migrationPromise = undefined;
      throw err;
    });
  }
  return migrationPromise;
}

export default async function handler(req, res) {
  // Registration and other DB-backed requests must not race the schema bootstrap.
  try {
    await ensureMigrations();
  } catch (err) {
    return res.status(503).json({
      error: 'Database initialization is unavailable. Please try again shortly.',
    });
  }
  return app(req, res);
}
