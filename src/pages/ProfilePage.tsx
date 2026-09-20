import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatShortDate } from '../lib/format';
import { Badge, Button, Card, Input, Modal, PageHeader, StatusBadge } from '../components/ui';
import { SettingsRow, SettingsSection, SettingsToggle } from '../components/ui/SettingsRow';
import { cx } from '../lib/designTokens';
import {
  Bell, Calendar, Globe2, HelpCircle, KeyRound, Landmark, Languages,
  LayoutGrid, LifeBuoy, Lock, LogOut, Mail, MapPin, Phone, ShieldCheck, Smartphone,
  User, FileText, Scale, Info,
} from 'lucide-react';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const profileFields = useMemo(() => ({
    phone: 'Not set', dob: 'Not set', address: 'Not set', country: 'United Kingdom',
  }), []);

  const openEdit = (field: string, label: string, current: string) => {
    setEditField(field); setEditLabel(label);
    setEditValue(current === 'Not set' ? '' : current); setError(''); setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    setBusy(true); setError('');
    try {
      setShowEditModal(false); setSuccess(`${editLabel} updated.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) { setError(e?.message || 'Update failed'); }
    finally { setBusy(false); }
  };

  const handlePasswordChange = async () => {
    setError('');
    if (!currentPw || !newPw) { setError('Fill in all password fields'); return; }
    if (newPw.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await api.changePassword({ current_password: currentPw, new_password: newPw });
      setShowPasswordModal(false); setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setSuccess('Password changed successfully. A confirmation email was sent.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) { setError(e?.message || 'Password change failed'); }
    finally { setBusy(false); }
  };

  const signOut = () => { logout(); navigate('/'); };

  return (
    <div className="min-h-screen bg-surface">
      <PageHeader title="Profile & Settings" backTo="/dashboard" />
      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 pb-32 space-y-6">
        {error && <div className="rounded-control bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">{error}</div>}
        {success && <div className="rounded-control bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 text-sm">{success}</div>}

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xl shadow-amber shrink-0">
              {getInitials(user?.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-content-primary truncate">{user?.full_name}</h2>
              <p className="text-caption text-content-muted truncate">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={user?.is_locked ? 'locked' : 'active'} />
                <Badge tone="neutral" dot>Email on file</Badge>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-line-subtle flex items-center justify-between text-caption text-content-muted">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Member since {user?.created_at ? formatShortDate(user.created_at) : '—'}
            </span>
            <span className="font-mono text-micro">ID: {user?.id?.slice(0, 8)}…</span>
          </div>
        </Card>

        <SettingsSection title="Personal Information">
          <SettingsRow icon={User} label="Full Name" value={user?.full_name}
            onClick={() => openEdit('full_name', 'Full Name', user?.full_name || '')} />
          <SettingsRow icon={Mail} label="Email Address" value={user?.email}
            onClick={() => openEdit('email', 'Email', user?.email || '')} />
          <SettingsRow icon={Phone} label="Phone Number" value={profileFields.phone}
            onClick={() => openEdit('phone', 'Phone Number', profileFields.phone)} />
          <SettingsRow icon={Calendar} label="Date of Birth" value={profileFields.dob}
            onClick={() => openEdit('date_of_birth', 'Date of Birth', profileFields.dob)} />
          <SettingsRow icon={MapPin} label="Address" value={profileFields.address}
            onClick={() => openEdit('address', 'Address', profileFields.address)} />
          <SettingsRow icon={Globe2} label="Country" value={profileFields.country}
            onClick={() => openEdit('country', 'Country', profileFields.country)} />
        </SettingsSection>

        <SettingsSection title="Security">
          <SettingsRow icon={KeyRound} label="Change Password" value="Last changed —"
            onClick={() => { setError(''); setShowPasswordModal(true); }} />
          <SettingsRow icon={Lock} label="Transaction PIN" value="Not set"
            onClick={() => { setSuccess('Transaction PIN feature coming soon.'); setTimeout(() => setSuccess(''), 3000); }} />
          <SettingsRow icon={ShieldCheck} label="Two-Factor Authentication"
            value="Email code required at every sign-in"
            trailing={<SettingsToggle enabled={false} onChange={() => { setSuccess('2FA setup coming soon.'); setTimeout(() => setSuccess(''), 3000); }} label="Toggle 2FA" />} />
          <SettingsRow icon={Smartphone} label="Active Sessions" value="1 device"
            onClick={() => { setSuccess('Session management coming soon.'); setTimeout(() => setSuccess(''), 3000); }} />
          <SettingsRow icon={Bell} label="Login Alerts" value={loginAlerts ? 'On' : 'Off'}
            trailing={<SettingsToggle enabled={loginAlerts} onChange={setLoginAlerts} label="Toggle login alerts" />} />
        </SettingsSection>

        <SettingsSection title="Account Limits">
          <div className="px-5 py-4 space-y-4">
            <LimitBar label="Per Transaction" used={0} total={5000} currency="GBP" />
            <LimitBar label="Daily Transfer" used={0} total={20000} currency="GBP" />
            <LimitBar label="Monthly Transfer" used={0} total={100000} currency="GBP" />
            <LimitBar label="Crypto" used={0} total={10000} currency="GBP" />
          </div>
          <div className="px-5 pb-4">
            <p className="text-caption text-content-muted flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Contact support to request a limit increase.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection title="Preferences">
          <SettingsRow icon={Bell} label="Push Notifications" value={notifEnabled ? 'Enabled' : 'Disabled'}
            trailing={<SettingsToggle enabled={notifEnabled} onChange={setNotifEnabled} label="Toggle notifications" />} />
          <SettingsRow icon={Languages} label="Language" value="English"
            onClick={() => { setSuccess('Language settings coming soon.'); setTimeout(() => setSuccess(''), 3000); }} />
          <SettingsRow icon={LayoutGrid} label="Default Currency" value="GBP — British Pound"
            onClick={() => { setSuccess('Currency preference coming soon.'); setTimeout(() => setSuccess(''), 3000); }} />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow icon={HelpCircle} label="Help Centre"
            onClick={() => { setSuccess('Help centre coming soon.'); setTimeout(() => setSuccess(''), 3000); }} />
          <SettingsRow icon={LifeBuoy} label="Contact Support" value="support@rubiconcapital.org" />
        </SettingsSection>

        <SettingsSection title="Legal">
          <SettingsRow icon={FileText} label="Terms of Service" onClick={() => navigate('/terms')} />
          <SettingsRow icon={Scale} label="Privacy Policy" onClick={() => navigate('/privacy')} />
          <SettingsRow icon={Landmark} label="Disclosures" onClick={() => navigate('/disclosures')} />
        </SettingsSection>

        <div className="text-center pt-2 pb-4">
          <p className="text-micro text-content-muted">Rubicon Capital v1.0.0</p>
          <p className="text-micro text-content-muted mt-0.5">© {new Date().getFullYear()} Rubicon Capital Ltd.</p>
        </div>

        <Button variant="danger" fullWidth size="lg" onClick={signOut} leftIcon={<LogOut className="w-4 h-4" />}>
          Sign Out
        </Button>
      </main>

      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit ${editLabel}`}>
        <div className="space-y-4">
          {error && <div className="text-sm text-red-400">{error}</div>}
          <Input label={editLabel} value={editValue} onChange={e => setEditValue(e.target.value)}
            placeholder={`Enter your ${editLabel.toLowerCase()}`} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button onClick={handleSaveProfile} loading={busy} loadingLabel="Saving…" fullWidth>Save</Button>
        </div>
      </Modal>

      <Modal open={showPasswordModal} onClose={() => { setShowPasswordModal(false); setError(''); }}
        title="Change Password" description="Enter your current password and choose a new one.">
        <div className="space-y-4">
          {error && <div className="text-sm text-red-400">{error}</div>}
          <Input label="Current Password" type="password" revealable value={currentPw}
            onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" />
          <Input label="New Password" type="password" revealable value={newPw}
            onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters"
            hint="Use a mix of letters, numbers, and symbols." />
          <Input label="Confirm New Password" type="password" revealable value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => { setShowPasswordModal(false); setError(''); }}>Cancel</Button>
          <Button onClick={handlePasswordChange} loading={busy} loadingLabel="Updating…" fullWidth>Update Password</Button>
        </div>
      </Modal>
    </div>
  );
}

function LimitBar({ label, used, total, currency }: { label: string; used: number; total: number; currency: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-label text-content-primary">{label}</span>
        <span className="text-caption text-content-muted">{sym}{used.toLocaleString()} / {sym}{total.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-overlay/60 overflow-hidden">
        <div className={cx('h-full rounded-full transition-all duration-slow', pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-brand-400' : 'bg-emerald-400')}
          style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}
