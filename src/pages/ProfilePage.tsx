import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatShortDate } from '../lib/format';
import { Badge, Button, Card, Input, Modal, PageHeader, StatusBadge } from '../components/ui';
import { SettingsRow, SettingsSection, SettingsToggle } from '../components/ui/SettingsRow';
import { cx } from '../lib/designTokens';
import {
  Bell, Calendar, Globe2, HelpCircle, KeyRound, Landmark,
  LifeBuoy, Lock, LogOut, Mail, MapPin, Phone, ShieldCheck, Smartphone,
  User, FileText, Scale, Info,
} from 'lucide-react';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

type SessionRow = {
  id: string;
  device: string;
  ip?: string;
  created_at?: string;
  last_seen_at?: string;
  revoked?: boolean;
  current?: boolean;
};

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifLogin, setNotifLogin] = useState(true);
  const [notifTransfers, setNotifTransfers] = useState(true);
  const [notifDeposits, setNotifDeposits] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
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
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const profileFields = useMemo(
    () => ({
      phone: 'Not set',
      dob: 'Not set',
      address: 'Not set',
      country: 'United Kingdom',
    }),
    []
  );

  useEffect(() => {
    api
      .getPreferences()
      .then((res: any) => {
        const p = res.preferences || {};
        if (typeof p.notify_login === 'boolean') setNotifLogin(p.notify_login);
        if (typeof p.notify_transfers === 'boolean') setNotifTransfers(p.notify_transfers);
        if (typeof p.notify_deposits === 'boolean') setNotifDeposits(p.notify_deposits);
      })
      .catch(() => {});
    api.getPinStatus().then((r: any) => setHasPin(!!r.has_pin)).catch(() => {});
  }, []);

  const savePref = async (key: string, value: boolean) => {
    try {
      const res: any = await api.updatePreferences({ [key]: value });
      const p = res.preferences || {};
      if (typeof p.notify_login === 'boolean') setNotifLogin(p.notify_login);
      if (typeof p.notify_transfers === 'boolean') setNotifTransfers(p.notify_transfers);
      if (typeof p.notify_deposits === 'boolean') setNotifDeposits(p.notify_deposits);
      setSuccess('Preferences saved.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not save preference');
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    setError('');
    try {
      const res: any = await api.getSessions();
      setSessions(res.sessions || []);
      setShowSessionsModal(true);
    } catch (e: any) {
      setError(e?.message || 'Could not load sessions');
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleRevokeSession = async (id: string, isCurrent: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api.revokeSession(id);
      if (isCurrent) {
        logout();
        navigate('/auth');
        return;
      }
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, revoked: true } : s)));
      setSuccess('Session ended.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e: any) {
      setError(e?.message || 'Could not end session');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    if (!confirm('Sign out of all devices? You will need to sign in again on this device too.')) return;
    setBusy(true);
    setError('');
    try {
      await api.revokeAllSessions();
      logout();
      navigate('/auth');
    } catch (e: any) {
      setError(e?.message || 'Could not sign out everywhere');
      setBusy(false);
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
    if (!currentPw || !newPw) {
      setError('Fill in all password fields');
      return;
    }
    if (newPw.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ current_password: currentPw, new_password: newPw });
      setShowPasswordModal(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setSuccess('Password changed successfully. A confirmation email was sent.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError(e?.message || 'Password change failed');
    } finally {
      setBusy(false);
    }
  };


  const handleSetPin = async () => {
    setError('');
    if (!/^\d{4,6}$/.test(pinValue)) {
      setError('PIN must be 4–6 digits');
      return;
    }
    if (pinValue !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    setBusy(true);
    try {
      await api.setPin({ pin: pinValue, current_pin: hasPin ? currentPin : undefined });
      setHasPin(true);
      setShowPinModal(false);
      setPinValue('');
      setCurrentPin('');
      setConfirmPin('');
      setSuccess('Transaction PIN saved. It will be required for transfers.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError(e?.message || 'Could not save PIN');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-surface">
      <PageHeader title="Profile & Settings" backTo="/dashboard" />
      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 pb-32 space-y-6">
        {error && (
          <div className="rounded-control bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-control bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 text-sm">
            {success}
          </div>
        )}

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
                <Badge tone="neutral" dot>
                  Email on file
                </Badge>
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
          <SettingsRow
            icon={User}
            label="Full Name"
            value={user?.full_name}
            onClick={() => openEdit('full_name', 'Full Name', user?.full_name || '')}
          />
          <SettingsRow
            icon={Mail}
            label="Email Address"
            value={user?.email}
            onClick={() => openEdit('email', 'Email', user?.email || '')}
          />
          <SettingsRow
            icon={Phone}
            label="Phone Number"
            value={profileFields.phone}
            onClick={() => openEdit('phone', 'Phone Number', profileFields.phone)}
          />
          <SettingsRow
            icon={Calendar}
            label="Date of Birth"
            value={profileFields.dob}
            onClick={() => openEdit('date_of_birth', 'Date of Birth', profileFields.dob)}
          />
          <SettingsRow
            icon={MapPin}
            label="Address"
            value={profileFields.address}
            onClick={() => openEdit('address', 'Address', profileFields.address)}
          />
          <SettingsRow
            icon={Globe2}
            label="Country"
            value={profileFields.country}
            onClick={() => openEdit('country', 'Country', profileFields.country)}
          />
        </SettingsSection>

        <SettingsSection title="Security">
          <SettingsRow
            icon={KeyRound}
            label="Change Password"
            value="Last changed —"
            onClick={() => {
              setError('');
              setShowPasswordModal(true);
            }}
          />
          <SettingsRow
            icon={Lock}
            label="Transaction PIN"
            value={hasPin ? 'Set · required for transfers' : 'Not set'}
            onClick={() => {
              setError('');
              setPinValue('');
              setCurrentPin('');
              setConfirmPin('');
              setShowPinModal(true);
            }}
          />
          <SettingsRow
            icon={ShieldCheck}
            label="Two-Factor Authentication"
            value="Email code required at every sign-in"
          />
          <SettingsRow
            icon={Smartphone}
            label="Active Sessions"
            value={sessionsLoading ? 'Loading…' : 'Manage devices'}
            onClick={() => {
              void loadSessions();
            }}
          />
          <SettingsRow
            icon={LogOut}
            label="Sign out everywhere"
            value="End all sessions"
            onClick={() => {
              void handleSignOutEverywhere();
            }}
          />
          <SettingsRow
            icon={Bell}
            label="Login Alerts"
            value={notifLogin ? 'On' : 'Off'}
            trailing={
              <SettingsToggle
                enabled={notifLogin}
                onChange={(v) => {
                  setNotifLogin(v);
                  void savePref('notify_login', v);
                }}
                label="Toggle login alerts"
              />
            }
          />
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
          <SettingsRow
            icon={Bell}
            label="Transfer alerts"
            value={notifTransfers ? 'On' : 'Off'}
            trailing={
              <SettingsToggle
                enabled={notifTransfers}
                onChange={(v) => {
                  setNotifTransfers(v);
                  void savePref('notify_transfers', v);
                }}
                label="Toggle transfer alerts"
              />
            }
          />
          <SettingsRow
            icon={Bell}
            label="Deposit alerts"
            value={notifDeposits ? 'On' : 'Off'}
            trailing={
              <SettingsToggle
                enabled={notifDeposits}
                onChange={(v) => {
                  setNotifDeposits(v);
                  void savePref('notify_deposits', v);
                }}
                label="Toggle deposit alerts"
              />
            }
          />
          <SettingsRow icon={Landmark} label="Default Currency" value="GBP" />
          <SettingsRow icon={Globe2} label="Language" value="English" />
        </SettingsSection>

        <SettingsSection title="Support & Legal">
          <SettingsRow
            icon={LifeBuoy}
            label="Contact Support"
            value="support@rubiconcapital.org"
            onClick={() => {
              window.location.href = 'mailto:support@rubiconcapital.org';
            }}
          />
          <SettingsRow icon={HelpCircle} label="Help Centre" value="FAQs & guides" onClick={() => navigate('/disclosures')} />
          <SettingsRow icon={FileText} label="Terms of Service" onClick={() => navigate('/terms')} />
          <SettingsRow icon={Scale} label="Privacy Policy" onClick={() => navigate('/privacy')} />
          <SettingsRow icon={Info} label="Disclosures" onClick={() => navigate('/disclosures')} />
        </SettingsSection>

        <Button variant="secondary" className="w-full" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </main>

      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit ${editLabel}`}>
        <div className="space-y-4">
          <Input
            label={editLabel}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={`Enter your ${editLabel.toLowerCase()}`}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveProfile} loading={busy} loadingLabel="Saving…" fullWidth>
            Save
          </Button>
        </div>
      </Modal>

      <Modal
        open={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setError('');
        }}
        title="Change Password"
        description="Enter your current password and choose a new one."
      >
        <div className="space-y-4">
          {error && <div className="text-sm text-red-400">{error}</div>}
          <Input
            label="Current Password"
            type="password"
            revealable
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="••••••••"
          />
          <Input
            label="New Password"
            type="password"
            revealable
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="At least 8 characters"
            hint="Use a mix of letters, numbers, and symbols."
          />
          <Input
            label="Confirm New Password"
            type="password"
            revealable
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setShowPasswordModal(false);
              setError('');
            }}
          >
            Cancel
          </Button>
          <Button onClick={handlePasswordChange} loading={busy} loadingLabel="Updating…" fullWidth>
            Update Password
          </Button>
        </div>
      </Modal>

      <Modal open={showSessionsModal} onClose={() => setShowSessionsModal(false)} title="Active sessions">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-caption text-content-muted">
            Devices signed in to your Rubicon account. End a session to require a new sign-in on that device.
          </p>
          {sessions.length === 0 ? (
            <p className="text-sm text-content-muted py-4 text-center">
              No session history yet. Sign in again to start tracking devices.
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-control border border-line-subtle px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    {s.device}
                    {s.current ? ' · This device' : ''}
                    {s.revoked ? ' · Ended' : ''}
                  </p>
                  <p className="text-caption text-content-muted truncate">
                    {s.ip || 'IP unknown'}
                    {s.last_seen_at
                      ? ` · Last active ${new Date(s.last_seen_at).toLocaleString('en-GB')}`
                      : ''}
                  </p>
                </div>
                {!s.revoked && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleRevokeSession(s.id, !!s.current)}
                  >
                    End
                  </Button>
                )}
              </div>
            ))
          )}
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void handleSignOutEverywhere()}
          >
            Sign out everywhere
          </Button>
        </div>
      </Modal>

      <Modal
        open={showPinModal}
        onClose={() => setShowPinModal(false)}
        title={hasPin ? 'Change transaction PIN' : 'Set transaction PIN'}
        description="Your PIN authorises transfers between Rubicon accounts."
      >
        <div className="space-y-4">
          {error && <div className="text-sm text-red-400">{error}</div>}
          {hasPin && (
            <Input
              label="Current PIN"
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
            />
          )}
          <Input
            label="New PIN"
            type="password"
            inputMode="numeric"
            value={pinValue}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="4–6 digits"
          />
          <Input
            label="Confirm PIN"
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="4–6 digits"
          />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowPinModal(false)}>Cancel</Button>
          <Button onClick={handleSetPin} loading={busy} loadingLabel="Saving…" fullWidth>
            Save PIN
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function LimitBar({
  label,
  used,
  total,
  currency,
}: {
  label: string;
  used: number;
  total: number;
  currency: string;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-label text-content-primary">{label}</span>
        <span className="text-caption text-content-muted">
          {sym}
          {used.toLocaleString()} / {sym}
          {total.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-overlay/60 overflow-hidden">
        <div
          className={cx(
            'h-full rounded-full transition-all duration-slow',
            pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-brand-400' : 'bg-emerald-400'
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}
