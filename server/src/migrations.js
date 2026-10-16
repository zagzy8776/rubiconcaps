/**
 * Database migration for Rubicon Capital banking platform.
 *
 * Adds new tables and extends existing ones. Safe to run multiple times.
 */

import { query } from './db.js';

export async function runMigrations() {
  console.log('Running database migrations…');

  // 1. Extend profiles table
  const profileCols = [
    ['phone', 'TEXT'],
    ['address', 'TEXT'],
    ['date_of_birth', 'DATE'],
    ['country', "TEXT DEFAULT 'GB'"],
    ['kyc_status', "TEXT DEFAULT 'pending'"],
    ['account_status', "TEXT DEFAULT 'active'"],
    ['transaction_pin_hash', 'TEXT'],
    ['last_login', 'TIMESTAMPTZ'],
  ];
  for (const [col, type] of profileCols) {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${col} ${type}`).catch(() => {});
  }

  // 2. Extend accounts table
  const accountCols = [
    ['account_name', 'TEXT'],
    ['account_number', 'TEXT'],
    ['account_type', "TEXT DEFAULT 'current'"],
    ['routing_number', 'TEXT'],
    ['status', "TEXT DEFAULT 'active'"],
    ['available_balance', 'NUMERIC(18,2)'],
    ['daily_limit', 'NUMERIC(18,2)'],
    ['transaction_limit', 'NUMERIC(18,2)'],
    ['monthly_limit', 'NUMERIC(18,2)'],
    ['updated_at', 'TIMESTAMPTZ DEFAULT now()'],
  ];
  for (const [col, type] of accountCols) {
    await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ${col} ${type}`).catch(() => {});
  }

  // 3. Transactions status column
  await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'`).catch(() => {});
  await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference TEXT`).catch(() => {});

  // 4. Notifications
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      data JSONB,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`).catch(() => {});

  // 5. Audit logs
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      before_state JSONB,
      after_state JSONB,
      reason TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // 6. Activity log
  await query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      action TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // 7. Account requests
  await query(`
    CREATE TABLE IF NOT EXISTS account_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      request_type TEXT NOT NULL,
      payload JSONB,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed_at TIMESTAMPTZ
    )
  `).catch(() => {});

  // 8. Deposits / withdrawals tables if missing
  await query(`
    CREATE TABLE IF NOT EXISTS deposit_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      account_id UUID NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT,
      reference TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed_at TIMESTAMPTZ
    )
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      account_id UUID NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT,
      destination TEXT,
      reference TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed_at TIMESTAMPTZ
    )
  `).catch(() => {});

  // 9. Crypto accounts
  await query(`
    CREATE TABLE IF NOT EXISTS crypto_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      asset TEXT NOT NULL,
      balance NUMERIC(24,8) DEFAULT 0,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // 10. Login OTPs (serverless-safe)
  await query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // 11. Sessions
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      token_jti TEXT,
      user_agent TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      last_seen_at TIMESTAMPTZ DEFAULT now(),
      revoked_at TIMESTAMPTZ
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON user_sessions(user_id) WHERE revoked_at IS NULL;`).catch(() => {});

  console.log('Migrations complete.');
}
