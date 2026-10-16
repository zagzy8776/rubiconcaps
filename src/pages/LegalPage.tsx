import { Link, useParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

type Doc = 'terms' | 'privacy' | 'disclosures';

const TITLES: Record<Doc, string> = {
  terms: 'Terms of Use',
  privacy: 'Privacy Notice',
  disclosures: 'Important Disclosures',
};

const BODY: Record<Doc, string[]> = {
  terms: [
    'Rubicon Capital provides multi-currency banking services. Access to online banking is subject to these Terms of Use.',
    'You must provide accurate registration details and keep your credentials confidential. You are responsible for activity under your account.',
    'Your account balances, transfers, deposits, and any crypto features are subject to product terms, applicable limits, and verification requirements. Funds availability may depend on clearing, compliance review, and account status.',
    'We may suspend or terminate access for suspected misuse, fraud, or breach of these terms. Admin actions (including balance adjustments) are logged for audit.',
    'To the fullest extent permitted by law, Rubicon Capital is not liable for indirect or consequential losses arising from use of the online banking services, except where liability cannot be excluded under applicable law.',
    'These terms may be updated from time to time. Continued use after changes constitutes acceptance of the revised terms.',
  ],
  privacy: [
    'We collect account registration data (name, email), authentication credentials (stored as hashed passwords), device/session metadata, and transaction records required to operate the service.',
    'Data is used to authenticate you, process requests (deposits, transfers, account actions), send transactional emails (security alerts, statements), and meet audit, security, and regulatory compliance needs.',
    'We do not sell personal data. Service providers (for example email delivery and hosting) process data only to provide the service under contractual obligations.',
    'You may request access or correction of profile information via support channels. Security-related logs may be retained for a limited period for fraud prevention.',
    'Transactional emails are sent from our verified domain. Marketing messages, if any, will require separate consent.',
  ],
  disclosures: [
    'Rubicon Capital provides multi-currency banking services, including accounts, transfers, deposits, and related digital banking features, subject to applicable law and account terms.',
    'Account numbers, routing details, and payment instructions displayed in your account are issued for use with Rubicon Capital. Always verify details within your secure online banking session before sending funds.',
    'Deposit requests may be subject to review and verification before funds become available. Same-currency transfers between eligible accounts on the platform are typically processed promptly when both accounts are active and in good standing.',
    'Crypto-related balances and wallet features, where offered, are subject to the terms of those products. Only send digital assets to addresses shown in your authenticated account after confirming they are current and intended for that purpose.',
    'Nothing on this site constitutes investment, tax, or legal advice. Account balances, rates, and product availability may change. Past performance is not a guarantee of future results.',
    'For support contact rubiconcapital@rubiconcapital.org or the channels published on the site.',
  ],
};

export default function LegalPage() {
  const { doc } = useParams();
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const fromPath = path.replace(/^\//, '').split('/')[0] as Doc;
  const key = (['terms', 'privacy', 'disclosures'].includes(fromPath) ? fromPath : 'terms') as Doc;
  const paragraphs = BODY[key];

  return (
    <div className="min-h-screen bg-surface text-content-primary">
      <header className="border-b border-line-subtle">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/"><BrandLogo /></Link>
          <Link to="/login" className="text-sm text-amber-400 hover:text-amber-300">Sign in</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 pb-24">
        <nav className="flex flex-wrap gap-3 text-sm mb-8">
          {(['terms', 'privacy', 'disclosures'] as Doc[]).map((d) => (
            <Link
              key={d}
              to={`/${d}`}
              className={
                d === key
                  ? 'text-amber-400 font-medium'
                  : 'text-content-muted hover:text-content-primary'
              }
            >
              {TITLES[d]}
            </Link>
          ))}
        </nav>
        <h1 className="text-2xl font-semibold mb-6">{TITLES[key]}</h1>
        <div className="space-y-4 text-sm leading-relaxed text-content-secondary">
          {paragraphs.map((p) => (
            <p key={p.slice(0, 48)}>{p}</p>
          ))}
        </div>
        <p className="mt-10 text-caption text-content-muted">
          Last updated: September 2026 · Rubicon Capital
        </p>
      </main>
    </div>
  );
}
