/**
 * Vercel Serverless Function entry point.
 * Do not await migrations before serving — a stuck Aiven pool was taking
 * down every /api request (browser showed Failed to fetch).
 */
import app from '../server/src/index.js';
import { runMigrations } from '../server/src/migrations.js';

let migrationsStarted = false;

function kickMigrations() {
  if (migrationsStarted) return;
  migrationsStarted = true;
  runMigrations().catch((err) => {
    console.error('Migration error:', err.message);
  });
}

export default async function handler(req, res) {
  kickMigrations();
  return app(req, res);
}
