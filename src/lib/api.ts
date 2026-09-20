const API = '/api';

function getToken() {
  return localStorage.getItem('rubicon_token');
}

function getAdminToken() {
  return localStorage.getItem('rubicon_admin_token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function adminRequest(path: string, options: RequestInit = {}) {
  const token = getAdminToken() || getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  register: (body: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    date_of_birth?: string;
    address?: string;
    country?: string;
  }) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string; trust_device?: boolean }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  verifyOtp: (body: { challenge_id: string; code: string }) =>
    request('/auth/verify-otp', { method: 'POST', body: JSON.stringify(body) }),
  resendOtp: (body: { challenge_id: string }) =>
    request('/auth/resend-otp', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),

  changePassword: (body: { current_password: string; new_password: string }) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
  forgotPassword: (email: string) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (body: { token: string; new_password: string }) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),

  adminSendDigest: (to?: string) =>
    adminRequest('/admin/emails/digest', { method: 'POST', body: JSON.stringify(to ? { to } : {}) }),
  adminSendStatements: (body?: { user_id?: string; period_label?: string }) =>
    adminRequest('/admin/emails/statements', { method: 'POST', body: JSON.stringify(body || {}) }),

  getAccounts: () => request('/accounts'),
  createAccount: (body: { currency: string; account_name?: string; account_type?: string }) =>
    request('/accounts', { method: 'POST', body: JSON.stringify(body) }),
  getAccount: (id: string) => request(`/accounts/${id}`),
  getTransactions: (id: string) => request(`/accounts/${id}/transactions`),
  transfer: (body: any) => request('/transfers', { method: 'POST', body: JSON.stringify(body) }),
  deposit: (body: { account_id: string; amount: number | string; description?: string; reference?: string }) =>
    request('/deposits', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createRequest: (body: any) => request('/requests', { method: 'POST', body: JSON.stringify(body) }),
  myRequests: () => request('/requests/mine'),

  adminOverview: () => adminRequest('/admin/overview'),
  adminUsers: (q = '') => adminRequest(`/admin/users?q=${encodeURIComponent(q)}`),
  lockUser: (id: string, locked: boolean) =>
    adminRequest(`/admin/users/${id}/lock`, { method: 'PATCH', body: JSON.stringify({ locked }) }),
  adminAccounts: (q = '') => adminRequest(`/admin/accounts?q=${encodeURIComponent(q)}`),
  lockAccount: (id: string, locked: boolean) =>
    adminRequest(`/admin/accounts/${id}/lock`, { method: 'PATCH', body: JSON.stringify({ locked }) }),
  adminCreateAccount: (body: any) =>
    adminRequest('/admin/accounts', { method: 'POST', body: JSON.stringify(body) }),
  adjustBalance: (body: {
    account_id: string;
    amount: number;
    reason?: string;
    adjustment_type?: string;
  }) => {
    const signed =
      body.adjustment_type === 'debit' ? -Math.abs(Number(body.amount)) : Math.abs(Number(body.amount));
    return adminRequest(`/admin/accounts/${body.account_id}/adjust`, {
      method: 'POST',
      body: JSON.stringify({
        amount: signed,
        reason: body.reason,
        description: body.reason || `Admin ${body.adjustment_type || 'credit'}`,
      }),
    });
  },
  adminTransactions: (q = '') => adminRequest(`/admin/transactions?q=${encodeURIComponent(q)}`),
  editTransaction: (
    id: string,
    body: { created_at?: string; description?: string; reference?: string; amount?: number }
  ) =>
    adminRequest(`/admin/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminActivity: () => adminRequest('/admin/activity'),
  adminRequests: () => adminRequest('/admin/requests'),
  reviewRequest: (id: string, body: { status: string; admin_note?: string }) =>
    adminRequest(`/admin/requests/${id}/review`, { method: 'POST', body: JSON.stringify(body) }),
  exchangeRates: () => adminRequest('/admin/exchange-rates'),
  updateRate: (body: any) =>
    adminRequest('/admin/exchange-rates', { method: 'PUT', body: JSON.stringify(body) }),
  promote: (email?: string) =>
    adminRequest('/admin/promote', { method: 'POST', body: JSON.stringify({ email }) }),

  createDepositRequest: (body: { account_id: string; amount: number; reference?: string }) =>
    request('/deposits', { method: 'POST', body: JSON.stringify(body) }),
  getMyDeposits: () => request('/deposits'),
  createWithdrawal: (body: { account_id: string; amount: number; destination?: string; reference?: string }) =>
    request('/withdrawals', { method: 'POST', body: JSON.stringify(body) }),
  getMyWithdrawals: () => request('/withdrawals'),
  adminWithdrawals: (status = 'all') => adminRequest(`/admin/withdrawals?status=${status}`),
  reviewWithdrawal: (id: string, body: { status: string; admin_note?: string }) =>
    adminRequest(`/admin/withdrawals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  adminDeposits: (status = 'all') => adminRequest(`/admin/deposits?status=${status}`),
  reviewDeposit: (id: string, body: { status: string; admin_note?: string }) =>
    adminRequest(`/admin/deposits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  initiateTransfer: (body: {
    from_account_id: string;
    to_account_number: string;
    amount: number;
    reference?: string;
  }) => request('/transfers', { method: 'POST', body: JSON.stringify(body) }),
  getTransfers: (account_id?: string) =>
    request(`/transfers${account_id ? `?account_id=${account_id}` : ''}`),

  requestCryptoAccount: (body: { asset: string }) =>
    request('/crypto', { method: 'POST', body: JSON.stringify(body) }),
  getMyCrypto: () => request('/crypto'),
  getCryptoTransactions: (id: string) => request(`/crypto/${id}/transactions`),

  adminCrypto: (status = 'all') => adminRequest(`/admin/crypto?status=${status}`),
  reviewCrypto: (id: string, body: { status: string; admin_note?: string }) =>
    adminRequest(`/admin/crypto/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adjustCryptoBalance: (id: string, body: { amount: number; reason?: string; transaction_type?: string }) =>
    adminRequest(`/admin/crypto/${id}/adjust`, { method: 'POST', body: JSON.stringify(body) }),

  setAccountStatus: (id: string, body: { action: string }) =>
    adminRequest(`/admin/accounts/${id}/status`, { method: 'POST', body: JSON.stringify(body) }),

  getAuditLogs: (q = '') =>
    adminRequest(`/admin/audit-logs${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  getNotifications: (unread = false) =>
    request(`/notifications${unread ? '?unread=true' : ''}`),
  markNotificationRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request('/notifications/read-all', { method: 'POST' }),

  getSessions: () => request('/sessions'),
  revokeSession: (id: string) =>
    request(`/sessions/${id}/revoke`, { method: 'POST' }),
  revokeAllSessions: () =>
    request('/sessions/revoke-all', { method: 'POST' }),

  getPreferences: () => request('/profile/preferences'),
  updatePreferences: (body: {
    notify_login?: boolean;
    notify_transfers?: boolean;
    notify_deposits?: boolean;
    notify_marketing?: boolean;
  }) => request('/profile/preferences', { method: 'PATCH', body: JSON.stringify(body) }),

  downloadStatementPdf: async (accountId: string, params?: { from?: string; to?: string }) => {
    const token = getToken();
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const qs = q.toString();
    const res = await fetch(
      `${API}/accounts/${accountId}/statement.pdf${qs ? `?${qs}` : ''}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).error || `Download failed (${res.status})`);
    }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(disp);
    const filename = match?.[1] || `rubicon-statement.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  },
};

export function formatMoney(amount: number | string, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
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


/** Re-export for components that import formatDate from api */
export function formatDate(d: string) {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
