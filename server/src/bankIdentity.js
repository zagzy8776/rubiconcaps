/**
 * Rubicon Capital bank identity
 *
 * Every account gets:
 *  - account_name   (display name, e.g. Everyday Checking)
 *  - account_number (12-digit unique, currency-prefixed)
 *  - account_type   (current | savings | private)
 *  - routing_number (sort code / ABA / bank code by currency)
 */

import { query } from './db.js';

/** Fixed routing identifiers for Rubicon Capital. */
export const ROUTING_BY_CURRENCY = {
  GBP: '04-00-26',   // UK-style sort code
  USD: '026009593',  // US-style ABA routing
  EUR: '20041000',   // EU-style bank code
};

const PREFIX_BY_CURRENCY = {
  GBP: '40',
  USD: '20',
  EUR: '30',
};

const VALID_TYPES = new Set(['current', 'savings', 'private']);

/**
 * Generate a unique 12-digit account number.
 * Format: PP + 10 digits  (PP = currency prefix)
 * Example GBP: 401837294501
 */
export async function generateUniqueAccountNumber(currency) {
  const prefix = PREFIX_BY_CURRENCY[currency] || '90';
  for (let i = 0; i < 20; i++) {
    const body = String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
    const account_number = `${prefix}${body}`;
    const { rows } = await query(
      `SELECT 1 FROM accounts WHERE account_number = $1 LIMIT 1`,
      [account_number]
    );
    if (!rows.length) return account_number;
  }
  // Extremely unlikely fallback
  return `${prefix}${Date.now().toString().slice(-10)}`;
}

/**
 * Full identity payload for a new account.
 */
export async function buildAccountIdentity({
  currency,
  account_name,
  account_type = 'current',
}) {
  const type = VALID_TYPES.has(String(account_type).toLowerCase())
    ? String(account_type).toLowerCase()
    : 'current';

  const defaultNames = {
    current: `${currency} Current Account`,
    savings: `${currency} Savings Account`,
    private: `${currency} Private Account`,
  };

  const account_number = await generateUniqueAccountNumber(currency);
  const routing_number = ROUTING_BY_CURRENCY[currency] || '000000';

  return {
    account_name: (account_name && String(account_name).trim()) || defaultNames[type],
    account_number,
    account_type: type,
    routing_number,
  };
}

/** Human-readable sort of routing label for UI. */
export function routingLabel(currency) {
  if (currency === 'GBP') return 'Sort code';
  if (currency === 'USD') return 'Routing number';
  if (currency === 'EUR') return 'Bank code';
  return 'Routing number';
}
