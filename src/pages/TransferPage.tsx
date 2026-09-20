import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { currencyMeta } from '../lib/currencies';
import { maskAccountNumber, formatRelativeDay, formatDate } from '../lib/format';
import {
  Alert, Button, Card, EmptyState, Input, Modal, PageHeader, Select,
  SectionHeading, Skeleton, SkeletonCard, StatusBadge,
} from '../components/ui';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Clock,
  Copy, Send, Wallet,
} from 'lucide-react';
import { cx } from '../lib/designTokens';

interface Account {
  id: string;
  account_number: string;
  account_name: string;
  currency: string;
  balance: string;
  status?: string;
  is_locked?: boolean;
}

interface Transfer {
  id: string;
  type: string;
  amount: string;
  currency: string;
  description?: string;
  reference?: string;
  status?: string;
  created_at: string;
  account_number?: string;
  account_id?: string;
}

function isIncoming(t: Transfer) {
  const ty = (t.type || '').toLowerCase();
  if (ty === 'transfer_in' || ty === 'deposit' || ty === 'credit' || ty === 'admin_credit') return true;
  if (ty === 'transfer_out' || ty === 'withdrawal' || ty === 'debit' || ty === 'admin_debit') return false;
  return parseFloat(t.amount) > 0 && ty !== 'transfer';
}

function typeLabel(t: Transfer) {
  const ty = (t.type || '').toLowerCase();
  if (ty === 'transfer_out' || ty === 'withdrawal') return 'Outgoing transfer';
  if (ty === 'transfer_in') return 'Incoming transfer';
  if (ty === 'deposit' || ty === 'admin_credit') return 'Deposit';
  if (ty === 'debit' || ty === 'admin_debit') return 'Debit';
  if (isIncoming(t)) return 'Received';
  return 'Sent';
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-line-subtle last:border-0">
      <span className="text-caption text-content-muted shrink-0">{label}</span>
      <span className={cx('text-sm text-right break-all', mono && 'font-mono text-xs')}>
        {value}
      </span>
    </div>
  );
}

