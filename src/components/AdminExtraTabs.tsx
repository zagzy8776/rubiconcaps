import { formatMoney } from '../lib/api';
import { formatDate, maskAccountNumber } from '../lib/format';
import {
  Badge, Button, EmptyState, SectionHeading, StatusBadge,
} from './ui';
import {
  Activity, ClipboardList, Coins, ScrollText, Users, Wallet, Plus,
} from 'lucide-react';

type Props = {
  tab: string;
  users: any[];
  accounts: any[];
  depositRequests: any[];
  withdrawalRequests: any[];
  pendingTransfers?: any[];
  cryptoAccounts: any[];
  auditLogs: any[];
  activity: any[];
  toggleUserLock: (id: string, locked: boolean) => void;
  handleUserEdit?: (u: any) => void;
  handleAccountEdit?: (a: any) => void;
  handleAccountStatus: (id: string, action: string) => void;
  handleDepositReview: (id: string, status: 'approved' | 'rejected') => void;
  handleWithdrawalReview: (id: string, status: 'approved' | 'rejected') => void;
  handleTransferReview?: (id: string, status: 'completed' | 'blocked') => void;
  handleCryptoReview: (id: string, status: 'active' | 'rejected' | 'suspended') => void;
  handleCryptoAdjust: (id: string, amount: number, reason?: string) => void;
  openCredit: (a: any) => void;
  openDebit: (a: any) => void;
  openCreate: () => void;
};

