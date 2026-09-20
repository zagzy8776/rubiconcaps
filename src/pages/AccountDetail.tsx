import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatMoney } from '../lib/api';
import { currencyMeta } from '../lib/currencies';
import { formatDate, maskAccountNumber, maskBalance, titleCase } from '../lib/format';
import { validateAmount } from '../lib/validation';
import { useBalanceVisibility } from '../hooks/useBalanceVisibility';
import {
  Alert, Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, LoadingState,
  Modal, PageHeader, SectionHeading, Select, SkipLink, StatusBadge,
} from '../components/ui';
import {
  ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CheckCircle2, Eye, EyeOff,
  Copy, Download, Minus, Plus, Receipt,
} from 'lucide-react';

type ActionKind = 'deposit' | 'withdraw' | 'transfer';

interface Account {
  id: string;
  account_number: string;
  account_name: string;
  currency: string;
  balance: string;
  status: string;
  is_locked: boolean;
  routing_number?: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  description?: string;
  reference?: string;
  status?: string;
  created_at: string;
}

const ACTION_COPY: Record<ActionKind, { title: string; description: string; cta: string }> = {
  deposit: { title: 'Request a deposit', description: 'Submit a deposit request. An admin must approve before funds are credited.', cta: 'Submit request' },
  withdraw: { title: 'Withdraw funds', description: 'Move money out of this account.', cta: 'Confirm withdrawal' },
  transfer: {
    title: 'Transfer funds',
    description: 'Move money to another account holding the same currency.',
    cta: 'Confirm transfer',
  },
};

