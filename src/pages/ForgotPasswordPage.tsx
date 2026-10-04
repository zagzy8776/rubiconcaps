import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { isEmail } from '../lib/validation';
import { Alert, Button, Input } from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isEmail(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Could not send reset email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex justify-center mb-3">
            <BrandLogo size={36} withWordmark />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 shadow-2xl shadow-black/30">
          <div className="flex items-start gap-3 mb-6">
            <span className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
              <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                Enter the email on your Rubicon Capital account. We will send a secure link if the address is
                registered.
              </p>
            </div>
          </div>

          {done ? (
            <div className="space-y-4">
              <Alert tone="success">
                If that email is registered, a reset link has been sent. Check your inbox and spam folder. The
                link expires in 60 minutes.
              </Alert>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300"
              >
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && <Alert tone="error">{error}</Alert>}
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                leadingIcon={<Mail className="h-4 w-4" />}
                required
              />
              <Button type="submit" loading={busy} fullWidth>
                Send reset link
              </Button>
              <p className="text-center text-sm text-slate-500">
                Remembered it?{' '}
                <Link to="/login" className="font-medium text-amber-400 hover:text-amber-300">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
