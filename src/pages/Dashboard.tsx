import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, formatMoney } from '../lib/api';
import { CURRENCIES, currencyMeta } from '../lib/currencies';
import { maskAccountNumber, maskBalance, titleCase, formatRelativeDay } from '../lib/format';
import { useBalanceVisibility, useScrolled } from '../hooks/useBalanceVisibility';
import {
  Alert, Button, Card, EmptyState, IconButton, Input, Modal, SectionHeading,
  Select, SkeletonList, SkipLink, StatusBadge,
} from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import { cx } from '../lib/designTokens';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Clock, CreditCard, Eye, EyeOff,
  Home, Menu, Plus, Send, Wallet, TrendingUp, Coins,
} from 'lucide-react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { NotificationBell } from '../components/NotificationBell';

const HERO_IMG =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80';

interface Account {
  id: string;
  account_number: string;
  account_name: string;
  currency: string;
  balance: string;
  status: string;
  is_locked: boolean;
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
  account_number?: string;
}

function isIncoming(tx: Transaction) {
  const ty = (tx.type || '').toLowerCase();
  if (['deposit', 'transfer_in', 'credit', 'admin_credit'].includes(ty)) return true;
  if (['withdrawal', 'transfer_out', 'debit', 'admin_debit'].includes(ty)) return false;
  return parseFloat(tx.amount) > 0;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const { hideBalances, toggle } = useBalanceVisibility();
  const scrolled = useScrolled();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const load = useCallback(async () => {
    setError('');
    try {
      const { accounts: rows } = await api.getAccounts();
      setAccounts(rows || []);
      if (rows?.length) {
        try {
          const txRes = await api.getTransactions(rows[0].id);
          setRecentTx((txRes.transactions || []).slice(0, 5));
        } catch {
          /* silent */
        }
      }
    } catch (e: any) {
      setError(e?.message || 'We could not load your accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalByCurrency = useMemo(
    () =>
      accounts.reduce((acc, a) => {
        acc[a.currency] = (acc[a.currency] || 0) + parseFloat(a.balance || '0');
        return acc;
      }, {} as Record<string, number>),
    [accounts],
  );

  const countByCurrency = useMemo(
    () =>
      accounts.reduce((acc, a) => {
        acc[a.currency] = (acc[a.currency] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [accounts],
  );

  const openNewAccount = (currency?: string) => {
    const available = CURRENCIES.filter((c) => !countByCurrency[c.code]);
    if (available.length === 0) return;
    setNewCurrency(currency || available[0].code);
    setNewName('');
    setCreateError('');
    setShowNew(true);
  };

  const availableCurrencies = CURRENCIES.filter((c) => !countByCurrency[c.code]);
  const allCurrenciesTaken = availableCurrencies.length === 0;

  const createAccount = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await api.createAccount({
        currency: newCurrency,
        account_name: newName.trim() || undefined,
      });
      setShowNew(false);
      setNewName('');
      await load();
    } catch (e: any) {
      setCreateError(e?.message || 'The account could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const primaryCurrency = accounts[0]?.currency || 'USD';
  const primaryBalance = totalByCurrency[primaryCurrency] || 0;

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col">
      <SkipLink />

      <header
        className={cx(
          'sticky top-0 z-header backdrop-blur-xl border-b transition-colors duration-200',
          scrolled ? 'bg-[#070b14]/95 border-white/8 shadow-lg shadow-black/20' : 'bg-[#070b14]/80 border-transparent',
        )}
      >
        <div className="w-full max-w-sm mx-auto px-4 sm:max-w-md md:max-w-2xl lg:max-w-4xl">
          <div className="h-16 flex items-center justify-between gap-3">
            <Link to="/dashboard" aria-label="Rubicon Capital home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <BrandLogo size={32} withWordmark />
            </Link>
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher className="mr-2" />
              <NotificationBell />
              <Link
                to="/profile"
                aria-label="Profile"
                className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 text-sm font-bold shadow-[0_0_16px_-4px_rgba(245,158,11,0.5)]"
              >
                {user?.full_name
                  ?.split(/\s+/)
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || '?'}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1 w-full max-w-sm mx-auto px-4 pt-5 pb-28 sm:max-w-md md:max-w-2xl lg:max-w-4xl">
        {/* Photographic balance hero */}
        <section className="relative mb-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40 min-h-[200px]">
          <div className="absolute inset-0">
            <img src={HERO_IMG} alt="" className="h-full w-full object-cover scale-105" />
            <div className="absolute inset-0 bg-[#070b14]/55" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#070b14]/80 via-[#070b14]/50 to-amber-900/20" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(245,158,11,0.18),transparent_55%)]" />
          </div>

          <div className="relative p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-sm text-slate-300/90">
                  {greeting}, {user?.full_name?.split(' ')[0] || 'Client'}
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mt-1">Available balance</p>
              </div>
              <IconButton
                label={hideBalances ? 'Show balances' : 'Hide balances'}
                onClick={toggle}
                className="border border-white/15 bg-black/30 backdrop-blur-sm text-slate-200 hover:bg-black/50"
              >
                {hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </IconButton>
            </div>

            <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-white drop-shadow-sm">
              {maskBalance(formatMoney(primaryBalance, primaryCurrency), hideBalances)}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-slate-300">
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-slate-300">
                {Object.keys(totalByCurrency).length || 1} currenc
                {Object.keys(totalByCurrency).length !== 1 ? 'ies' : 'y'}
              </span>
              {primaryCurrency && (
                <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300/90">
                  {primaryCurrency}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <div className={`grid ${allCurrenciesTaken ? 'grid-cols-3' : 'grid-cols-4'} gap-2 sm:gap-3 mb-8`}>
          {[
            { icon: Send, label: 'Send', color: 'from-amber-400 to-amber-600', onClick: () => navigate('/transfers') },
            { icon: ArrowDownLeft, label: 'Deposit', color: 'from-emerald-400 to-emerald-600', onClick: () => navigate('/deposits') },
            { icon: Coins, label: 'Crypto', color: 'from-sky-400 to-sky-600', onClick: () => navigate('/crypto') },
            ...(!allCurrenciesTaken
              ? [{ icon: Plus, label: 'New Account', color: 'from-violet-400 to-violet-600', onClick: () => openNewAccount() }]
              : []),
          ].map(({ icon: Icon, label, color, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex flex-col items-center gap-2 py-2.5 rounded-xl hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <span
                className={`w-12 h-12 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shadow-lg shadow-black/30`}
              >
                <Icon className="w-5 h-5 text-white" />
              </span>
              <span className="text-[11px] font-medium text-slate-400">{label}</span>
            </button>
          ))}
        </div>

        {error && (
          <Alert
            tone="error"
            title="We could not load your accounts"
            onDismiss={() => setError('')}
            action={
              <Button size="sm" variant="secondary" onClick={load}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {recentTx.length > 0 && (
          <section className="mb-8" aria-labelledby="activity-heading">
            <SectionHeading
              id="activity-heading"
              title="Recent Activity"
              icon={Clock}
              action={
                <button
                  type="button"
                  onClick={() => accounts[0] && navigate(`/account/${accounts[0].id}`)}
                  className="text-caption text-amber-400 hover:text-amber-300 font-medium"
                >
                  View all
                </button>
              }
            />
            <div className="space-y-2">
              {recentTx.map((tx) => {
                const credit = isIncoming(tx);
                return (
                  <Card key={tx.id} className="px-4 py-3 flex items-center justify-between border-white/8 bg-white/[0.03]">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cx(
                          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                          credit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
                        )}
                      >
                        {credit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-slate-100">
                          {tx.description || tx.type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-micro text-slate-500">{formatRelativeDay(tx.created_at)}</p>
                      </div>
                    </div>
                    <p
                      className={cx(
                        'text-sm font-semibold tabular-nums shrink-0 ml-3',
                        credit ? 'text-emerald-400' : 'text-slate-200',
                      )}
                    >
                      {credit ? '+' : '−'}
                      {formatMoney(Math.abs(parseFloat(tx.amount)), tx.currency)}
                    </p>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <section className="mb-8" aria-labelledby="portfolio-heading">
          <SectionHeading id="portfolio-heading" title="Portfolio" icon={TrendingUp} />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CURRENCIES.map(({ code, label, flag }) => {
              const total = totalByCurrency[code] || 0;
              const count = countByCurrency[code] || 0;
              return (
                <Card key={code} interactive={count > 0} className="relative group p-4 overflow-hidden border-white/8 bg-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-lg shrink-0">
                      {flag}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-caption text-slate-500">{label}</p>
                      <p className="text-lg font-bold tracking-tight tabular-nums">
                        {maskBalance(formatMoney(total, code), hideBalances)}
                      </p>
                    </div>
                    {count > 0 ? (
                      <span className="text-micro text-slate-500">
                        {count} acct{count !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openNewAccount(code)}
                        className="text-caption text-amber-400 hover:text-amber-300 font-medium"
                      >
                        Open →
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="accounts-heading">
          <SectionHeading
            id="accounts-heading"
            title="Your Accounts"
            icon={Wallet}
            action={
              accounts.length > 0 ? (
                <span className="text-caption text-slate-500">{accounts.length} total</span>
              ) : undefined
            }
          />
          {loading ? (
            <SkeletonList count={3} />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No accounts yet"
              description="Open your first account in sterling, dollars or euros."
              action={
                <Button onClick={() => openNewAccount()} leftIcon={<Plus className="w-4 h-4" />}>
                  Open your first account
                </Button>
              }
              hint="You can hold all three currencies at the same time."
            />
          ) : (
            <div className="grid gap-3">
              {accounts.map((a) => (
                <AccountCard key={a.id} account={a} hideBalances={hideBalances} />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-[11px] text-slate-600">© {new Date().getFullYear()} Rubicon Capital</p>
        </footer>
      </main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-header bg-[#070b14]/95 backdrop-blur-xl border-t border-white/8"
      >
        <div className="max-w-sm mx-auto px-2 sm:max-w-md md:max-w-2xl lg:max-w-4xl">
          <div className="h-20 flex items-center justify-around">
            <NavItem icon={Home} label="Home" active />
            <NavItem icon={CreditCard} label="Deposits" onClick={() => navigate('/deposits')} />
            <NavItem icon={ArrowLeftRight} label="Transfer" onClick={() => navigate('/transfers')} />
            <NavItem icon={Wallet} label="Crypto" onClick={() => navigate('/crypto')} />
            <NavItem icon={Menu} label="More" onClick={() => navigate('/profile')} />
          </div>
        </div>
      </nav>

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Open a new account"
        description="Choose a currency for your new account."
      >
        <div className="space-y-5">
          {createError && (
            <Alert tone="error" onDismiss={() => setCreateError('')}>
              {createError}
            </Alert>
          )}
          {availableCurrencies.length === 0 ? (
            <p className="text-sm text-slate-400">You already have accounts in all available currencies.</p>
          ) : (
            <>
              <Select label="Currency" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
                {availableCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} — {c.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Account name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Everyday Checking"
                maxLength={80}
                hint="Leave blank and we will name it after the currency."
              />
            </>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowNew(false)}>
            Cancel
          </Button>
          <Button onClick={createAccount} loading={creating} loadingLabel="Creating…" fullWidth>
            Create account
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AccountCard({ account, hideBalances }: { account: Account; hideBalances: boolean }) {
  const meta = currencyMeta(account.currency);
  return (
    <Link
      to={`/account/${account.id}`}
      className={cx(
        'group relative flex items-center justify-between gap-4 rounded-2xl border border-white/8',
        'bg-white/[0.03] px-4 py-4',
        'transition hover:border-white/15 hover:bg-white/[0.05]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-bold text-base shrink-0 shadow-lg shadow-amber-500/20">
          {meta.symbol}
        </span>
        <div className="min-w-0">
          <p className="font-semibold truncate group-hover:text-amber-300 transition">
            {titleCase(account.account_name || `${account.currency} Account`)}
          </p>
          <p className="text-caption text-slate-500 font-mono mt-1">{maskAccountNumber(account.account_number)}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-semibold tabular-nums mb-1.5">
          {maskBalance(formatMoney(account.balance, account.currency), hideBalances)}
        </p>
        <StatusBadge status={account.status} locked={account.is_locked} />
      </div>
    </Link>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex flex-col items-center gap-1 min-w-[64px] py-2 px-2 rounded-xl',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        active ? 'text-amber-400 bg-amber-400/10' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5',
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[11px] font-medium">{label}</span>
      <span className={cx('w-1 h-1 rounded-full', active ? 'bg-amber-400' : 'bg-transparent')} />
    </button>
  );
}