function isCredit(type: string, amount?: string) {
  if (type === 'deposit' || type === 'admin_credit') return true;
  if (type === 'withdrawal' || type === 'admin_debit') return false;
  if (amount !== undefined) return parseFloat(amount) >= 0;
  return false;
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<Account | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [modal, setModal] = useState<ActionKind | null>(null);
  const [amount, setAmount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [desc, setDesc] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [downloadingStatement, setDownloadingStatement] = useState(false);

  const { hideBalances, toggle } = useBalanceVisibility();

  const routingLabel = (currency?: string) => {
    if (currency === 'GBP') return 'Sort code';
    if (currency === 'USD') return 'Routing number';
    if (currency === 'EUR') return 'Bank code';
    return 'Routing number';
  };

  const copyText = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch { /* ignore */ }
  };

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [accountRes, txRes, accountsRes] = await Promise.all([
        api.getAccount(id!),
        api.getTransactions(id!),
        api.getAccounts(),
      ]);
      setAccount(accountRes.account);
      setTxs(txRes.transactions ?? []);
      setAllAccounts((accountsRes.accounts ?? []).filter((a: Account) => a.id !== id));
    } catch (e: any) {
      setLoadError(e?.message || 'We could not load this account.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const meta = currencyMeta(account?.currency);
  const balanceValue = parseFloat(account?.balance ?? '0');

  const transferTargets = useMemo(
    () => allAccounts.filter((a) => a.currency === account?.currency && !a.is_locked),
    [allAccounts, account?.currency],
  );

  const openModal = (kind: ActionKind) => {
    setModal(kind);
    setAmount('');
    setDesc('');
    setToAccount('');
    setAmountError(undefined);
    setFormError('');
  };

  const closeModal = () => {
    setModal(null);
    setFormError('');
    setAmountError(undefined);
  };

  const submit = async () => {
    if (!modal || !id) return;
    const max = modal === 'deposit' ? undefined : balanceValue;
    const nextAmountError = validateAmount(amount, account?.currency, max);
    setAmountError(nextAmountError);
    if (nextAmountError) return;
    if (modal === 'transfer' && !toAccount) {
      setFormError('Choose the account you want to transfer to.');
      return;
    }

    setBusy(true);
    setFormError('');
    try {
      if (modal === 'deposit') {
        await api.deposit({ account_id: id, amount, description: desc, reference: desc });
      } else if (modal === 'withdraw') {
        await api.createWithdrawal({
          account_id: id,
          amount: parseFloat(String(amount)),
          reference: desc || undefined,
        });
      } else {
        await api.transfer({ from_account_id: id, to_account_id: toAccount, amount, description: desc });
      }
      const formatted = formatMoney(amount, account?.currency);
      setSuccess(
        modal === 'deposit'
          ? `Deposit request for ${formatted} submitted. Funds appear after admin approval.`
          : modal === 'withdraw'
            ? `Withdrawal request for ${formatted} submitted. An admin will review it shortly.`
            : `${formatted} transferred successfully.`,
      );
      closeModal();
      await load();
    } catch (e: any) {
      setFormError(e?.message || 'That request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface">
        <SkipLink />
        <main id="main-content" className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-16">
          <LoadingState label="Loading your account…" />
        </main>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-surface">
        <SkipLink />
        <main id="main-content" className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-16">
          <ErrorState
            title="Account unavailable"
            message={loadError || 'This account could not be found, or you no longer have access to it.'}
            onRetry={load}
            hint="Return to your dashboard to see every account you hold."
          />
          <div className="mt-6 text-center">
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </Button>
          </div>
        </main>
      </div>
    );
  }


  const downloadStatement = async () => {
    if (!account) return;
    setDownloadingStatement(true);
    setLoadError('');
    try {
      await api.downloadStatementPdf(account.id);
      setSuccess('Statement PDF downloaded.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not download statement');
    } finally {
      setDownloadingStatement(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-16">
      <SkipLink />

      <PageHeader
        title={titleCase(account.account_name || `${account.currency} Account`)}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-mono tracking-wide">{account.account_number}</span>
            <Badge tone="neutral">{account.currency}</Badge>
          </span>
        }
        backTo="/dashboard"
        backLabel="Back to dashboard"
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: titleCase(account.account_name || `${account.currency} Account`) },
        ]}
        actions={
          <div className="flex items-center gap-1">
            <IconButton
              label="Download statement PDF"
              onClick={() => void downloadStatement()}
              disabled={downloadingStatement || !account}
            >
              <Download className="w-5 h-5" />
            </IconButton>
            <IconButton
              label={hideBalances ? 'Show balance' : 'Hide balance'}
              aria-pressed={hideBalances}
              onClick={toggle}
            >
              {hideBalances ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </IconButton>
          </div>
        }
      />

      <main id="main-content" className="w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 pt-6 sm:pt-8">
        {success && (
          <Alert tone="success" title="Done" onDismiss={() => setSuccess('')}>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              {success}
            </span>
          </Alert>
        )}

        {loadError && (
          <Alert tone="error" title="We could not refresh this account" onDismiss={() => setLoadError('')}>
            {loadError}
          </Alert>
        )}

        <Card className="relative overflow-hidden p-5 sm:p-8 mb-8">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,_rgba(245,158,11,0.10),transparent_55%)]"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="w-12 h-12 rounded-card bg-surface-overlay/70 flex items-center justify-center text-xl shadow-card"
                  aria-hidden="true"
                >
                  {meta.flag}
                </span>
                <div>
                  <p className="text-label text-content-secondary">{meta.label}</p>
                  <p className="text-caption text-content-muted">Available balance</p>
                </div>
              </div>
              <StatusBadge status={account.status} locked={account.is_locked} />
            </div>

            <p className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">
              {maskBalance(formatMoney(account.balance, account.currency), hideBalances)}
            </p>

            {account.is_locked && (
              <p className="mt-4 text-sm text-red-400">
                This account is locked, so deposits, withdrawals and transfers are unavailable.
                Contact client services to unlock it.
              </p>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                variant="success"
                onClick={() => openModal('deposit')}
                disabled={account.is_locked}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Deposit
              </Button>
              <Button
                variant="secondary"
                onClick={() => openModal('withdraw')}
                disabled={account.is_locked}
                leftIcon={<Minus className="w-4 h-4" />}
                className="text-red-300 border-red-500/30 hover:border-red-500/50"
              >
                Withdraw
              </Button>
              <Button
                variant="primary"
                onClick={() => openModal('transfer')}
                disabled={account.is_locked || transferTargets.length === 0}
                leftIcon={<ArrowRightLeft className="w-4 h-4" />}
              >
                Transfer
              </Button>
            </div>

            {transferTargets.length === 0 && !account.is_locked && (
              <p className="mt-3 text-caption text-content-muted">
                Open a second {account.currency} account to transfer between accounts you own.
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6 mb-8">
          <p className="text-label text-content-secondary mb-4">Account details</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-caption text-content-muted mb-1">Account number</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm tracking-wide">{account.account_number}</span>
                <button
                  type="button"
                  onClick={() => copyText(account.account_number, 'account')}
                  className="text-caption text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedField === 'account' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <p className="text-caption text-content-muted mb-1">{routingLabel(account.currency)}</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm tracking-wide">
                  {account.routing_number || (account.currency === 'GBP' ? '04-00-26' : account.currency === 'USD' ? '026009593' : '20041000')}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      account.routing_number ||
                        (account.currency === 'GBP' ? '04-00-26' : account.currency === 'USD' ? '026009593' : '20041000'),
                      'routing',
                    )
                  }
                  className="text-caption text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedField === 'routing' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <p className="mt-4 text-caption text-content-muted">
            Bank: Rubicon Capital · Use these details for same-currency transfers on the platform.
          </p>
        </Card>

        <section className="mt-10" aria-labelledby="activity-heading">
          <SectionHeading
            id="activity-heading"
            title="Recent activity"
            icon={Receipt}
            action={
              txs.length > 0 ? (
                <span className="text-caption text-content-muted">
                  {txs.length} transaction{txs.length === 1 ? '' : 's'}
                </span>
              ) : undefined
            }
          />

          {txs.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description={`Money moving in or out of this ${account.currency} account will appear here, newest first.`}
              action={
                <Button
                  onClick={() => openModal('deposit')}
                  disabled={account.is_locked}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Make a deposit
                </Button>
              }
              hint="Every deposit, withdrawal and transfer for this account is listed here."
            />
          ) : (
            <ul className="space-y-3">
              {txs.map((t) => (
                <TransactionRow key={t.id} tx={t} hidden={hideBalances} />
              ))}
            </ul>
          )}
        </section>
      </main>

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={modal ? ACTION_COPY[modal].title : ''}
        description={modal ? ACTION_COPY[modal].description : undefined}
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={closeModal} disabled={busy}>
              Cancel
            </Button>
            <Button fullWidth onClick={submit} loading={busy} loadingLabel="Processing…">
              {modal ? ACTION_COPY[modal].cta : 'Confirm'}
            </Button>
          </>
        }
      >
        {formError && (
          <Alert tone="error" onDismiss={() => setFormError('')}>
            {formError}
          </Alert>
        )}

        <div className="space-y-5">
          <Input
            label={`Amount (${account.currency})`}
            required
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (amountError) {
                setAmountError(
                  validateAmount(e.target.value, account.currency, modal === 'deposit' ? undefined : balanceValue),
                );
              }
            }}
            onBlur={() =>
              setAmountError(validateAmount(amount, account.currency, modal === 'deposit' ? undefined : balanceValue))
            }
            error={amountError}
            placeholder="0.00"
            hint={
              modal === 'deposit'
                ? 'Deposit requests are reviewed by admin before funds are credited.'
                : `Available to use: ${maskBalance(formatMoney(account.balance, account.currency), hideBalances)}`
            }
            leadingIcon={<span className="text-sm font-medium">{meta.symbol}</span>}
          />

          {modal === 'transfer' && (
            <Select label="To account" required value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="">Select an account</option>
              {transferTargets.map((a) => (
                <option key={a.id} value={a.id}>
                  {titleCase(a.account_name || `${a.currency} Account`)} — {maskAccountNumber(a.account_number)}
                </option>
              ))}
            </Select>
          )}

          <Input
            label="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Reference for your records"
            maxLength={120}
          />
        </div>
      </Modal>
    </div>
  );
}

