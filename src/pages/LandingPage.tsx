import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SkipLink } from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import {
  ArrowRight, Menu, X, Shield, Lock, Phone, ChevronRight,
  Landmark, Headphones, Globe2,
} from 'lucide-react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const IMG = {
  hero: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80',
  london: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1600&q=80',
  desk: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
  skyline: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1600&q=80',
  abstract: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80',
};

const NAV_ITEMS = [
  { label: 'Accounts', href: '#products' },
  { label: 'Why Rubicon', href: '#highlights' },
  { label: 'Rates', href: '#rates' },
  { label: 'Business', href: '#business' },
  { label: 'Guides', href: '#learn' },
  { label: 'About', href: '#about' },
];

const HOLDINGS = [
  { code: 'GBP', name: 'British Pound account', flag: '🇬🇧' },
  { code: 'USD', name: 'US Dollar account', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro account', flag: '🇪🇺' },
];

const PRODUCTS = [
  {
    title: 'Multi-currency accounts',
    desc: 'Hold sterling, dollars, and euros side by side — one login, clear statements.',
    image: IMG.desk,
    tag: 'Everyday banking',
  },
  {
    title: 'Business banking',
    desc: 'Accounts and tools for teams that operate across borders.',
    image: IMG.skyline,
    tag: 'Business',
  },
  {
    title: 'Secure digital access',
    desc: 'Balances, transfers, and history — protected around the clock.',
    image: IMG.abstract,
    tag: 'Security',
  },
];

const RATES = [
  { pair: 'GBP → USD', rate: '1.2710', change: '+0.12%' },
  { pair: 'GBP → EUR', rate: '1.1745', change: '+0.07%' },
  { pair: 'USD → EUR', rate: '0.9240', change: '-0.04%' },
  { pair: 'EUR → GBP', rate: '0.8514', change: '-0.07%' },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  const goTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white selection:bg-amber-500/30">
      <SkipLink />

      <div className="hidden md:block border-b border-white/5 bg-black/40">
        <div className="max-w-6xl mx-auto px-6 h-9 flex items-center justify-between text-[11px] tracking-wide text-slate-500">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-amber-500/80" /> Institutional banking
            </span>
            <span className="flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-amber-500/80" /> Client services: rubiconcapital@rubiconcapital.org
            </span>
            <a href="tel:+12136061732" className="flex items-center gap-1.5 hover:text-slate-300">
              <Phone className="w-3.5 h-3.5 text-amber-500/80" /> +1 (213) 606-1732
            </a>
            <LanguageSwitcher />
          </div>
          <span>Mon–Fri 08:00–18:00 GMT</span>
        </div>
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#070b14]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-[4.25rem] flex items-center justify-between gap-4">
          <a href="#top" onClick={(e) => goTo(e, '#top')} className="shrink-0">
            <BrandLogo size={36} withWordmark />
          </a>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => goTo(e, item.href)}
                className="px-3 py-2 text-[13px] text-slate-400 hover:text-white transition rounded-lg hover:bg-white/5"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-sm text-slate-300 border border-white/10 rounded-xl hover:border-white/25 hover:bg-white/5 transition"
            >
              <Lock className="w-3.5 h-3.5 opacity-70" />
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 rounded-xl shadow-[0_0_24px_-4px_rgba(245,158,11,0.45)] hover:from-amber-300 hover:to-amber-400 transition"
            >
              Open Account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg border border-white/10 text-slate-300"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-white/5 bg-[#0a0f1a] px-5 py-4 space-y-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => goTo(e, item.href)}
                className="block px-3 py-2.5 text-sm text-slate-300 rounded-lg hover:bg-white/5"
              >
                {item.label}
              </a>
            ))}
            <Link to="/login" className="block px-3 py-2.5 text-sm text-amber-400" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
          </div>
        )}
      </nav>

      <header id="top" className="relative isolate overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={IMG.hero}
            alt=""
            className="h-full w-full object-cover object-center scale-105"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-[#070b14]/55" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070b14] via-[#070b14]/85 to-[#070b14]/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-transparent to-[#070b14]/40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(245,158,11,0.12),transparent_55%)]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            <div className="lg:col-span-7">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-5 font-medium">
                <span className="w-8 h-px bg-amber-500/60" />
                Private multi-currency banking
              </p>
              <h1 className="text-[2.75rem] sm:text-5xl md:text-[3.35rem] font-semibold tracking-[-0.03em] leading-[1.08] max-w-xl">
                Banking in{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">
                  GBP, USD,
                </span>{' '}
                and{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
                  EUR
                </span>
              </h1>
              <p className="mt-6 text-base sm:text-lg text-slate-300/90 max-w-md leading-relaxed">
                One relationship. Three currencies. Clear statements and transfers built for how you actually move money.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 rounded-xl shadow-[0_0_40px_-8px_rgba(245,158,11,0.55)] hover:from-amber-300 hover:to-amber-400 transition"
                >
                  Open an Account
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#products"
                  onClick={(e) => goTo(e, '#products')}
                  className="inline-flex items-center gap-2 px-5 py-3.5 text-sm text-slate-200 border border-white/15 rounded-xl hover:bg-white/5 transition"
                >
                  Explore products
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-500/70" /> Bank-grade encryption
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-amber-500/70" /> GBP · USD · EUR
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent pointer-events-none" />
                <div className="relative p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-medium">
                      Your holdings
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400/90">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Secured
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {HOLDINGS.map((h) => (
                      <li
                        key={h.code}
                        className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/25 px-3.5 py-3.5 hover:border-amber-500/25 transition"
                      >
                        <span className="w-10 h-10 rounded-lg bg-slate-900/80 border border-white/10 flex items-center justify-center text-[11px] font-bold tracking-wide text-amber-400">
                          {h.code}
                        </span>
                        <span className="flex-1 text-sm text-slate-200">{h.name}</span>
                        <span className="text-lg" aria-hidden="true">{h.flag}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
                    Open one currency first — add others when you need them. Account numbers issued after approval.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="products" className="relative scroll-mt-24 py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="max-w-xl mb-12">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">Products</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Built for how capital actually moves
            </h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Not another generic fintech shell — accounts, statements, and transfers designed around multi-currency reality.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {PRODUCTS.map((p) => (
              <article
                key={p.title}
                className="group relative rounded-2xl overflow-hidden border border-white/8 bg-slate-900/40 min-h-[320px] flex flex-col"
              >
                <div className="absolute inset-0">
                  <img
                    src={p.image}
                    alt=""
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-[#070b14]/75 to-[#070b14]/20" />
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-500" />
                </div>
                <div className="relative mt-auto p-6 pt-24">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-amber-400/90">{p.tag}</span>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm text-slate-300/90 leading-relaxed">{p.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="highlights" className="scroll-mt-24 border-y border-white/5 bg-black/30">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 min-h-[420px]">
          <div className="relative min-h-[240px] lg:min-h-0 overflow-hidden">
            <img src={IMG.london} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#070b14] lg:block hidden" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] to-transparent lg:hidden" />
          </div>
          <div className="px-5 sm:px-10 py-14 lg:py-16 flex flex-col justify-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">Why Rubicon</p>
            <h2 className="text-3xl font-semibold tracking-tight mb-8">The essentials of good banking</h2>
            <ul className="space-y-6">
              {[
                { t: 'Multi-currency accounts', d: 'Pounds, dollars, and euros together in one place.' },
                { t: 'Clear pricing', d: 'No surprise charges — rates you can read on the statement.' },
                { t: 'Secure digital banking', d: 'Your money and your information, protected around the clock.' },
                { t: 'Support when you need it', d: 'Real people available Monday to Friday, London hours.' },
              ].map((item) => (
                <li key={item.t} className="flex gap-4">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <div>
                    <p className="font-medium text-slate-100">{item.t}</p>
                    <p className="text-sm text-slate-400 mt-0.5">{item.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="rates" className="scroll-mt-24 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-white/8 overflow-hidden bg-white/[0.02]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/8">
              <span className="text-sm font-medium text-slate-200">Indicative exchange rates</span>
              <span className="text-xs text-slate-500">Updated daily · illustrative only</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-white/5">
              {RATES.map((r) => (
                <div key={r.pair} className="px-6 py-6">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-2">{r.pair}</div>
                  <div className="text-2xl font-semibold tabular-nums tracking-tight">{r.rate}</div>
                  <div className={`text-xs mt-1 ${r.change.startsWith('-') ? 'text-slate-500' : 'text-amber-400'}`}>
                    {r.change}
                  </div>
                </div>
              ))}
            </div>
            <p className="px-6 py-4 text-xs text-slate-500 border-t border-white/5 leading-relaxed">
              Rates are shown for illustration only and are not a live quote. Actual rates are confirmed at the time of a transaction.
            </p>
          </div>
        </div>
      </section>

      <section id="business" className="scroll-mt-24 relative py-20 overflow-hidden">
        <div className="absolute inset-0">
          <img src={IMG.skyline} alt="" className="h-full w-full object-cover opacity-40" loading="lazy" />
          <div className="absolute inset-0 bg-[#070b14]/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070b14] via-[#070b14]/70 to-transparent" />
        </div>
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6">
          <div className="max-w-lg">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">Business</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Accounts for teams that cross borders</h2>
            <p className="mt-4 text-slate-300 leading-relaxed">
              Multi-currency operating accounts with the same clarity we give private clients — without the generic dashboard look.
            </p>
            <Link
              to="/signup"
              className="mt-8 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 rounded-xl hover:bg-amber-300 transition"
            >
              Talk to us about business
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-24 py-16 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 grid md:grid-cols-2 gap-12 items-start">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">About</p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Crossing the Rubicon with clarity</h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Rubicon Capital is built for clients who need sterling, dollars, and euros in one relationship — with statements and controls you can trust.
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <p className="text-sm text-slate-300 leading-relaxed">
              We focus on multi-currency accounts, secure digital access, and clear audit trails for every movement of funds. Account numbers are issued after approval.
            </p>
          </div>
        </div>
      </section>

      <section id="learn" className="scroll-mt-24 py-16 border-t border-white/5 bg-black/20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">Guides</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-8">How Rubicon works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              'Opening a multi-currency account',
              'Requesting a deposit',
              'Sending a transfer',
            ].map((title) => (
              <div
                key={title}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3.5"
              >
                <span className="text-sm text-slate-200">{title}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Guide</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-24 py-14 border-t border-white/5 bg-black/20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-slate-200">Client services</p>
            <p className="text-slate-400 text-sm mt-1">Mon–Fri 08:00–18:00 GMT</p>
          </div>
          <a
            href="mailto:rubiconcapital@rubiconcapital.org"
            className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition text-sm font-medium"
          >
            <Phone className="w-4 h-4" />
            rubiconcapital@rubiconcapital.org
          </a>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-10 flex flex-col md:flex-row md:items-start justify-between gap-8">
          <div>
            <BrandLogo size={32} withWordmark />
            <p className="mt-3 text-xs text-slate-500 max-w-xs leading-relaxed">
              Multi-currency banking for private and business clients. GBP · USD · EUR.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500">
            <a href="#about" onClick={(e) => goTo(e, '#about')} className="hover:text-amber-400 transition">About</a>
            <a href="#contact" onClick={(e) => goTo(e, '#contact')} className="hover:text-amber-400 transition">Contact</a>
            <Link to="/terms" className="hover:text-amber-400 transition">Terms</Link>
            <Link to="/privacy" className="hover:text-amber-400 transition">Privacy</Link>
            <Link to="/disclosures" className="hover:text-amber-400 transition">Disclosures</Link>
          </div>
        </div>
        <div id="legal" className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>© {new Date().getFullYear()} Rubicon Capital. All rights reserved.</span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-amber-500/60" /> Secured with 256-bit encryption
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
