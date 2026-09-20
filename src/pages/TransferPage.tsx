import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { currencyMeta } from '../lib/currencies';
import { maskAccountNumber, formatRelativeDay } from '../lib/format';
import {
  Alert, Button, Card, EmptyState, Input, Modal, PageHeader, Select,
  SectionHeading, Skeleton, StatusBadge,
} from '../components/ui';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2,
  Clock, Send, Wallet, XCircle,
} from 'lucide-react';
import { cx } from '../lib/designTokens';

const RAILS = {
  ach: {
    label: 'ACH',
    hint: 'ACH routing is 9 digits and usually starts with 0, 1 or 2 — e.g. 021, 026, 011, 121.',
    timing: '1–2 business days',
  },
  wire: {
    label: 'Wire transfer',
    hint: 'Wire routing is 9 digits (same family as ACH) and usually starts with 0, 1, 2 or 3 — e.g. 021000021.',
    timing: 'Same day if sent before cut-off',
  },
  swift: {
    label: 'SWIFT',
    hint: 'SWIFT/BIC starts with 4 letters (the bank), then the country — e.g. CHASUS33, BARCGB22, DEUTDEFF. IBANs start with a country code like GB, DE, FR.',
    timing: '1–5 business days',
  },
} as const;

type Rail = keyof typeof RAILS;