function TransactionRow({ tx, hidden }: { tx: Transaction; hidden: boolean }) {
  const credit = isCredit(tx.type, tx.amount);
  const isWithdrawal = tx.type === 'withdrawal' || tx.type === 'admin_debit';
  const Icon = credit ? ArrowDownLeft : isWithdrawal ? ArrowUpRight : ArrowRightLeft;
  const label = isWithdrawal ? 'Withdrawal' : tx.type === 'transfer' ? 'Transfer' : 'Deposit';

  return (
    <li className="flex items-center justify-between gap-4 rounded-card border border-line-subtle bg-surface-raised/40 px-4 py-3.5 transition-colors duration-base hover:border-line-strong hover:bg-surface-raised/60">
      <div className="flex items-center gap-3.5 min-w-0">
        <span
          className={
            'w-10 h-10 rounded-control flex items-center justify-center shrink-0 ' +
            (credit
              ? 'bg-emerald-500/15 text-emerald-400'
              : isWithdrawal
                ? 'bg-red-500/15 text-red-400'
                : 'bg-brand-500/15 text-brand-400')
          }
          aria-hidden="true"
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-caption text-content-muted truncate">
            {tx.description || tx.reference || 'No description'}
          </p>
          <p className="text-micro text-content-muted mt-0.5">{formatDate(tx.created_at)}</p>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p
          className={
            'text-sm font-semibold tabular-nums ' +
            (credit ? 'text-emerald-400' : isWithdrawal ? 'text-red-400' : 'text-content-primary')
          }
        >
          <span aria-hidden="true">{credit ? '+' : '−'}</span>
          <span className="sr-only">{credit ? 'credit of ' : 'debit of '}</span>
          {maskBalance(formatMoney(tx.amount, tx.currency), hidden)}
        </p>
        {tx.status && tx.status !== 'completed' && (
          <span className="mt-1 inline-block">
            <StatusBadge status={tx.status} />
          </span>
        )}
      </div>
    </li>
  );
}
