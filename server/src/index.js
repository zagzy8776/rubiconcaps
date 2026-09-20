import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query, withTransaction } from './db.js';
import {
  signToken, hashPassword, comparePassword,
  authMiddleware, adminMiddleware, getProfile
} from './auth.js';
import { runMigrations } from './migrations.js';
import { createNotification, createAuditLog } from './helpers.js';
import { emailWelcome, emailLoginAlert, emailAdminDigest, voidEmail } from './email.js';
import { buildAccountIdentity } from './bankIdentity.js';
import depositRoutes from './routes/deposits.js';
import transferRoutes from './routes/transfers.js';
import cryptoRoutes from './routes/crypto.js';
import notificationRoutes from './routes/notifications.js';
import sessionRoutes from './routes/sessions.js';
import statementRoutes from './routes/statements.js';
import pinRoutes from './routes/pin.js';
import adminRoutes from './routes/admin.js';
import emailOpsRoutes from './routes/emailOps.js';
import cronRoutes from './routes/cron.js';
import otpAuthRoutes from './routes/otpAuth.js';
import withdrawalRoutes from './routes/withdrawals.js';
import { mountCoreA } from './routes/coreA.js';
import { mountCoreB } from './routes/coreB.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.VERCEL) {
  dotenv.config({ path: join(__dirname, '../../.env') });
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(otpAuthRoutes);
app.use(withdrawalRoutes);
app.use(depositRoutes);
app.use(transferRoutes);
app.use(cryptoRoutes);
app.use(notificationRoutes);
app.use(sessionRoutes);
app.use(statementRoutes);
app.use(pinRoutes);
app.use(adminRoutes);
app.use(emailOpsRoutes);
app.use(cronRoutes);

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, date_of_birth, address, country } = req.body || {};
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Email, password and full name are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const existing = await query('SELECT id FROM profiles WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const password_hash = await hashPassword(password);
    const OWNER_EMAIL = (process.env.OWNER_EMAIL || '').toLowerCase();
    const role = email.toLowerCase() === OWNER_EMAIL ? 'admin' : 'user';
    const { rows } = await query(
      `INSERT INTO profiles (email, password_hash, full_name, role, phone, date_of_birth, address, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, full_name, role, phone, created_at`,
      [
        email.toLowerCase(),
        password_hash,
        String(full_name).trim(),
        role,
        phone ? String(phone).trim() : null,
        date_of_birth || null,
        address ? String(address).trim() : null,
        country ? String(country).trim() : 'GB',
      ]
    );
    const user = rows[0];
    const token = signToken(user);
    await query(`INSERT INTO activity_log (user_id, action, description) VALUES ($1, 'register', 'New user registered')`, [user.id]).catch(() => {});
    voidEmail(emailWelcome({ to: user.email, fullName: user.full_name }));
    res.status(201).json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// login handled by otpAuthRoutes (password → email OTP → session)

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    if (profile.is_locked) return res.status(403).json({ error: 'Account locked. Please contact support.' });
    res.json({ user: profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (!adminEmail || !adminPassword) return res.status(500).json({ error: 'Admin credentials not configured on server' });
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (email.toLowerCase() !== adminEmail || password !== adminPassword) return res.status(401).json({ error: 'Invalid admin credentials' });
    const token = signToken({ id: 'admin-owner', email: adminEmail, role: 'admin' });
    res.json({ token, user: { id: 'admin-owner', email: adminEmail, role: 'admin', full_name: 'Owner' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

app.get('/api/admin/me', authMiddleware, adminMiddleware, async (req, res) => {
  res.json({ user: { id: req.user.id || 'admin-owner', email: req.user.email, role: 'admin', full_name: 'Owner' } });
});

const coreDeps = {
  query, withTransaction, authMiddleware, adminMiddleware, getProfile,
  createNotification, createAuditLog, buildAccountIdentity, signToken,
};
mountCoreA(app, coreDeps);
mountCoreB(app, coreDeps);

app.get('/api/health', (req, res) => res.json({ status: 'ok', bank: 'Rubicon Capital' }));

/** Cron auth: Authorization: Bearer <CRON_SECRET>  or  x-cron-secret: <CRON_SECRET> */
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

app.get('/api/cron/daily-digest', authorizeCron, runDailyDigest);
app.post('/api/cron/daily-digest', authorizeCron, runDailyDigest);

app.get('/api/cron/health', authorizeCron, (req, res) => {
  res.json({ ok: true, service: 'rubicon-cron' });
});

export default app;

if (!process.env.VERCEL) {
  runMigrations().then(() => {
    app.listen(PORT, () => console.log(`Rubicon Capital API on http://localhost:${PORT}`));
  }).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
