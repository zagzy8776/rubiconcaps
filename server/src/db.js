import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.VERCEL) {
  dotenv.config({ path: join(__dirname, '../../.env') });
}

const globalForPg = globalThis;

function isPoolExhausted(err) {
  const msg = String(err?.message || '');
  return /remaining connection slots are reserved/i.test(msg)
    || /too many connections/i.test(msg)
    || /connection slots/i.test(msg)
    || /timeout expired/i.test(msg)
    || /Connection terminated/i.test(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Normalize a Postgres connection string for node-pg on Vercel.
 * - Forces sslmode=no-verify (we also set ssl.rejectUnauthorized = false)
 * - Drops channel_binding
 */
function normalizeConnectionString(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    u.searchParams.delete('channel_binding');
    u.searchParams.set('sslmode', 'no-verify');
    return u.toString();
  } catch {
    let s = String(raw)
      .replace(/[?&]sslmode=[^&]*/gi, '')
      .replace(/[?&]ssl=[^&]*/gi, '')
      .replace(/[?&]channel_binding=[^&]*/gi, '')
      .replace(/\?&/, '?')
      .replace(/&&+/g, '&')
      .replace(/[?&]$/, '');
    const join = s.includes('?') ? '&' : '?';
    return `${s}${join}sslmode=no-verify`;
  }
}

function buildConfig() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const connectionString = normalizeConnectionString(raw);
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  return {
    ...(connectionString
      ? { connectionString }
      : {
          host: process.env.PGHOST,
          port: parseInt(process.env.PGPORT || '5432', 10),
          database: process.env.PGDATABASE,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
        }),
    ssl: { rejectUnauthorized: false },
    max: serverless ? 1 : 3,
    min: 0,
    idleTimeoutMillis: serverless ? 4000 : 20000,
    connectionTimeoutMillis: 12000,
    allowExitOnIdle: true,
  };
}

if (!globalForPg.__pgPool) {
  globalForPg.__pgPool = new pg.Pool(buildConfig());
  globalForPg.__pgPool.on('error', (err) => {
    console.error('pg pool idle client error:', err.message);
  });
}

const pool = globalForPg.__pgPool;

export async function query(text, params) {
  const start = Date.now();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 200) {
        console.log('Slow query', { text: text.slice(0, 80), duration, rows: res.rowCount });
      }
      return res;
    } catch (err) {
      lastErr = err;
      if ((isPoolExhausted(err) || /self-signed certificate/i.test(err.message)) && attempt === 0) {
        await sleep(400);
        continue;
      }
      break;
    }
  }
  if (isPoolExhausted(lastErr)) {
    const clean = new Error('Database is busy. Wait a few seconds and try again.');
    clean.status = 503;
    throw clean;
  }
  throw lastErr;
}

export async function withTransaction(callback) {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    if (isPoolExhausted(err)) {
      await sleep(600);
      client = await pool.connect();
    } else {
      throw err;
    }
  }
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    if (client) client.release();
  }
}

export default pool;