export function AdminExtraTabs(p: Props) {
  const {
    tab, users, accounts, depositRequests, withdrawalRequests, pendingTransfers = [], cryptoAccounts, auditLogs, activity,
    toggleUserLock, handleUserEdit, handleAccountEdit, handleAccountStatus, handleDepositReview, handleWithdrawalReview, handleTransferReview,
    handleCryptoReview, handleCryptoAdjust, openCredit, openDebit, openCreate,
  } = p;

  if (tab === 'users') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Customers" icon={Users} />
        {users.length === 0 ? (
          <EmptyState icon={Users} title="No customers" description="Registered clients appear here." />
        ) : (
          <ul className="space-y-2">
            {users.map((u: any) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                  <p className="text-caption text-content-muted truncate">{u.email}</p>
                  <p className="text-caption text-content-muted truncate">
                    {u.phone || 'No phone'} · {u.account_count || 0} accounts
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {u.is_locked ? <Badge tone="negative">Locked</Badge> : <Badge tone="positive">Active</Badge>}
                  {handleUserEdit && (
                    <Button size="sm" variant="secondary" onClick={() => handleUserEdit(u)}>Edit</Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => toggleUserLock(u.id, u.is_locked)}>
                    {u.is_locked ? 'Unlock' : 'Lock'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === 'accounts') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Bank accounts" icon={Wallet}
          action={<Button size="sm" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>New</Button>} />
        {accounts.length === 0 ? (
          <EmptyState icon={Wallet} title="No accounts" description="Customer currency accounts appear here." />
        ) : (
          <ul className="space-y-2">
            {accounts.map((a: any) => (
              <li key={a.id} className="rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.full_name || a.email} · {a.currency}</p>
                    <p className="text-caption text-content-muted font-mono">{a.account_number || maskAccountNumber(a.account_number)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(a.balance, a.currency)}</p>
                    <StatusBadge status={a.status} locked={a.is_locked} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="success" onClick={() => openCredit(a)}>Credit deposit</Button>
                  <Button size="sm" variant="danger" onClick={() => openDebit(a)}>Debit</Button>
                  {handleAccountEdit && (
                    <Button size="sm" variant="secondary" onClick={() => handleAccountEdit(a)}>Edit</Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => handleAccountStatus(a.id, a.is_locked ? 'unlock' : 'lock')}>
                    {a.is_locked ? 'Unlock' : 'Lock'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAccountStatus(a.id, 'block')}>Block</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  
  if (tab === 'transfers') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Held transfers" icon={ClipboardList} />
        <p className="text-sm text-content-muted mb-4">
          New transfers stay pending until you release (complete) or block (refund) them.
        </p>
        {pendingTransfers.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No pending transfers" description="Outbound transfers awaiting review appear here." />
        ) : (
          <div className="space-y-3">
            {pendingTransfers.map((tr: any) => (
              <div key={tr.id} className="rounded-xl border border-line-subtle bg-surface-raised p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-content-primary">
                    {formatMoney(Math.abs(parseFloat(tr.amount)), tr.currency || tr.account_currency)}
                  </p>
                  <p className="text-caption text-content-muted truncate">
                    {tr.customer_name || 'Customer'} · {tr.from_account_number || '—'} → {tr.description || tr.reference}
                  </p>
                  <p className="text-micro text-content-muted mt-1">{formatDate(tr.created_at)} · {tr.status || 'pending'}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="success" onClick={() => handleTransferReview?.(tr.id, 'completed')}>
                    Release
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleTransferReview?.(tr.id, 'blocked')}>
                    Block
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab === 'deposits') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Deposit requests" icon={ClipboardList} />
        {depositRequests.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No deposit requests" description="Customer deposit requests await approval here." />
        ) : (
          <ul className="space-y-2">
            {depositRequests.map((d: any) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.customer_name || d.customer_email || 'Client'}</p>
                  <p className="text-caption text-content-muted">{formatMoney(d.amount, d.currency)} · {d.status} · {formatDate(d.created_at)}</p>
                </div>
                {d.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" onClick={() => handleDepositReview(d.id, 'approved')}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDepositReview(d.id, 'rejected')}>Reject</Button>
                  </div>
                ) : (
                  <Badge>{d.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === 'withdrawals') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Withdrawal requests" icon={ClipboardList} />
        {withdrawalRequests.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No withdrawal requests" description="Client withdrawal requests appear here for approval." />
        ) : (
          <ul className="space-y-2">
            {withdrawalRequests.map((w: any) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{w.customer_name || w.customer_email || 'Client'}</p>
                  <p className="text-caption text-content-muted">
                    {formatMoney(w.amount, w.currency)} · {w.account_number || '—'} · {w.status}
                    {w.destination ? ` · ${w.destination}` : ''}
                  </p>
                </div>
                {w.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" onClick={() => handleWithdrawalReview(w.id, 'approved')}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => handleWithdrawalReview(w.id, 'rejected')}>Reject</Button>
                  </div>
                ) : (
                  <Badge>{w.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === 'crypto') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Crypto accounts" icon={Coins} />
        {cryptoAccounts.length === 0 ? (
          <EmptyState icon={Coins} title="No crypto requests" description="Client BTC/ETH/USDT requests appear here for approval." />
        ) : (
          <ul className="space-y-2">
            {cryptoAccounts.map((ca: any) => (
              <li key={ca.id} className="rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{ca.full_name || ca.email} · {ca.asset}</p>
                    <p className="text-caption text-content-muted font-mono break-all">{ca.wallet_address}</p>
                    <p className="text-caption text-content-muted mt-1">
                      Balance: {ca.balance ?? '0'} {ca.asset} · <span className="capitalize">{ca.status}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ca.status === 'pending' && (
                    <>
                      <Button size="sm" variant="success" onClick={() => handleCryptoReview(ca.id, 'active')}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => handleCryptoReview(ca.id, 'rejected')}>Reject</Button>
                    </>
                  )}
                  {ca.status === 'active' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => {
                        const amt = prompt(`Credit ${ca.asset} deposit amount`);
                        if (amt && Number.isFinite(parseFloat(amt))) {
                          handleCryptoAdjust(ca.id, parseFloat(amt), 'Crypto deposit credited');
                        }
                      }}>Credit deposit</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleCryptoReview(ca.id, 'suspended')}>Suspend</Button>
                    </>
                  )}
                  {ca.status === 'suspended' && (
                    <Button size="sm" variant="success" onClick={() => handleCryptoReview(ca.id, 'active')}>Reactivate</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === 'audit') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Audit log" icon={ScrollText} />
        {auditLogs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries" description="Admin actions are recorded here." />
        ) : (
          <ul className="space-y-2">
            {auditLogs.map((log: any) => (
              <li key={log.id} className="rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3 text-sm">
                <p className="font-medium">{log.action} · {log.target_type}</p>
                <p className="text-caption text-content-muted">{log.actor_name || log.actor_id} · {formatDate(log.created_at)}</p>
                {log.reason && <p className="text-caption text-content-secondary mt-1">{log.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === 'activity') {
    return (
      <div className="animate-fade-in">
        <SectionHeading title="Activity" icon={Activity} />
        {activity.length === 0 ? (
          <EmptyState icon={Activity} title="No activity" description="Platform activity will show here." />
        ) : (
          <ul className="space-y-2">
            {activity.map((a: any) => (
              <li key={a.id} className="rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3 text-sm">
                <p className="font-medium">{a.action}</p>
                <p className="text-caption text-content-muted">{a.description} · {formatDate(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