export default function TransferPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transfer | null>(null);
  const [fromAccount, setFromAccount] = useState('');
  const [toNumber, setToNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [modalStep, setModalStep] = useState<'form' | 'review'>('form');

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, t] = await Promise.all([api.getAccounts(), api.getTransfers()]);
      const rows: Account[] = a.accounts || [];
      setAccounts(rows);
      setTransfers(t.transfers || []);
      setFromAccount((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        const first = rows.find((r) => !r.is_locked && (!r.status || r.status === 'active'));
        return first?.id || rows[0]?.id || '';
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const usableAccounts = useMemo(
    () => accounts.filter((a) => !a.is_locked && (!a.status || a.status === 'active')),
    [accounts],
  );

  const balanceByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of accounts) {
      map[a.currency] = (map[a.currency] || 0) + (parseFloat(a.balance) || 0);
    }
    return map;
  }, [accounts]);

  const primary = usableAccounts[0] || accounts[0];
  const primaryCurrency = primary?.currency || 'USD';
  const primaryBalance = balanceByCurrency[primaryCurrency] || 0;

  const stats = useMemo(() => {
    const sent = transfers
      .filter((t) => !isIncoming(t))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const received = transfers
      .filter((t) => isIncoming(t))
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    return { sent, received, count: transfers.length };
  }, [transfers]);

  const sel = accounts.find((a) => a.id === fromAccount);

  const openSend = () => {
    if (!fromAccount && usableAccounts[0]) setFromAccount(usableAccounts[0].id);
    setFormError('');
    setModalStep('form');
    setShowModal(true);
  };

  const closeSendModal = () => {
    setShowModal(false);
    setModalStep('form');
    setFormError('');
  };

  const goToReview = () => {
    setFormError('');
    if (!fromAccount) {
      setFormError('Select a sender account');
      return;
    }
    if (!toNumber.trim()) {
      setFormError('Enter recipient account number');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    const avail = parseFloat(sel?.balance || '0');
    if (parseFloat(amount) > avail) {
      setFormError(`Insufficient balance. Available: ${formatMoney(avail, sel?.currency || primaryCurrency)}`);
      return;
    }
    setModalStep('review');
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleTransfer = async () => {
    setFormError('');
    setSuccess('');
    setBusy(true);
    try {
      const cleaned = toNumber.trim().replace(/\s+/g, '');
      await api.initiateTransfer({
        from_account_id: fromAccount,
        to_account_number: cleaned,
        amount: parseFloat(amount),
        reference: reference.trim() || undefined,
      });
      setSuccess(
        `Transfer of ${formatMoney(parseFloat(amount), sel?.currency || primaryCurrency)} to ${cleaned} was successful!`,
      );
      closeSendModal();
      setToNumber('');
      setAmount('');
      setReference('');
      await load();
    } catch (e: any) {
      setFormError(e?.message || 'Transfer failed');
      setModalStep('form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <PageHeader title="Transfers" subtitle="Send money from your accounts" backTo="/dashboard" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">

        <Card className="relative p-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-600/15 via-transparent to-brand-400/5 pointer-events-none" />
          <div className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-caption text-content-muted mb-1 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Available to send
                </p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums break-all">
                  {loading ? (
                    <Skeleton className="h-8 w-40" />
                  ) : (
                    formatMoney(primaryBalance, primaryCurrency)
                  )}
                </p>
                <p className="text-caption text-content-muted mt-1.5">
                  {accounts.length === 0
                    ? 'No accounts yet'
                    : accounts.length === 1
                      ? `1 ${primaryCurrency} account · ${maskAccountNumber(primary?.account_number || '')}`
                      : `${accounts.length} accounts across ${Object.keys(balanceByCurrency).length} currencies`}
                </p>
              </div>
              <Button
                onClick={openSend}
                leftIcon={<Send className="w-4 h-4" />}
                disabled={!usableAccounts.length}
                className="w-full sm:w-auto shrink-0"
              >
                Send Money
              </Button>
            </div>

            {Object.keys(balanceByCurrency).length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {Object.entries(balanceByCurrency).map(([code, total]) => {
                  const m = currencyMeta(code);
                  return (
                    <div
                      key={code}
                      className="inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface-raised/50 px-3 py-1.5"
                    >
                      <span aria-hidden="true">{m.flag}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(total, code)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-micro text-content-muted mt-4">
              {stats.count} transfer{stats.count !== 1 ? 's' : ''} ·{' '}
              {formatMoney(stats.sent, primaryCurrency)} sent ·{' '}
              {formatMoney(stats.received, primaryCurrency)} received
            </p>
          </div>
        </Card>

        {error && (
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert tone="success" onDismiss={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        {accounts.length > 0 && (
          <section>
            <SectionHeading title="From accounts" icon={Wallet} />
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.map((a) => {
                const m = currencyMeta(a.currency);
                const active = a.id === fromAccount;
                const isDisabled = Boolean(a.is_locked) || Boolean(a.status && a.status !== 'active');
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setFromAccount(a.id);
                      openSend();
                    }}
                    disabled={isDisabled}
                    className={cx(
                      'text-left rounded-card border px-4 py-3 transition-colors',
                      active
                        ? 'border-brand-400 bg-brand-500/10'
                        : 'border-line-subtle bg-surface-raised/40 hover:border-line-strong',
                      isDisabled && 'opacity-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {m.flag} {a.account_name || `${a.currency} Account`}
                        </p>
                        <p className="text-micro text-content-muted font-mono mt-0.5">
                          {maskAccountNumber(a.account_number)}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums shrink-0">
                        {formatMoney(a.balance, a.currency)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <SectionHeading title="Transfer history" icon={Clock} />
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
        ) : transfers.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers yet"
            description="When you send money, it will appear here with the amount and date."
            action={
              <Button onClick={openSend} leftIcon={<Send className="w-4 h-4" />} disabled={!usableAccounts.length}>
                Send Money
              </Button>
            }
            hint="Tap any transaction to view full details."
          />
        ) : (
          <div className="space-y-3">
            {transfers.map((tx) => {
              const amt = parseFloat(tx.amount);
              const credit = isIncoming(tx);
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="w-full text-left"
                >
                  <Card className="p-4 transition-colors hover:border-line-strong hover:bg-surface-raised/60">
                    <div className="flex items-center gap-4">
                      <span
                        className={cx(
                          'w-11 h-11 rounded-card flex items-center justify-center shrink-0',
                          credit ? 'bg-emerald-500/10' : 'bg-red-500/10',
                        )}
                      >
                        {credit ? (
                          <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-red-400" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {credit ? 'Received' : 'Sent'}{' '}
                            {formatMoney(Math.abs(amt), tx.currency)}
                          </p>
                          {tx.status && <StatusBadge status={tx.status} />}
                        </div>
                        <p className="text-caption text-content-muted mt-0.5 truncate">
                          {tx.description || (credit ? 'Incoming transfer' : 'Outgoing transfer')}
                        </p>
                        <p className="text-micro text-content-muted mt-0.5">
                          {formatRelativeDay(tx.created_at)}
                        </p>
                      </div>
                      <span className="text-content-muted text-xs shrink-0">Details →</span>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}

        <Modal
          open={selectedTx !== null}
          onClose={() => {
            setSelectedTx(null);
            setCopied(false);
          }}
          title="Transaction details"
        >
          {selectedTx && (
            <div className="space-y-5">
              <div className="text-center py-4 rounded-card border border-line-subtle bg-surface-raised/40">
                <div
                  className={cx(
                    'mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3',
                    isIncoming(selectedTx) ? 'bg-emerald-500/15' : 'bg-red-500/15',
                  )}
                >
                  {isIncoming(selectedTx) ? (
                    <ArrowDownLeft className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ArrowUpRight className="w-6 h-6 text-red-400" />
                  )}
                </div>
                <p
                  className={cx(
                    'text-2xl font-bold tabular-nums',
                    isIncoming(selectedTx) ? 'text-emerald-400' : 'text-content-primary',
                  )}
                >
                  {isIncoming(selectedTx) ? '+' : '−'}
                  {formatMoney(Math.abs(parseFloat(selectedTx.amount)), selectedTx.currency)}
                </p>
                <p className="text-caption text-content-muted mt-1">{typeLabel(selectedTx)}</p>
                <div className="mt-2 flex justify-center">
                  <StatusBadge status={selectedTx.status || 'completed'} />
                </div>
              </div>

              <div className="rounded-card border border-line-subtle px-4">
                <DetailRow label="Date & time" value={formatDate(selectedTx.created_at)} />
                <DetailRow label="Type" value={typeLabel(selectedTx)} />
                <DetailRow label="Currency" value={selectedTx.currency} />
                {selectedTx.reference && (
                  <DetailRow label="Reference" value={selectedTx.reference} mono />
                )}
                {selectedTx.description && (
                  <DetailRow label="Description" value={selectedTx.description} />
                )}
                {selectedTx.account_number && (
                  <DetailRow
                    label="Account"
                    value={maskAccountNumber(selectedTx.account_number)}
                    mono
                  />
                )}
                <DetailRow label="Transaction ID" value={selectedTx.id} mono />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  fullWidth
                  leftIcon={<Copy className="w-4 h-4" />}
                  onClick={() => copyId(selectedTx.id)}
                >
                  {copied ? 'Copied' : 'Copy ID'}
                </Button>
                <Button fullWidth onClick={() => setSelectedTx(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          open={showModal}
          onClose={closeSendModal}
          title={modalStep === 'review' ? 'Review transfer' : 'Send Money'}
          description={
            modalStep === 'review'
              ? 'Confirm the details before the payment is sent.'
              : 'Send to a Rubicon account in the same currency.'
          }
        >
          <div className="space-y-4">
            {formError && <Alert tone="error">{formError}</Alert>}
            {modalStep === 'review' ? (
              <div className="rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-2">
                <DetailRow label="From" value={sel ? `${sel.account_name || sel.currency} · ${sel.account_number}` : '—'} mono />
                <DetailRow label="To account" value={toNumber.trim().replace(/\s+/g, '')} mono />
                <DetailRow
                  label="Amount"
                  value={formatMoney(parseFloat(amount) || 0, sel?.currency || primaryCurrency)}
                />
                {reference.trim() && <DetailRow label="Reference" value={reference.trim()} />}
                <DetailRow
                  label="Balance after"
                  value={formatMoney(
                    (parseFloat(sel?.balance || '0') || 0) - (parseFloat(amount) || 0),
                    sel?.currency || primaryCurrency,
                  )}
                />
              </div>
            ) : (
              <>

            <div className="rounded-card border border-line-subtle bg-surface-raised/30 p-3 space-y-3">
              <p className="text-caption text-content-muted flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                From
              </p>
              <Select
                label="Account"
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
                required
              >
                <option value="">Select an account</option>
                {usableAccounts.map((a) => {
                  const m = currencyMeta(a.currency);
                  return (
                    <option key={a.id} value={a.id}>
                      {m.flag} {a.account_name || `${a.currency} Account`} —{' '}
                      {maskAccountNumber(a.account_number)} ({formatMoney(a.balance, a.currency)})
                    </option>
                  );
                })}
              </Select>
              {sel && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-caption text-content-muted">Available balance</span>
                  <span className="text-sm font-bold tabular-nums">
                    {formatMoney(sel.balance, sel.currency)}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-card border border-line-subtle bg-surface-raised/30 p-3 space-y-3">
              <p className="text-caption text-content-muted flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" />
                To
              </p>
              <Input
                label="Recipient account number"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))}
                placeholder="e.g. 401837294501"
                required
                hint="12-digit account number · same currency"
              />
            </div>

            <Input
              label="Amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              leadingIcon={
                sel ? (
                  <span className="text-sm font-medium">{currencyMeta(sel.currency).symbol}</span>
                ) : undefined
              }
              hint={
                sel
                  ? `Maximum: ${formatMoney(sel.balance, sel.currency)}`
                  : 'Select an account first'
              }
            />

            <Input
              label="Payment reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Rent · Invoice 1042"
              hint="Shown on both statements"
              maxLength={80}
            />
              </>
            )}
          </div>
          <div className="mt-6 flex gap-3">
            {modalStep === 'review' ? (
              <>
                <Button variant="secondary" onClick={() => setModalStep('form')} disabled={busy}>
                  Edit
                </Button>
                <Button onClick={handleTransfer} loading={busy} loadingLabel="Sending…" fullWidth>
                  Confirm &amp; send
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={closeSendModal}>
                  Cancel
                </Button>
                <Button onClick={goToReview} fullWidth>
                  Review transfer
                </Button>
              </>
            )}
          </div>
        </Modal>
      </main>
    </div>
  );
}
