import { useEffect, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { Alert, Button, Input, Modal, Select } from './ui';

type Props = {
  open: boolean;
  userId?: string | null;
  accountHint?: any;
  onClose: () => void;
  onSaved: (msg: string) => void;
};

const emptyProfile = {
  full_name: '',
  email: '',
  phone: '',
  address: '',
  country: 'GB',
  date_of_birth: '',
  kyc_status: 'pending',
  account_status: 'active',
  is_locked: false,
  role: 'user',
  avatar_url: '',
};

function dateInput(v: any) {
  if (!v) return '';
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 360;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Could not read image')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = url;
  });
}

export default function AdminCustomerModal({ open, userId, accountHint, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<any>(emptyProfile);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [acctEdits, setAcctEdits] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.adminUser(userId);
        if (cancelled) return;
        const u = data.user || {};
        setProfile({
          ...emptyProfile,
          ...u,
          phone: u.phone || '',
          address: u.address || '',
          country: u.country || 'GB',
          date_of_birth: dateInput(u.date_of_birth),
          is_locked: !!u.is_locked,
          avatar_url: u.avatar_url || '',
        });
        const rows = data.accounts || [];
        setAccounts(rows);
        const edits: Record<string, any> = {};
        for (const a of rows) {
          edits[a.id] = {
            account_name: a.account_name || '',
            account_type: a.account_type || 'current',
            status: a.status || 'active',
            is_locked: !!a.is_locked,
            account_number: a.account_number || '',
            routing_number: a.routing_number || '',
            daily_limit: a.daily_limit ?? '',
            transaction_limit: a.transaction_limit ?? '',
            monthly_limit: a.monthly_limit ?? '',
          };
        }
        setAcctEdits(edits);
      } catch (e: any) {
        if (!cancelled) {
          if (accountHint) {
            setProfile({
              ...emptyProfile,
              full_name: accountHint.full_name || '',
              email: accountHint.email || '',
            });
            setAccounts([accountHint]);
            setAcctEdits({
              [accountHint.id]: {
                account_name: accountHint.account_name || '',
                account_type: accountHint.account_type || 'current',
                status: accountHint.status || 'active',
                is_locked: !!accountHint.is_locked,
                account_number: accountHint.account_number || '',
                routing_number: accountHint.routing_number || '',
                daily_limit: accountHint.daily_limit ?? '',
                transaction_limit: accountHint.transaction_limit ?? '',
                monthly_limit: accountHint.monthly_limit ?? '',
              },
            });
          }
          setError(e?.message || 'Could not load customer');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setError('');
    try {
      await api.adminUpdateUser(userId, {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        country: profile.country,
        date_of_birth: profile.date_of_birth || null,
        kyc_status: profile.kyc_status,
        account_status: profile.account_status,
        is_locked: !!profile.is_locked,
      });
      if (profile.avatar_url && String(profile.avatar_url).startsWith('data:image/')) {
        const token = localStorage.getItem('rubicon_admin_token');
        const res = await fetch(`/api/admin/users/${userId}/avatar`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ image: profile.avatar_url }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Photo save failed');
      }
      for (const a of accounts) {
        const e = acctEdits[a.id];
        if (!e) continue;
        await api.adminUpdateAccount(a.id, {
          account_name: e.account_name,
          account_type: e.account_type,
          status: e.status,
          is_locked: !!e.is_locked,
          account_number: e.account_number,
          routing_number: e.routing_number,
          daily_limit: e.daily_limit === '' ? undefined : Number(e.daily_limit),
          transaction_limit: e.transaction_limit === '' ? undefined : Number(e.transaction_limit),
          monthly_limit: e.monthly_limit === '' ? undefined : Number(e.monthly_limit),
        });
      }
      onSaved('Customer record saved.');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setAcct = (id: string, patch: Record<string, any>) => {
    setAcctEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={profile.full_name || 'Customer record'}
      description="Photo, details and wallets. Save stays at the bottom."
      widthClass="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} loadingLabel="Saving…" fullWidth disabled={loading || !userId}>
            Save all changes
          </Button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <p className="text-sm text-content-muted">Loading customer…</p>
      ) : (
        <div className="space-y-6 pb-2">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-content-primary">Personal</h4>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-content-muted">Photo</div>
                )}
              </div>
              <label className="text-sm text-brand-400 cursor-pointer">
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (ev) => {
                    const file = ev.target.files?.[0];
                    if (!file) return;
                    try {
                      const dataUrl = await readPhoto(file);
                      setProfile({ ...profile, avatar_url: dataUrl });
                    } catch (e: any) {
                      setError(e?.message || 'Could not read photo');
                    }
                  }}
                />
              </label>
            </div>
            <Input label="Full legal name" value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            <Input label="Email" type="email" value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            <Input label="Phone" type="tel" value={profile.phone || ''}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            <Input label="Date of birth" type="date" value={profile.date_of_birth || ''}
              onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })} />
            <Input label="Country" value={profile.country || ''}
              onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
            <Input label="Residential address" value={profile.address || ''}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="KYC status" value={profile.kyc_status || 'pending'}
                onChange={(e) => setProfile({ ...profile, kyc_status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </Select>
              <Select label="Profile status" value={profile.account_status || 'active'}
                onChange={(e) => setProfile({ ...profile, account_status: e.target.value })}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="blocked">Blocked</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input type="checkbox" checked={!!profile.is_locked}
                onChange={(e) => setProfile({ ...profile, is_locked: e.target.checked })} />
              Lock customer login
            </label>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-content-primary">Accounts ({accounts.length})</h4>
            {accounts.map((a) => {
              const e = acctEdits[a.id] || {};
              return (
                <div key={a.id} className="rounded-xl border border-line-subtle p-3 space-y-3">
                  <p className="text-sm font-medium">{a.currency} · {formatMoney(a.balance, a.currency)}</p>
                  <Input label="Account name" value={e.account_name || ''}
                    onChange={(ev) => setAcct(a.id, { account_name: ev.target.value })} />
                  <Input label="Account number" value={e.account_number || ''}
                    onChange={(ev) => setAcct(a.id, { account_number: ev.target.value })} />
                  <Input label="Sort / routing" value={e.routing_number || ''}
                    onChange={(ev) => setAcct(a.id, { routing_number: ev.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Type" value={e.account_type || 'current'}
                      onChange={(ev) => setAcct(a.id, { account_type: ev.target.value })}>
                      <option value="current">Current</option>
                      <option value="savings">Savings</option>
                      <option value="private">Private</option>
                    </Select>
                    <Select label="Status" value={e.status || 'active'}
                      onChange={(ev) => setAcct(a.id, { status: ev.target.value })}>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="blocked">Blocked</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </Modal>
  );
}
