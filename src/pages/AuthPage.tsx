import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type OtpChallenge } from '../context/AuthContext';
import { Alert, Button, Input, SkipLink } from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import { passwordStrength, validateAuth, type FieldErrors } from '../lib/validation';
import { ArrowRight, Lock, Mail, ShieldCheck, User, KeyRound } from 'lucide-react';

type Field = 'fullName' | 'email' | 'password' | 'confirmPassword';

const AUTH_PHOTO =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80';

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldErrors<'fullName' | 'email' | 'password'>>({});
  const [confirmErr, setConfirmErr] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState('');

  const isSignup = mode === 'signup';
  const values = useMemo(() => ({ fullName, email, password }), [fullName, email, password]);
  const strength = useMemo(() => passwordStrength(password), [password]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setConfirmErr('');
    const nextErrors = validateAuth(mode, values);
    setErrors(nextErrors);
    setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
    if (isSignup && password !== confirmPassword) {
      setConfirmErr('Passwords do not match');
      return;
    }
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      if (isSignup) {
        await register(email.trim(), password, fullName.trim());
        navigate('/dashboard');
      } else {
        const ch = await login(email.trim(), password);
        if (ch) {
          setChallenge(ch);
          setOtpCode('');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      setFormError(err?.message || 'We could not complete that request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setFormError('');
    const clean = otpCode.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setFormError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(challenge.challenge_id, clean);
      navigate('/dashboard');
    } catch (err: any) {
      setFormError(err?.message || 'Incorrect or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!challenge) return;
    setResendBusy(true);
    setResendNote('');
    setFormError('');
    try {
      const next = await resendOtp(challenge.challenge_id);
      setChallenge(next);
      setResendNote('A new code was sent to your email.');
    } catch (err: any) {
      setFormError(err?.message || 'Could not resend code.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col lg:flex-row">
      <SkipLink />
      <div className="relative hidden lg:flex lg:w-[48%] flex-col justify-between p-10 overflow-hidden">
        <div className="absolute inset-0">
          <img src={AUTH_PHOTO} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[#070b14]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-[#070b14]/40 to-transparent" />
        </div>
        <div className="relative z-10"><BrandLogo size={40} withWordmark /></div>
        <div className="relative z-10 max-w-md pb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">Client access</p>
          <h1 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">
            {isSignup ? 'Open your multi-currency relationship' : 'Sign in to your accounts'}
          </h1>
          <p className="mt-4 text-slate-300/90 text-sm leading-relaxed">
            GBP, USD, and EUR under one login. Encrypted sessions and a verification code at every sign-in.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li className="flex items-center gap-2.5"><ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />256-bit encryption on every session</li>
            <li className="flex items-center gap-2.5"><KeyRound className="w-4 h-4 text-amber-400 shrink-0" />Email verification code at every sign-in</li>
            <li className="flex items-center gap-2.5"><Mail className="w-4 h-4 text-amber-400 shrink-0" />support@rubiconcapital.org</li>
          </ul>
        </div>
        <p className="relative z-10 text-[11px] text-slate-500">Mon–Fri 08:00–18:00 GMT · <Link to="/" className="text-slate-400 hover:text-amber-400">Back to website</Link></p>
      </div>

      <div className="flex-1 flex flex-col justify-center px-5 sm:px-10 py-12">
        <div className="lg:hidden mb-8"><BrandLogo size={36} withWordmark /></div>
        <div className="w-full max-w-md mx-auto">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 shadow-2xl shadow-black/40">
            {challenge ? (
              <>
                <h2 className="text-xl font-semibold tracking-tight">Check your email</h2>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  We sent a 6-digit code to <span className="text-slate-200 font-medium">{challenge.email_hint}</span>.
                  Enter it below to finish signing in.
                </p>
                <form onSubmit={handleOtpSubmit} className="mt-6 space-y-4">
                  {formError && <Alert tone="error">{formError}</Alert>}
                  {resendNote && <Alert tone="success">{resendNote}</Alert>}
                  <Input
                    label="Verification code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                    leadingIcon={<KeyRound className="w-4 h-4" />}
                    hint="Check inbox and spam. Code expires in 10 minutes."
                  />
                  <Button type="submit" loading={loading} fullWidth>
                    Verify and sign in <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </form>
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <button type="button" onClick={handleResend} disabled={resendBusy} className="text-amber-400 hover:text-amber-300 disabled:opacity-50 text-left">
                    {resendBusy ? 'Sending…' : 'Resend code'}
                  </button>
                  <button type="button" onClick={() => { setChallenge(null); setOtpCode(''); setFormError(''); }} className="text-slate-500 hover:text-slate-300 text-left">
                    Use a different account
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {isSignup
                    ? 'Register to request accounts in GBP, USD, or EUR. Account numbers are issued after review.'
                    : 'Sign in with your email and password. A one-time code will be emailed to you.'}
                </p>
                <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
                  {formError && <Alert tone="error">{formError}</Alert>}
                  {isSignup && (
                    <Input label="Full legal name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                      placeholder="As it appears on your ID" required leadingIcon={<User className="w-4 h-4" />}
                      error={touched.fullName ? errors.fullName : undefined} />
                  )}
                  <Input label="Email address" type="email" autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required
                    leadingIcon={<Mail className="w-4 h-4" />} error={touched.email ? errors.email : undefined} />
                  <Input label="Password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? 'At least 8 characters' : '••••••••'} required
                    leadingIcon={<Lock className="w-4 h-4" />} error={touched.password ? errors.password : undefined}
                    hint={!isSignup ? 'Never share your password. Rubicon staff will not ask for it.' : undefined} />
                  {isSignup && password.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className={`h-full transition-all ${strength.score <= 1 ? 'bg-red-500 w-1/4' : strength.score === 2 ? 'bg-amber-500 w-2/4' : strength.score === 3 ? 'bg-emerald-500/80 w-3/4' : 'bg-emerald-400 w-full'}`} />
                      </div>
                      <span className="text-[11px] text-slate-500">{strength.label}</span>
                    </div>
                  )}
                  {isSignup && (
                    <Input label="Confirm password" type="password" autoComplete="new-password"
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password" required leadingIcon={<Lock className="w-4 h-4" />}
                      error={confirmErr || undefined} />
                  )}
                  {!isSignup && (
                    <div className="flex justify-end">
                      <Link to="/forgot-password" className="text-sm text-amber-400/90 hover:text-amber-300">Forgot password?</Link>
                    </div>
                  )}
                  <Button type="submit" loading={loading} fullWidth>
                    {isSignup ? 'Create account' : 'Continue'} <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </form>
                <p className="mt-5 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" /> Encrypted connection · TLS 1.3
                </p>
              </>
            )}
          </div>
          {!challenge && (
            <p className="mt-6 text-center text-sm text-slate-500">
              {isSignup ? (
                <>Already a client? <Link to="/login" className="text-amber-400 hover:text-amber-300">Sign in</Link></>
              ) : (
                <>New to Rubicon? <Link to="/signup" className="text-amber-400 hover:text-amber-300">Open an account</Link></>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
