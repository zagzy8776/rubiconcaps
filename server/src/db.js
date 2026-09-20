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
    || /connection slots/i.test(msg);
}

if (!globalForPg.__pgPool) {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  globalForPg.__pgPool = new pg.Pool({
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
    idleTimeoutMillis: serverless ? 5000 : 20000,
    connectionTimeoutMillis: 8000,
    allowExitOnIdle: true,
  });
  globalForPg.__pgPool.on('error', (err) => {
    console.error('pg pool idle client error:', err.message);
  });
}

const pool = globalForPg.__pgPool;

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 200) {
      console.log('Slow query', { text: text.slice(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    if (isPoolExhausted(err)) {
      const clean = new Error('Database is busy. Wait a few seconds and try again.');
      clean.status = 503;
      throw clean;
    }
    throw err;
  }
}

export async function withTransaction(callback) {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    if (isPoolExhausted(err)) {
      const clean = new Error('Database is busy. Wait a few seconds and try again.');
      clean.status = 503;
      throw clean;
    }
    throw err;
  }
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    if (isPoolExhausted(e)) {
      const clean = new Error('Database is busy. Wait a few seconds and try again.');
      clean.status = 503;
      throw clean;
    }
    throw e;
  } finally {
    client.release();
  }
}

export default pool;
