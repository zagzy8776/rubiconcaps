import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { maskAccountNumber } from '../lib/format';
import {
  Alert, Button, Card, EmptyState, ErrorState, Input, LoadingState, Modal,
  SearchField, SectionHeading, Select, SkeletonList,
} from '../components/ui';
import { cx } from '../lib/designTokens';
import AdminLayout, { type AdminTab } from '../components/AdminLayout';
import EditTransactionModal from '../components/EditTransactionModal';
import AdminCustomerModal from '../components/AdminCustomerModal';
import { AdminExtraTabs } from '../components/AdminExtraTabs';
import {
  Activity, Lock, Plus, Shield, Users, Wallet,
} from 'lucide-react';

type Tab = AdminTab;

const SEARCHABLE: Tab[] = ['users', 'accounts', 'transactions'];

const EMPTY_CREATE_FORM = { email: '', currency: 'GBP', account_name: '', initial_deposit: '' };

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [depositRequests, setDepositRequests] = useState<any[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [cryptoAccounts, setCryptoAccounts] = useState<any[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState('');

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAccountId, setAdjustAccountId] = useState('');
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const [editTx, setEditTx] = useState<any>(null);
  const [editCustomer, setEditCustomer] = useState<{ userId: string; accountHint?: any } | null>(null);

  const selectTab = (t: Tab) => { setTab(t); setSearch(''); setError(''); };

  const loadTab = useCallback(async (target: Tab, query = '') => {
    setLoading(true);
    setError('');
    try {
      if (target === 'overview') {
        setOverview(await api.adminOverview());
      } else if (target === 'users') {
        setUsers((await api.adminUsers(query)).users ?? []);
      } else if (target === 'accounts') {
        setAccounts((await api.adminAccounts(query)).accounts ?? []);
      } else if (target === 'transactions') {
        setTransactions((await api.adminTransactions(query)).transactions ?? []);
      } else if (target === 'activity') {
        setActivity((await api.adminActivity()).activity ?? []);
      } else if (target === 'deposits') {
        try { setDepositRequests((await api.adminDeposits()).deposits ?? []); } catch { setDepositRequests([]); }
      } else if (target === 'withdrawals') {
        try { setWithdrawalRequests((await api.adminWithdrawals('all')).withdrawals ?? []); } catch { setWithdrawalRequests([]); }
      } else if (target === 'audit') {
        try { setAuditLogs((await api.getAuditLogs()).audit_logs ?? []); } catch { setAuditLogs([]); }
      } else if (target === 'crypto') {
        try { setCryptoAccounts((await api.adminCrypto()).crypto_accounts ?? []); } catch { setCryptoAccounts([]); }
      }
    } catch (e: any) {
      setError(e?.message || 'We could not load that section.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTab(tab, SEARCHABLE.includes(tab) ? search : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleUserEdit = (u: any) => {
    setEditCustomer({ userId: u.id });
  };

  const handleAccountEdit = (a: any) => {
    if (!a.user_id) {
      setActionError('This wallet has no linked customer.');
      return;
    }
    setEditCustomer({ userId: a.user_id, accountHint: a });
  };

  const toggleUserLock = async (id: string, locked: boolean) => {
    setBusy(true); setActionError('');
    try {
      await api.lockUser(id, !locked);
      setNotice(locked ? 'Customer unlocked.' : 'Customer locked.');
      await loadTab('users', search);
    } catch (e: any) {
      setActionError(e?.message || 'Could not update user');
    } finally { setBusy(false); }
  };

  const handleAccountStatus = async (accountId: string, action: string) => {
    setBusy(true); setActionError('');
    try {
      await api.setAccountStatus(accountId, { action });
      setNotice(`Account ${action} applied.`);
      await loadTab('accounts', search);
    } catch (e: any) {
      setActionError(e?.message || 'Could not update account');
    } finally { setBusy(false); }
  };

  const handleDepositReview = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(true); setActionError('');
    try {
      await api.reviewDeposit(id, { status });
      setNotice(`Deposit ${status}.`);
      await loadTab('deposits');
    } catch (e: any) {
      setActionError(e?.message || 'Review failed');
    } finally { setBusy(false); }
  };

  const handleWithdrawalReview = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(true); setActionError('');
    try {
      await api.reviewWithdrawal(id, { status });
      setNotice(`Withdrawal ${status}.`);
      await loadTab('withdrawals');
    } catch (e: any) {
      setActionError(e?.message || 'Withdrawal review failed');
    } finally { setBusy(false); }
  };

  const handleCryptoReview = async (id: string, status: 'active' | 'rejected' | 'suspended') => {
    setBusy(true); setActionError('');
    try {
      await api.reviewCrypto(id, { status });
      setNotice(`Crypto account ${status}.`);
      await loadTab('crypto');
    } catch (e: any) {
      setActionError(e?.message || 'Crypto review failed');
    } finally { setBusy(false); }
  };

  const handleCryptoAdjust = async (id: string, amount: number, reason?: string) => {
    setBusy(true); setActionError('');
    try {
      await api.adjustCryptoBalance(id, { amount, reason });
      setNotice('Crypto balance updated.');
      await loadTab('crypto');
    } catch (e: any) {
      setActionError(e?.message || 'Crypto adjust failed');
    } finally { setBusy(false); }
  };

  const handleAdjustBalance = async () => {
    const amt = parseFloat(adjustAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setActionError('Enter a valid amount');
      return;
    }
    setBusy(true); setActionError('');
    try {
      await api.adjustBalance({
        account_id: adjustAccountId,
        amount: adjustType === 'debit' ? -amt : amt,
        adjustment_type: adjustType,
        reason: adjustReason,
      });
      setShowAdjust(false); setAdjustAmount(''); setAdjustReason('');
      setNotice(`Balance ${adjustType}ed.`);
      await loadTab('accounts', search);
    } catch (e: any) {
      setActionError(e?.message || 'Adjustment failed');
    } finally { setBusy(false); }
  };

  const sendDigest = async () => {
    setBusy(true); setActionError('');
    try {
      const r = await api.adminSendDigest();
      setNotice(`Daily digest emailed (${r.pending_deposits ?? 0} pending deposits).`);
    } catch (e: any) {
      setActionError(e?.message || 'Digest failed');
    } finally { setBusy(false); }
  };

  const sendStatements = async () => {
    setBusy(true); setActionError('');
    try {
      const r = await api.adminSendStatements();
      setNotice(`Statements emailed to ${r.sent ?? 0} customer(s).`);
    } catch (e: any) {
      setActionError(e?.message || 'Statements failed');
    } finally { setBusy(false); }
  };

  const createAccount = async () => {
    setBusy(true); setCreateError('');
    try {
      await api.adminCreateAccount({
        email: createForm.email.trim(),
        currency: createForm.currency,
        account_name: createForm.account_name || undefined,
        initial_deposit: createForm.initial_deposit ? parseFloat(createForm.initial_deposit) : 0,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setNotice('Account created.');
      await loadTab('accounts', search);
    } catch (e: any) {
      setCreateError(e?.message || 'Create failed');
    } finally { setBusy(false); }
  };

  return (
    <AdminLayout activeTab={tab} onTabChange={selectTab}>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
        <Button variant="secondary" size="sm" onClick={sendDigest} loading={busy}>Email digest</Button>
        <Button variant="secondary" size="sm" onClick={sendStatements} loading={busy}>Email statements</Button>
        <Button variant="primary" size="sm" onClick={() => { setCreateError(''); setShowCreate(true); }}
          leftIcon={<Plus className="w-4 h-4" />}>New account</Button>
      </div>

      {notice && <Alert tone="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
      {actionError && <Alert tone="error" title="That change could not be saved" onDismiss={() => setActionError('')}>{actionError}</Alert>}

      {SEARCHABLE.includes(tab) && (
        <div className="mb-6 md:hidden">
          <SearchField value={search} onChange={setSearch} onSubmit={() => loadTab(tab, search)} placeholder={`Search ${tab}…`} />
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading admin data…"><SkeletonList count={4} /></LoadingState>
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadTab(tab, search)} />
      ) : (
        <>
          {tab === 'overview' && (
            <div className="animate-fade-in">
              <SectionHeading title="Bank at a glance" icon={Shield} />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
                <StatCard label="Total clients" value={overview?.users?.total || 0} icon={Users} />
                <StatCard label="Locked clients" value={overview?.users?.locked || 0} icon={Lock} alert />
                <StatCard label="Total accounts" value={overview?.accounts?.total || 0} icon={Wallet} />
                <StatCard label="Locked accounts" value={overview?.accounts?.locked || 0} icon={Lock} alert />
              </div>
            </div>
          )}

          {tab === 'transactions' && (
            <div className="animate-fade-in">
              <SectionHeading title="Transactions" />
              {transactions.length === 0 ? (
                <EmptyState icon={Activity} title="No transactions" description="Ledger activity appears here." />
              ) : (
                <ul className="space-y-2">
                  {transactions.map((tx: any) => {
                    const ty = (tx.type || '').toLowerCase();
                    const credit = ['deposit', 'transfer_in', 'credit', 'admin_credit'].includes(ty);
                    return (
                      <li key={tx.id} onClick={() => setEditTx(tx)}
                        className="flex justify-between gap-3 rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3 cursor-pointer hover:border-line-strong">
                        <div>
                          <p className="text-sm font-medium capitalize">{tx.type}</p>
                          <p className="text-caption text-content-muted">{tx.full_name} · {maskAccountNumber(tx.account_number)}</p>
                        </div>
                        <p className={`text-sm font-semibold tabular-nums ${credit ? 'text-emerald-400' : 'text-red-400'}`}>
                          {credit ? '+' : '−'}{formatMoney(Math.abs(parseFloat(tx.amount)), tx.currency)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <AdminExtraTabs
            tab={tab}
            users={users}
            accounts={accounts}
            depositRequests={depositRequests}
            withdrawalRequests={withdrawalRequests}
            cryptoAccounts={cryptoAccounts}
            auditLogs={auditLogs}
            activity={activity}
            toggleUserLock={toggleUserLock}
            handleUserEdit={handleUserEdit}
            handleAccountEdit={handleAccountEdit}
            handleAccountStatus={handleAccountStatus}
            handleDepositReview={handleDepositReview}
            handleWithdrawalReview={handleWithdrawalReview}
            handleCryptoReview={handleCryptoReview}
            handleCryptoAdjust={handleCryptoAdjust}
            openCredit={(a) => { setAdjustAccountId(a.id); setAdjustType('credit'); setAdjustAmount(''); setShowAdjust(true); }}
            openDebit={(a) => { setAdjustAccountId(a.id); setAdjustType('debit'); setAdjustAmount(''); setShowAdjust(true); }}
            openCreate={() => { setCreateError(''); setShowCreate(true); }}
          />
        </>
      )}

      <EditTransactionModal
        transaction={editTx}
        onClose={() => setEditTx(null)}
        onSaved={() => {
          setNotice('Transaction updated.');
          loadTab('transactions', search);
        }}
      />

      <AdminCustomerModal
        open={!!editCustomer}
        userId={editCustomer?.userId}
        accountHint={editCustomer?.accountHint}
        onClose={() => setEditCustomer(null)}
        onSaved={(msg) => {
          setNotice(msg);
          loadTab(tab, search);
        }}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create account for a client">
        <div className="space-y-4">
          {createError && <Alert tone="error">{createError}</Alert>}
          <Input label="Customer email" type="email" value={createForm.email}
            onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
            placeholder="client@example.com" />
          <Select label="Currency" value={createForm.currency} onChange={e => setCreateForm({ ...createForm, currency: e.target.value })}>
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </Select>
          <Input label="Account name" value={createForm.account_name} onChange={e => setCreateForm({ ...createForm, account_name: e.target.value })} />
          <Input label="Initial deposit" value={createForm.initial_deposit} onChange={e => setCreateForm({ ...createForm, initial_deposit: e.target.value })} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={createAccount} loading={busy} fullWidth>Create account</Button>
        </div>
      </Modal>

      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title={`${adjustType === 'credit' ? 'Credit deposit' : 'Debit'} account`}>
        <div className="space-y-4">
          <Input label="Amount" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
          <Input label="Reason" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowAdjust(false)}>Cancel</Button>
          <Button onClick={handleAdjustBalance} loading={busy} variant={adjustType === 'credit' ? 'success' : 'danger'} fullWidth>
            {adjustType === 'credit' ? 'Credit' : 'Debit'}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}

function StatCard({ label, value, icon: Icon, alert }: { label: string; value: number; icon: any; alert?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-caption text-content-muted">{label}</span>
        <Icon className={cx('w-4 h-4', alert ? 'text-red-400' : 'text-content-muted')} />
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
