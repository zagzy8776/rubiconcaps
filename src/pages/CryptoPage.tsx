import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatRelativeDay } from '../lib/format';
import { Alert, Button, Card, EmptyState, Input, Modal, PageHeader, Select, SectionHeading, Skeleton, SkeletonCard, StatusBadge } from '../components/ui';
import { Check, Coins, Copy, ExternalLink, Plus } from 'lucide-react';
import { cx } from '../lib/designTokens';

interface CryptoAccount { id: string; asset: string; wallet_address: string; balance: string; status: string; admin_note?: string; created_at: string; }
interface CryptoTx { id: string; transaction_type: string; amount: string; asset: string; reference?: string; status: string; created_at: string; }

const ASSETS: Record<string, { name: string; color: string; bg: string }> = {
  BTC: { name: 'Bitcoin', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ETH: { name: 'Ethereum', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  USDT: { name: 'Tether', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  USDC: { name: 'USD Coin', color: 'text-sky-400', bg: 'bg-sky-500/10' },
};

export default function CryptoPage() {
  const [accounts, setAccounts] = useState<CryptoAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<CryptoTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [asset, setAsset] = useState('BTC');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAccountId, setDepositAccountId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { const res = await api.getMyCrypto(); setAccounts(res.crypto_accounts || []); }
    catch (e: any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadTx = async (id: string) => {
    setSelectedId(id);
    try { const res = await api.getCryptoTransactions(id); setTransactions(res.transactions || []); }
    catch { setTransactions([]); }
  };

  const copyAddress = async (addr: string, id: string) => {
    try { await navigator.clipboard.writeText(addr); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } catch {}
  };


  const openDeposit = (id: string) => {
    setDepositAccountId(id);
    setDepositAmount('');
    setFormError('');
    setShowDeposit(true);
  };

  const handleCryptoDeposit = async () => {
    setFormError('');
    const amt = parseFloat(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    if (!depositAccountId) return;
    setBusy(true);
    try {
      await api.requestCryptoDeposit(depositAccountId, { amount: amt });
      setShowDeposit(false);
      setSuccess('Crypto deposit requested. You will be notified when it is credited.');
      setTimeout(() => setSuccess(''), 4000);
      if (selectedId === depositAccountId) await loadTx(depositAccountId);
    } catch (e: any) {
      setFormError(e?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async () => {
    setFormError(''); setSuccess('');
    setBusy(true);
    try {
      await api.requestCryptoAccount({ asset });
      setSuccess(`${asset} account request submitted! Awaiting admin approval.`);
      setShowRequest(false); await load();
    } catch (e: any) { setFormError(e?.message || 'Request failed'); }
    finally { setBusy(false); }
  };

  const activeAccounts = accounts.filter(a => a.status === 'active');

  return (
    <div className="min-h-screen bg-surface">
      <PageHeader title="Crypto" subtitle="Digital asset accounts" backTo="/dashboard" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">

        {/* ── Hero Summary ── */}
        <Card className="relative p-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-600/15 via-transparent to-sky-400/5 pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-caption text-content-muted mb-1">Crypto Portfolio</p>
              <p className="text-2xl md:text-3xl font-bold tracking-tight">
                {loading ? <Skeleton className="h-8 w-32" /> : `${activeAccounts.length} account${activeAccounts.length !== 1 ? 's' : ''}`}
              </p>
              <p className="text-caption text-content-muted mt-1.5">
                {accounts.length} total · {accounts.filter(a => a.status === 'pending').length} pending
              </p>
            </div>
            <Button onClick={() => setShowRequest(true)} leftIcon={<Plus className="w-4 h-4" />}>New Account</Button>
          </div>
        </Card>

        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
        {success && <Alert tone="success" onDismiss={() => setSuccess('')}>{success}</Alert>}

        {/* ── Crypto Accounts ── */}
        <SectionHeading title="Your Accounts" icon={Coins} />
        {loading ? (
          <div className="space-y-3">{[1,2].map(i => <SkeletonCard key={i} />)}</div>
        ) : accounts.length === 0 ? (
          <EmptyState icon={Coins} title="No crypto accounts"
            description="Request a crypto account to start managing digital assets."
            action={<Button onClick={() => setShowRequest(true)} leftIcon={<Plus className="w-4 h-4" />}>Request Account</Button>}
            hint="Accounts are reviewed and approved by admin." />
        ) : (
          <div className="space-y-3">
            {accounts.map(ca => {
              const meta = ASSETS[ca.asset] || { name: ca.asset, color: 'text-content-secondary', bg: 'bg-surface-overlay/60' };
              return (
                <Card key={ca.id} interactive className={cx('p-4', selectedId === ca.id && 'border-brand-400')} onClick={() => loadTx(ca.id)}>
                  <div className="flex items-center gap-4">
                    <span className={cx('w-12 h-12 rounded-card flex items-center justify-center shrink-0 font-bold text-sm', meta.bg, meta.color)}>{ca.asset}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{meta.name}</p>
                        <StatusBadge status={ca.status} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <p className="text-micro text-content-muted font-mono truncate">{ca.wallet_address}</p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); copyAddress(ca.wallet_address, ca.id); }}
                          className="shrink-0 text-content-muted hover:text-content-primary transition-colors" title="Copy address">
                          {copiedId === ca.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{parseFloat(ca.balance).toFixed(8)}</p>
                      <p className="text-micro text-content-muted">{ca.asset}</p>
                    </div>
                  </div>
                  {ca.status === 'active' && (
                    <div className="mt-3 pt-3 border-t border-line-subtle flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="secondary" onClick={() => openDeposit(ca.id)}>
                        Request deposit
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Crypto Transactions ── */}
        {selectedId && (
          <section>
            <SectionHeading title="Transactions" icon={ExternalLink} />
            {transactions.length === 0 ? (
              <p className="text-sm text-content-muted py-4 text-center">No transactions for this account.</p>
            ) : (
              <div className="space-y-3">{transactions.map(tx => {
                const isCredit = parseFloat(tx.amount) > 0;
                return (
                  <Card key={tx.id} className="p-4"><div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium capitalize">{tx.transaction_type.replace(/_/g, ' ').toLowerCase()}</p>
                      <p className="text-caption text-content-muted">{formatRelativeDay(tx.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className={cx('text-sm font-bold tabular-nums', isCredit ? 'text-emerald-400' : 'text-red-400')}>
                        {isCredit ? '+' : ''}{parseFloat(tx.amount).toFixed(8)} {tx.asset}</p>
                      <StatusBadge status={tx.status} />
                    </div>
                  </div></Card>
                );
              })}</div>
            )}
          </section>
        )}

        {/* ── Request Modal ── */}
        <Modal open={showRequest} onClose={() => { setShowRequest(false); setFormError(''); }}
          title="Request Crypto Account" description="Choose an asset to open a simulated crypto account.">
          <div className="space-y-4">
            {formError && <Alert tone="error">{formError}</Alert>}
            <Select label="Asset" value={asset} onChange={e => setAsset(e.target.value)}>
              {Object.entries(ASSETS).map(([code, meta]) => <option key={code} value={code}>{meta.name} ({code})</option>)}
            </Select>
            {ASSETS[asset] && (
              <div className="flex items-center gap-3 p-3 rounded-card bg-surface-overlay/40 border border-line-subtle">
                <span className={cx('w-10 h-10 rounded-control flex items-center justify-center font-bold text-sm', ASSETS[asset].bg, ASSETS[asset].color)}>{asset}</span>
                <div><p className="text-sm font-medium">{ASSETS[asset].name}</p><p className="text-caption text-content-muted">Simulated {asset} wallet</p></div>
              </div>
            )}
            <p className="text-caption text-content-muted">Accounts are reviewed by admin before activation.</p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setShowRequest(false)}>Cancel</Button>
            <Button onClick={handleRequest} loading={busy} loadingLabel="Requesting…" fullWidth>Request Account</Button>
          </div>
        </Modal>

        <Modal open={showDeposit} onClose={() => { setShowDeposit(false); setFormError(''); }}
          title="Request crypto deposit" description="Submit an amount to credit after review. Send only to your Rubicon wallet address.">
          <div className="space-y-4">
            {formError && <Alert tone="error">{formError}</Alert>}
            <Input
              label="Amount"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-caption text-content-muted">
              After you request a deposit, our team credits the balance once funds are confirmed. This is not an on-chain broadcast from the app.
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setShowDeposit(false)}>Cancel</Button>
            <Button onClick={handleCryptoDeposit} loading={busy} loadingLabel="Submitting…" fullWidth>Submit request</Button>
          </div>
        </Modal>
      </main>
    </div>
  );
}