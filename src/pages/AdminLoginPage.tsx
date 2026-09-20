import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { Alert, Button, Input } from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import { Lock, Mail, Shield } from 'lucide-react';

export default function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your admin email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/admin');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/expected pattern|uuid|self-signed|failed to fetch|busy/i.test(msg)) {
        setError('Could not reach admin login. Wait 10 seconds and try again.');
      } else {
        setError(msg || 'Invalid admin credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex items-center justify-center p-5 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(245,158,11,0.08),transparent_50%)] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="inline-flex justify-center mb-5">
            <BrandLogo size={40} withWordmark={false} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Admin console</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Rubicon Capital · restricted access
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-7 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-2.5 mb-6 pb-4 border-b border-white/5">
            <span className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-400" />
            </span>
            <div>
              <p className="text-sm font-medium text-white">Owner sign-in</p>
              <p className="text-[11px] text-slate-500">Credentials from environment only</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <Alert tone="error" onDismiss={() => setError('')}>
                {error}
              </Alert>
            )}

            <Input
              label="Admin email"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Configured admin email"
              autoComplete="username"
              leadingIcon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Password"
              type="password"
              revealable
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              leadingIcon={<Lock className="w-4 h-4" />}
            />

            <Button type="submit" fullWidth size="lg" loading={loading} loadingLabel="Signing in…">
              Sign in to console
            </Button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-6 leading-relaxed">
          This panel is not for clients.
          <br />
          <Link to="/login" className="text-slate-500 hover:text-amber-400 transition">
            Client sign-in →
          </Link>
        </p>
      </div>
    </div>
  );
}