export default function TransferPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [fromAccount, setFromAccount] = useState('');
  const [toNumber, setToNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [transactionPin, setTransactionPin] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [outcome, setOutcome] = useState<{ ok: boolean; title: string; detail: string } | null>(null);
  const [payee, setPayee] = useState<any>(null);
  const [payeeHint, setPayeeHint] = useState('');
  const [rail, setRail] = useState<Rail>('wire');
  const [routing, setRouting] = useState('');
  const [swiftBic, setSwiftBic] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([api.getAccounts(), api.getTransfers()]);
      const rows = a.accounts || [];
      setAccounts(rows);
      setTransfers(t.transfers || []);
      setFromAccount((prev) => prev || rows.find((r: any) => !r.is_locked)?.id || rows[0]?.id || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.getPinStatus().then((r: any) => setHasPin(!!r.has_pin)).catch(() => {});
  }, []);

  useEffect(() => {
    const cleaned = toNumber.replace(/\s+/g, '');
    if (cleaned.length < 10) {
      setPayee(null);
      setPayeeHint('');
      return;
    }
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const token = localStorage.getItem('rubicon_token');
        const res = await fetch(`/api/transfers/lookup?number=${encodeURIComponent(cleaned)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (dead) return;
        if (data.found && data.payee) {
          setPayee(data.payee);
          setPayeeHint('');
        } else {
          setPayee(null);
          setPayeeHint('');
        }
      } catch {
        if (!dead) setPayee(null);
      }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [toNumber]);

  const usable = useMemo(() => accounts.filter((a) => !a.is_locked && (!a.status || a.status === 'active')), [accounts]);
  const sel = accounts.find((a) => a.id === fromAccount);
  const incoming = (t: any) => {
    const ty = String(t.type || '').toLowerCase();
    return ty === 'transfer_in' || ty === 'deposit' || ty === 'credit';
  };

  const buildReference = (): string => {
    const bits: string[] = [RAILS[rail].label];
    if (reference.trim()) bits.push(reference.trim());
    if (routing) bits.push(`RTN ${routing}`);
    if (swiftBic) bits.push(`BIC ${swiftBic}`);
    if (iban) bits.push(`IBAN ${iban}`);
    if (bankName) bits.push(bankName);
    return bits.join(' · ');
  };

  const send = async () => {
    setFormError('');
    setBusy(true);
    try {
      const cleaned = toNumber.trim().replace(/\s+/g, '');
      await api.initiateTransfer({
        from_account_id: fromAccount,
        to_account_number: cleaned,
        amount: parseFloat(amount),
        reference: buildReference(),
        transaction_pin: transactionPin || undefined,
      });
      const money = formatMoney(parseFloat(amount), sel?.currency || 'USD');
      const who = payee?.name ? ` to ${payee.name}` : ` to ${cleaned}`;
      setOutcome({ ok: true, title: `${RAILS[rail].label} sent`, detail: `${money} sent${who}.` });
      setStep('done');
      setToNumber(''); setAmount(''); setReference(''); setTransactionPin('');
      setRouting(''); setSwiftBic(''); setIban(''); setBankName('');
      await load();
    } catch (e: any) {
      setOutcome({ ok: false, title: `${RAILS[rail].label} failed`, detail: e?.message || 'The payment could not be sent.' });
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const openSend = () => { setFormError(''); setStep('form'); setOutcome(null); setShowModal(true); };

  const goReview = () => {
    if (!fromAccount) return setFormError('Select an account');
    if (!toNumber.trim()) return setFormError('Enter the recipient account number');
    if (!amount || parseFloat(amount) <= 0) return setFormError('Enter a valid amount');
    setFormError('');
    setStep('review');
  };

  return (
    <div className="min-h-screen bg-surface">
      <PageHeader title="Transfers" subtitle="Send money from your accounts" backTo="/dashboard" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
        <Card className="p-6">
          <p className="text-caption text-content-muted mb-1 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Available to send</p>
          <p className="text-2xl font-bold tabular-nums">{loading ? <Skeleton className="h-8 w-40" /> : formatMoney(parseFloat(sel?.balance || accounts[0]?.balance || '0'), sel?.currency || accounts[0]?.currency || 'USD')}</p>
          <Button className="mt-4 w-full sm:w-auto" onClick={openSend} leftIcon={<Send className="w-4 h-4" />} disabled={!usable.length}>Send Money</Button>
        </Card>
        {error && <Alert tone="error">{error}</Alert>}

        <SectionHeading title="Transfer history" icon={Clock} />
        {transfers.length === 0 && !loading ? (
          <EmptyState icon={ArrowLeftRight} title="No transfers yet" description="Send money to another account to see it here." />
        ) : (
          <div className="space-y-3">
            {transfers.map((tx: any) => {
              const credit = incoming(tx);
              return (
                <Card key={tx.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className={cx('w-10 h-10 rounded-card flex items-center justify-center', credit ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                      {credit ? <ArrowDownLeft className="w-5 h-5 text-emerald-400" /> : <ArrowUpRight className="w-5 h-5 text-red-400" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{credit ? 'Received' : 'Sent'} {formatMoney(Math.abs(parseFloat(tx.amount)), tx.currency)}</p>
                      <p className="text-caption text-content-muted truncate">{tx.description || tx.reference || ''}</p>
                      <p className="text-micro text-content-muted">{formatRelativeDay(tx.created_at)}</p>
                    </div>
                    {tx.status && <StatusBadge status={tx.status} />}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Modal
          open={showModal}
          onClose={() => { setShowModal(false); setStep('form'); }}
          title={step === 'done' ? (outcome?.title || 'Transfer') : step === 'review' ? 'Review transfer' : 'Send Money'}
        >
          {step === 'done' && outcome ? (
            <div className="text-center py-6 space-y-4">
              <div className={cx('mx-auto w-20 h-20 rounded-full flex items-center justify-center', outcome.ok ? 'bg-emerald-500/15' : 'bg-red-500/15')}>
                {outcome.ok ? <CheckCircle2 className="w-12 h-12 text-emerald-400" /> : <XCircle className="w-12 h-12 text-red-400" />}
              </div>
              <p className={cx('text-xl font-semibold', outcome.ok ? 'text-emerald-300' : 'text-red-300')}>{outcome.title}</p>
              <p className="text-sm text-content-secondary">{outcome.detail}</p>
              <Button fullWidth onClick={() => { setShowModal(false); setStep('form'); setOutcome(null); setPayee(null); }}>Done</Button>
              {!outcome.ok && <Button variant="secondary" fullWidth onClick={() => { setStep('form'); setOutcome(null); }}>Try again</Button>}
            </div>
          ) : (
            <div className="space-y-4">
              {formError && <Alert tone="error">{formError}</Alert>}
              {step === 'review' ? (
                <div className="rounded-card border border-line-subtle px-4 py-3 space-y-2 text-sm">
                  <p><span className="text-content-muted">Method </span>{RAILS[rail].label}</p>
                  <p><span className="text-content-muted">From </span>{sel ? `${sel.account_name || sel.currency} · ${maskAccountNumber(sel.account_number)}` : '—'}</p>
                  <p><span className="text-content-muted">To </span>{payee?.name ? `${payee.name} · ` : ''}{toNumber}</p>
                  {routing && <p><span className="text-content-muted">Routing </span>{routing}</p>}
                  {swiftBic && <p><span className="text-content-muted">SWIFT </span>{swiftBic}</p>}
                  {iban && <p><span className="text-content-muted">IBAN </span>{iban}</p>}
                  <p className="font-semibold">{formatMoney(parseFloat(amount) || 0, sel?.currency || 'USD')}</p>
                </div>
              ) : (
                <>
                  <Select label="From account" value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
                    {usable.map((a) => {
                      const m = currencyMeta(a.currency);
                      return <option key={a.id} value={a.id}>{m.flag} {a.account_name || a.currency} — {formatMoney(a.balance, a.currency)}</option>;
                    })}
                  </Select>
                  <Select label="Transfer type" value={rail} onChange={(e) => setRail(e.target.value as Rail)} hint={RAILS[rail].hint}>
                    <option value="wire">Wire transfer</option>
                    <option value="ach">ACH</option>
                    <option value="swift">SWIFT transfer</option>
                  </Select>
                  <Input
                    label={rail === 'swift' ? 'Account number or IBAN' : 'Recipient account number'}
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
                    placeholder={rail === 'swift' ? 'Starts with GB, DE, FR… or digits' : 'Account number'}
                    hint={payee?.name || payeeHint || undefined}
                  />
                  {(rail === 'ach' || rail === 'wire') && (
                    <Input
                      label={rail === 'ach' ? 'ACH routing number' : 'Wire routing number'}
                      value={routing}
                      onChange={(e) => setRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      placeholder={rail === 'ach' ? 'Starts with 0, 1 or 2 — 9 digits' : 'Starts with 0–3 — 9 digits'}
                      hint={RAILS[rail].hint}
                      inputMode="numeric"
                    />
                  )}
                  {rail === 'wire' && (
                    <Input label="Bank name (optional)" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                  )}
                  {rail === 'swift' && (
                    <>
                      <Input
                        label="SWIFT / BIC"
                        value={swiftBic}
                        onChange={(e) => setSwiftBic(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 11))}
                        placeholder="Starts with 4 letters — CHASUS33"
                        hint={RAILS.swift.hint}
                      />
                      <Input
                        label="IBAN"
                        value={iban}
                        onChange={(e) => setIban(e.target.value.replace(/\s+/g, '').toUpperCase())}
                        placeholder="Starts with country code — GB, DE, FR"
                      />
                      <Input label="Bank name (optional)" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                    </>
                  )}
                  <Input label="Amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Input label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
                </>
              )}
              {step === 'review' && hasPin && (
                <Input label="Transaction PIN" type="password" inputMode="numeric" value={transactionPin} onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              )}
              <div className="flex gap-3 pt-2">
                {step === 'review' ? (
                  <>
                    <Button variant="secondary" onClick={() => setStep('form')} disabled={busy}>Edit</Button>
                    <Button onClick={send} loading={busy} loadingLabel="Sending…" fullWidth>Confirm & send</Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                    <Button fullWidth onClick={goReview}>Review transfer</Button>
                  </>
                )}
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}
