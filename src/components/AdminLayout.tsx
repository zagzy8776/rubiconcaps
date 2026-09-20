import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { cx } from '../lib/designTokens';
import {
  Activity, ClipboardList, Coins, LayoutDashboard, LogOut, Shield,
  ScrollText, Users, Wallet, ArrowLeftRight,
} from 'lucide-react';

type AdminTab = 'overview' | 'users' | 'accounts' | 'deposits' | 'withdrawals' | 'crypto' | 'transactions' | 'audit' | 'activity';

const NAV_ITEMS: { id: AdminTab; label: string; icon: typeof Shield }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Customers', icon: Users },
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'deposits', label: 'Deposits', icon: ClipboardList },
  { id: 'withdrawals', label: 'Withdrawals', icon: ClipboardList },
  { id: 'crypto', label: 'Crypto', icon: Coins },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'audit', label: 'Audit Log', icon: ScrollText },
  { id: 'activity', label: 'Activity', icon: Activity },
];

interface AdminLayoutProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: React.ReactNode;
}

export default function AdminLayout({ activeTab, onTabChange, children }: AdminLayoutProps) {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const signOut = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={cx(
        'fixed inset-y-0 left-0 z-50 w-64 bg-surface-raised border-r border-line-subtle flex flex-col',
        'transform transition-transform duration-200 lg:transform-none lg:static lg:z-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="h-16 flex items-center gap-3 px-5 border-b border-line-subtle shrink-0">
          <span className="w-9 h-9 rounded-control bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center font-bold text-surface text-base shadow-amber">R</span>
          <div>
            <p className="font-semibold text-sm">Rubicon Capital</p>
            <p className="text-micro text-brand-400">Admin Console</p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { onTabChange(id); setSidebarOpen(false); }}
              className={cx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-medium transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                activeTab === id
                  ? 'bg-brand-400/10 text-brand-300'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-overlay/50'
              )}>
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-line-subtle space-y-3 shrink-0">
          <p className="text-micro text-content-muted px-1">Owner access only · not linked to customer banking session</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {admin?.full_name?.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'O'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{admin?.full_name || 'Owner'}</p>
              <p className="text-micro text-content-muted truncate">{admin?.email}</p>
            </div>
            <button onClick={signOut} className="text-content-muted hover:text-red-400 transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-surface-raised/50 border-b border-line-subtle flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-content-secondary hover:text-content-primary p-2 -ml-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="text-lg font-semibold">{NAV_ITEMS.find(n => n.id === activeTab)?.label || 'Admin'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-400/10 text-brand-300 text-caption font-medium">
              <Shield className="w-3 h-3" /> Owner
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export type { AdminTab };
