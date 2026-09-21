/**
 * Rubicon Capital — transactional email via Resend.
 * Requires env: RESEND_API_KEY, optional EMAIL_FROM, APP_URL
 */

import { query } from './db.js';

const RESEND_API = 'https://api.resend.com/emails';
const FROM =
  process.env.EMAIL_FROM ||
  'Rubicon Capital <noreply@rubiconcapital.org>';
const APP_URL =
  process.env.APP_URL ||
  process.env.VITE_APP_URL ||
  'https://www.rubiconcapital.org';
const SUPPORT =
  process.env.SUPPORT_EMAIL ||
  'rubiconcapital@rubiconcapital.org';

export function money(amount, currency = 'USD') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toLocaleString('en-GB')} ${currency}`;
  }
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

export function row(label, value) {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#94a3b8;width:40%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;font-size:13px;color:#f1f5f9;font-weight:500;">${value}</td>
  </tr>`;
}

export function layout({ title, preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#070b14;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:24px 28px;border-bottom:1px solid #1e293b;">
            <table role="presentation" width="100%"><tr>
              <td style="font-size:18px;font-weight:700;color:#f8fafc;">
                <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0b1220;font-size:14px;font-weight:800;margin-right:10px;">R</span>
                Rubicon Capital
              </td>
              <td align="right" style="font-size:11px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;">Secure notice</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f8fafc;">${escapeHtml(title)}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px;background:#0b1220;border-top:1px solid #1e293b;font-size:12px;color:#64748b;line-height:1.5;">
            This message was sent by Rubicon Capital regarding your account.
            If you did not expect it, contact <a href="mailto:${SUPPORT}" style="color:#f59e0b;text-decoration:none;">${SUPPORT}</a>.
            <br/><br/>
            <a href="${APP_URL}" style="color:#94a3b8;text-decoration:none;">${APP_URL.replace(/^https?:\/\//, '')}</a>
            · Do not share passwords or one-time codes by email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipped:', subject, '→', to);
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }
  if (!to) return { ok: false, error: 'no recipient' };
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
        text: text || subject,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] Resend error', res.status, data);
      return { ok: false, error: data?.message || res.statusText };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function getUserContact(userId) {
  if (!userId) return null;
  try {
    const { rows } = await query(
      `SELECT id, email, full_name FROM profiles WHERE id = $1`,
      [userId]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function emailWelcome({ to, fullName }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const html = layout({
    title: 'Welcome to Rubicon Capital',
    preheader: 'Your account is ready. Sign in securely anytime.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        Hello ${escapeHtml(first)}, thank you for opening a relationship with Rubicon Capital.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        You can sign in, request deposits, and manage multi-currency accounts from your secure dashboard.
      </p>
      <a href="${APP_URL}/login" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#0b1220;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none;">
        Sign in to your account
      </a>`,
  });
  return sendEmail({ to, subject: 'Welcome to Rubicon Capital', html, text: `Welcome ${first}. Sign in at ${APP_URL}/login` });
}

export async function emailLoginAlert({ to, fullName, when, ip }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const html = layout({
    title: 'New sign-in to your account',
    preheader: 'A sign-in was recorded on your Rubicon Capital account.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Hello ${escapeHtml(first)}, we recorded a successful sign-in.</p>
      <table role="presentation" width="100%" style="margin:8px 0 16px;">
        ${row('When', escapeHtml(when || new Date().toUTCString()))}
        ${ip ? row('IP', escapeHtml(ip)) : ''}
      </table>
      <p style="margin:0;font-size:13px;color:#64748b;">If this was not you, change your password and contact ${escapeHtml(SUPPORT)} immediately.</p>`,
  });
  return sendEmail({ to, subject: 'Rubicon Capital — new sign-in', html });
}

export async function emailTransferSent({ to, fullName, amount, currency, toAccount, reference, when }) {
  const html = layout({
    title: 'Transfer sent',
    preheader: `You sent ${money(amount, currency)}.`,
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#f8fafc;">${escapeHtml(money(amount, currency))}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">Outgoing transfer completed</p>
      <table role="presentation" width="100%">
        ${row('To account', escapeHtml(toAccount))}
        ${row('Reference', escapeHtml(reference || '—'))}
        ${row('Date', escapeHtml(when || new Date().toUTCString()))}
      </table>`,
  });
  return sendEmail({ to, subject: `Transfer sent · ${money(amount, currency)}`, html });
}

export async function emailTransferReceived({ to, fullName, amount, currency, fromAccount, reference, when }) {
  const html = layout({
    title: 'Transfer received',
    preheader: `You received ${money(amount, currency)}.`,
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#34d399;">+${escapeHtml(money(amount, currency))}</p>
      <table role="presentation" width="100%">
        ${row('From account', escapeHtml(fromAccount))}
        ${row('Reference', escapeHtml(reference || '—'))}
        ${row('Date', escapeHtml(when || new Date().toUTCString()))}
      </table>`,
  });
  return sendEmail({ to, subject: `Transfer received · ${money(amount, currency)}`, html });
}

export async function emailDepositRequested({ to, fullName, amount, currency, reference }) {
  const html = layout({
    title: 'Deposit request received',
    preheader: `We received your request for ${money(amount, currency)}.`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Your deposit request is under review. Funds are credited after approval.</p>
      <table role="presentation" width="100%">
        ${row('Amount', escapeHtml(money(amount, currency)))}
        ${row('Reference', escapeHtml(reference || '—'))}
        ${row('Status', 'Pending review')}
      </table>`,
  });
  return sendEmail({ to, subject: `Deposit request · ${money(amount, currency)}`, html });
}

export async function emailDepositDecision({ to, fullName, amount, currency, approved, note, reference }) {
  const title = approved ? 'Deposit approved' : 'Deposit not approved';
  const html = layout({
    title,
    preheader: approved ? `${money(amount, currency)} has been credited.` : 'Your deposit request was not approved.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        ${approved
          ? `Good news — <strong style="color:#34d399;">${escapeHtml(money(amount, currency))}</strong> has been credited to your account.`
          : 'Your deposit request was not approved at this time.'}
      </p>
      <table role="presentation" width="100%">
        ${row('Amount', escapeHtml(money(amount, currency)))}
        ${row('Reference', escapeHtml(reference || '—'))}
        ${row('Status', approved ? 'Approved' : 'Rejected')}
        ${note ? row('Note', escapeHtml(note)) : ''}
      </table>`,
  });
  return sendEmail({ to, subject: `${title} · ${money(amount, currency)}`, html });
}

export async function emailBalanceAdjust({ to, fullName, amount, currency, credit, reason, newBalance }) {
  const title = credit ? 'Account credited' : 'Account debited';
  const html = layout({
    title,
    preheader: `${money(Math.abs(amount), currency)} ${credit ? 'added' : 'removed'}.`,
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:${credit ? '#34d399' : '#f8fafc'};">
        ${credit ? '+' : '−'}${escapeHtml(money(Math.abs(amount), currency))}
      </p>
      <table role="presentation" width="100%" style="margin-top:12px;">
        ${reason ? row('Reason', escapeHtml(reason)) : ''}
        ${newBalance != null ? row('New balance', escapeHtml(money(newBalance, currency))) : ''}
        ${row('Date', escapeHtml(new Date().toUTCString()))}
      </table>`,
  });
  return sendEmail({ to, subject: `${title} · ${money(Math.abs(amount), currency)}`, html });
}

export async function emailPasswordReset({ to, fullName, resetUrl, expiresMinutes = 60 }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const html = layout({
    title: 'Reset your password',
    preheader: 'Use this secure link to set a new password.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Hello ${escapeHtml(first)}, we received a request to reset the password for your Rubicon Capital account.</p>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#0b1220;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none;">Reset password</a>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;">This link expires in ${expiresMinutes} minutes. If you did not request a reset, ignore this email.</p>`,
  });
  return sendEmail({ to, subject: 'Rubicon Capital — reset your password', html, text: `Reset: ${resetUrl}` });
}

export async function emailPasswordChanged({ to, fullName, when }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const html = layout({
    title: 'Password changed',
    preheader: 'Your Rubicon Capital password was updated.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Hello ${escapeHtml(first)}, the password for your account was changed successfully.</p>
      <table role="presentation" width="100%">${row('When', escapeHtml(when || new Date().toUTCString()))}</table>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;">If this was not you, contact ${escapeHtml(SUPPORT)} immediately.</p>`,
  });
  return sendEmail({ to, subject: 'Rubicon Capital — password changed', html });
}

export async function emailAccountLock({ to, fullName, locked, reason, scope = 'account' }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const title = locked ? 'Account locked' : 'Account unlocked';
  const html = layout({
    title,
    preheader: locked ? 'Access to your account has been restricted.' : 'Your account access has been restored.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        Hello ${escapeHtml(first)}, your ${escapeHtml(scope)} has been <strong style="color:${locked ? '#f87171' : '#34d399'};">${locked ? 'locked' : 'unlocked'}</strong>.
      </p>
      <table role="presentation" width="100%">
        ${row('Status', locked ? 'Locked' : 'Active')}
        ${reason ? row('Reason', escapeHtml(reason)) : ''}
        ${row('Date', escapeHtml(new Date().toUTCString()))}
      </table>`,
  });
  return sendEmail({ to, subject: `Rubicon Capital — ${title.toLowerCase()}`, html });
}

export async function emailTransferFailed({ to, fullName, amount, currency, toAccount, reason }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const html = layout({
    title: 'Transfer could not be completed',
    preheader: 'Your transfer was not processed.',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Hello ${escapeHtml(first)}, we could not complete your transfer.</p>
      <table role="presentation" width="100%">
        ${amount != null ? row('Amount', escapeHtml(money(amount, currency || 'USD'))) : ''}
        ${toAccount ? row('To account', escapeHtml(toAccount)) : ''}
        ${row('Reason', escapeHtml(reason || 'Transfer failed'))}
        ${row('Date', escapeHtml(new Date().toUTCString()))}
      </table>`,
  });
  return sendEmail({ to, subject: 'Rubicon Capital — transfer failed', html });
}

export async function emailMonthlyStatement({ to, fullName, periodLabel, accounts = [], txSummary = {} }) {
  const first = (fullName || 'Client').split(/\s+/)[0];
  const accountRows = (accounts || []).map((a) =>
    row(`${a.currency || ''} ${a.account_number || a.account_name || 'Account'}`, escapeHtml(money(a.balance, a.currency || 'USD')))
  ).join('');
  const html = layout({
    title: `Statement · ${periodLabel}`,
    preheader: `Your Rubicon Capital summary for ${periodLabel}.`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Hello ${escapeHtml(first)}, here is your account summary for <strong style="color:#f8fafc;">${escapeHtml(periodLabel)}</strong>.</p>
      <table role="presentation" width="100%" style="margin-bottom:16px;">${accountRows || row('Accounts', 'No open accounts')}</table>
      <table role="presentation" width="100%">
        ${row('Credits', escapeHtml(String(txSummary.credits ?? '—')))}
        ${row('Debits', escapeHtml(String(txSummary.debits ?? '—')))}
        ${row('Transfers', escapeHtml(String(txSummary.transfers ?? '—')))}
      </table>`,
  });
  return sendEmail({ to, subject: `Rubicon Capital statement · ${periodLabel}`, html });
}

export async function emailAdminDigest({ to, pendingDeposits = [], pendingRequests = 0, lockedAccounts = 0, when }) {
  const lines = (pendingDeposits || []).slice(0, 15).map((d) => {
    const amt = money(d.amount, d.currency);
    return `<tr>
      <td style="padding:6px 0;font-size:13px;color:#cbd5e1;">${escapeHtml(d.customer_name || d.customer_email || 'Client')}</td>
      <td style="padding:6px 0;font-size:13px;color:#f8fafc;text-align:right;">${escapeHtml(amt)}</td>
    </tr>`;
  }).join('');
  const html = layout({
    title: 'Admin daily digest',
    preheader: `${(pendingDeposits || []).length} deposit(s) awaiting review.`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Operations summary for ${escapeHtml(when || new Date().toUTCString())}.</p>
      <table role="presentation" width="100%" style="margin-bottom:16px;">
        ${row('Pending deposits', String((pendingDeposits || []).length))}
        ${row('Pending account requests', String(pendingRequests || 0))}
        ${row('Locked accounts', String(lockedAccounts || 0))}
      </table>
      ${lines ? `<p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Deposit queue</p><table role="presentation" width="100%">${lines}</table>` : '<p style="font-size:14px;color:#94a3b8;">No pending deposits.</p>'}
      <p style="margin:20px 0 0;"><a href="${APP_URL}/admin" style="color:#f59e0b;text-decoration:none;font-size:14px;">Open admin panel →</a></p>`,
  });
  return sendEmail({
    to,
    subject: `Rubicon admin digest · ${(pendingDeposits || []).length} pending deposit(s)`,
    html,
  });
}

export async function emailLoginOtp({ to, fullName, code, expiresMinutes = 10 }) {
  const safeName = escapeHtml(fullName || 'Client');
  const safeCode = escapeHtml(String(code));
  const html = layout({
    title: 'Your sign-in code',
    preheader: `Your Rubicon Capital sign-in code is ${code}`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">Hello ${safeName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        Use this one-time code to finish signing in to Rubicon Capital. It expires in ${expiresMinutes} minutes.
      </p>
      <p style="margin:24px 0;text-align:center;font-size:32px;letter-spacing:0.35em;font-weight:700;color:#f8fafc;font-family:ui-monospace,monospace;">
        ${safeCode}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
        If you did not try to sign in, ignore this email and consider changing your password.
      </p>
    `,
  });
  return sendEmail({
    to,
    subject: `Your Rubicon sign-in code: ${code}`,
    html,
    text: `Your Rubicon Capital sign-in code is ${code}. It expires in ${expiresMinutes} minutes.`,
  });
}

export function voidEmail(promise) {
  Promise.resolve(promise).catch((err) =>
    console.error('[email] async error:', err?.message || err)
  );
}
