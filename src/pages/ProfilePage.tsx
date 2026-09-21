import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatShortDate } from '../lib/format';
import { Badge, Button, Card, Input, Modal, PageHeader, StatusBadge } from '../components/ui';
import { SettingsRow, SettingsSection, SettingsToggle } from '../components/ui/SettingsRow';
import {
  Bell, Calendar, Globe2, HelpCircle, KeyRound, Landmark,
  LifeBuoy, Lock, LogOut, Mail, MapPin, Phone, ShieldCheck, Smartphone,
  User, FileText, Scale, Info, Camera,
} from 'lucide-react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const SUPPORT_WHATSAPP = '+12136061732';
const SUPPORT_WHATSAPP_LINK = 'https://wa.me/12136061732';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function countryLabel(c?: string) {
  const map: Record<string, string> = { GB: 'United Kingdom', US: 'United States', NG: 'Nigeria' };
  if (!c) return '';
  return map[c.toUpperCase()] || c;
}

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [notifLogin, setNotifLogin] = useState(true);
  const [notifTransfers, setNotifTransfers] = useState(true);
  const [notifDeposits, setNotifDeposits] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const fields = useMemo(
    () => ({
      phone: user?.phone || 'Not set',
      date_of_birth: user?.date_of_birth ? String(user.date_of_birth).slice(0, 10) : 'Not set',
      address: user?.address || 'Not set',
      country: countryLabel(user?.country) || user?.country || 'Not set',
    }),
    [user],
  );

  const avatarUrl = (user as any)?.avatar_url as string | undefined;

  useEffect(() => {
    refresh().catch(() => {});
    api.getPreferences().then((res: any) => {
      const p = res.preferences || {};
      if (typeof p.notify_login === 'boolean') setNotifLogin(p.notify_login);
      if (typeof p.notify_transfers === 'boolean') setNotifTransfers(p.notify_transfers);
      if (typeof p.notify_deposits === 'boolean') setNotifDeposits(p.notify_deposits);
    }).catch(() => {});
    api.getPinStatus().then((r: any) => setHasPin(!!r.has_pin)).catch(() => {});
  }, []);

  const savePref = async (key: string, value: boolean) => {
    try {
      await api.updatePreferences({ [key]: value });
      setSuccess('Preferences saved.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not save preference');
    }
  };

  const openEdit = (field: string, label: string, current: string) => {
    setEditField(field);
    setEditLabel(label);
    setEditValue(current === 'Not set' ? '' : current);
    setError('');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    setBusy(true);
    setError('');
    try {
      const token = localStorage.getItem('rubicon_token');
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ [editField]: editValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await refresh();
      setShowEditModal(false);
      setSuccess(`${editLabel} updated.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async () => {
    setError('');
    if (!currentPw || !newPw) { setError('Fill in all password fields'); return; }
    if (newPw.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await api.changePassword({ current_password: currentPw, new_password: newPw });
      setShowPasswordModal(false);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setSuccess('Password changed.');
    } catch (e: any) {
      setError(e?.message || 'Password change failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSetPin = async () => {
    setError('');
    if (!/^\d{4,6}$/.test(pinValue)) { setError('PIN must be 4–6 digits'); return; }
    if (pinValue !== confirmPin) { setError('PINs do not match'); return; }
    setBusy(true);
    try {
      await api.setPin({ pin: pinValue, current_pin: hasPin ? currentPin : undefined });
      setHasPin(true);
      setShowPinModal(false);
      setPinValue(''); setCurrentPin(''); setConfirmPin('');
      setSuccess('Transaction PIN saved.');
    } catch (e: any) {
      setError(e?.message || 'Could not save PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <PageHeader title="Profile & Settings" backTo="/dashboard" />
      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 pb-32 space-y-6">
        {error && <div className="rounded-control bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">{error}</div>}
        {success && <div className="rounded-control bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 text-sm">{success}</div>}

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <label className="relative w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xl shrink-0 overflow-hidden cursor-pointer group" title="Upload photo">
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : getInitials(user?.full_name)}
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => { void handleAvatarFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-content-primary truncate">{user?.full_name}</h2>
              <p className="text-caption text-content-muted truncate">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge status={user?.is_locked ? 'locked' : 'active'} />
                <Badge tone="neutral" dot>Email on file</Badge>
              </div>
              <p className="text-caption text-content-muted mt-1">Tap photo to upload · JPEG/PNG</p>
              {avatarUrl && (
                <button type="button" className="text-caption text-content-muted hover:text-red-300 mt-1" onClick={() => void handleRemoveAvatar()}>
                  Remove photo
                </button>
              )}
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
          <SettingsRow icon={User} label="Full Name" value={user?.full_name} onClick={() => openEdit('full_name', 'Full Name', user?.full_name || '')} />
          <SettingsRow icon={Mail} label="Email Address" value={user?.email} />
          <SettingsRow icon={Phone} label="Phone Number" value={fields.phone} onClick={() => openEdit('phone', 'Phone Number', fields.phone)} />
          <SettingsRow icon={Calendar} label="Date of Birth" value={fields.date_of_birth} onClick={() => openEdit('date_of_birth', 'Date of Birth', fields.date_of_birth)} />
          <SettingsRow icon={MapPin} label="Address" value={fields.address} onClick={() => openEdit('address', 'Address', fields.address)} />
          <SettingsRow icon={Globe2} label="Country" value={fields.country} onClick={() => openEdit('country', 'Country', user?.country || '')} />
        </SettingsSection>

        <SettingsSection title="Security">
          <SettingsRow icon={KeyRound} label="Change Password" value="Update password" onClick={() => { setError(''); setShowPasswordModal(true); }} />
          <SettingsRow icon={Lock} label="Transaction PIN" value={hasPin ? 'Set · required for transfers' : 'Not set'} onClick={() => { setError(''); setShowPinModal(true); }} />
          <SettingsRow icon={ShieldCheck} label="Two-Factor Authentication" value="Email code required at every sign-in" />
          <SettingsRow icon={Smartphone} label="Active Sessions" value="Manage devices" onClick={() => navigate('/dashboard')} />
          <SettingsRow
            icon={Bell}
            label="Login Alerts"
            value={notifLogin ? 'On' : 'Off'}
            trailing={<SettingsToggle enabled={notifLogin} onChange={(v) => { setNotifLogin(v); void savePref('notify_login', v); }} label="Toggle login alerts" />}
          />
        </SettingsSection>

        <SettingsSection title="Preferences">
          <SettingsRow icon={Bell} label="Transfer alerts" value={notifTransfers ? 'On' : 'Off'} trailing={<SettingsToggle enabled={notifTransfers} onChange={(v) => { setNotifTransfers(v); void savePref('notify_transfers', v); }} label="Toggle transfer alerts" />} />
          <SettingsRow icon={Bell} label="Deposit alerts" value={notifDeposits ? 'On' : 'Off'} trailing={<SettingsToggle enabled={notifDeposits} onChange={(v) => { setNotifDeposits(v); void savePref('notify_deposits', v); }} label="Toggle deposit alerts" />} />
          <SettingsRow icon={Landmark} label="Default Currency" value="GBP" />
          <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-line-subtle">
            <div className="flex items-center gap-3 min-w-0">
              <Globe2 className="w-4 h-4 text-content-muted shrink-0" />
              <div>
                <p className="text-sm text-content-primary">Language</p>
                <p className="text-caption text-content-muted">Translate the app for your preferred language</p>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
        </SettingsSection>

        <SettingsSection title="Support & Legal">
          <SettingsRow
            icon={Phone}
            label="WhatsApp"
            value={SUPPORT_WHATSAPP}
            onClick={() => { window.location.href = SUPPORT_WHATSAPP_LINK; }}
          />
          <SettingsRow icon={LifeBuoy} label="Email support" value="rubiconcapital@rubiconcapital.org" onClick={() => { window.location.href = 'mailto:rubiconcapital@rubiconcapital.org'; }} />
          <SettingsRow icon={HelpCircle} label="Help Centre" value="FAQs & guides" onClick={() => navigate('/disclosures')} />
          <SettingsRow icon={FileText} label="Terms of Service" onClick={() => navigate('/terms')} />
          <SettingsRow icon={Scale} label="Privacy Policy" onClick={() => navigate('/privacy')} />
          <SettingsRow icon={Info} label="Disclosures" onClick={() => navigate('/disclosures')} />
        </SettingsSection>

        <Button variant="secondary" className="w-full" onClick={() => { logout(); navigate('/'); }}>
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </Button>
      </main>

      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit ${editLabel}`}>
        <div className="space-y-4">
          <Input label={editLabel} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button onClick={handleSaveProfile} loading={busy} loadingLabel="Saving…" fullWidth>Save</Button>
        </div>
      </Modal>

      <Modal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Change Password">
        <div className="space-y-4">
          {error && <div className="text-sm text-red-400">{error}</div>}
          <Input label="Current Password" type="password" revealable value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          <Input label="New Password" type="password" revealable value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <Input label="Confirm New Password" type="password" revealable value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowPasswordModal(false)}>Cancel</Button>
          <Button onClick={handlePasswordChange} loading={busy} loadingLabel="Updating…" fullWidth>Update Password</Button>
        </div>
      </Modal>

      <Modal open={showPinModal} onClose={() => setShowPinModal(false)} title={hasPin ? 'Change transaction PIN' : 'Set transaction PIN'}>
        <div className="space-y-4">
          {error && <div className="text-sm text-red-400">{error}</div>}
          {hasPin && <Input label="Current PIN" type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />}
          <Input label="New PIN" type="password" inputMode="numeric" value={pinValue} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          <Input label="Confirm PIN" type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowPinModal(false)}>Cancel</Button>
          <Button onClick={handleSetPin} loading={busy} loadingLabel="Saving…" fullWidth>Save PIN</Button>
        </div>
      </Modal>
    </div>
  );
}
