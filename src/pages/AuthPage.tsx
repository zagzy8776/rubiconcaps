import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type OtpChallenge } from '../context/AuthContext';
import { Alert, Button, Input, SkipLink } from '../components/ui';
import { BrandLogo } from '../components/BrandLogo';
import { passwordStrength, validateAuth, type FieldErrors } from '../lib/validation';
import {
  ArrowLeft, ArrowRight, Lock, Mail, MapPin, Phone, ShieldCheck,
  User, KeyRound, Calendar, Globe2, CheckCircle2,
} from 'lucide-react';

const AUTH_PHOTO =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80';

const TRUSTED_KEY = 'rubicon_trusted_device';
const REMEMBER_EMAIL_KEY = 'rubicon_remember_email';
const TRUST_DAYS = 30;

type SignupStep = 'credentials' | 'personal';

const COUNTRIES = [
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'IE', label: 'Ireland' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SG', label: 'Singapore' },
  { code: 'OTHER', label: 'Other' },
];

function loadTrusted(): { email: string; until: number } | null {
  try {
    const raw = localStorage.getItem(TRUSTED_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.email || !data?.until || Date.now() > data.until) {
      localStorage.removeItem(TRUSTED_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveTrusted(email: string) {
  localStorage.setItem(
    TRUSTED_KEY,
    JSON.stringify({ email: email.toLowerCase(), until: Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000 }),
  );
}

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [country, setCountry] = useState('GB');
  const [address, setAddress] = useState('');
  const [signupStep, setSignupStep] = useState<SignupStep>('credentials');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldErrors<'fullName' | 'email' | 'password'>>({});
  const [confirmErr, setConfirmErr] = useState('');
  const [personalErr, setPersonalErr] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState('');

  const isSignup = mode === 'signup';
  const values = useMemo(() => ({ fullName, email, password }), [fullName, email, password]);
  const strength = useMemo(() => passwordStrength(password), [password]);

  useEffect(() => {
    if (!isSignup) {
      const remembered = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (remembered) {
        setEmail(remembered);
        setRememberDevice(true);
      }
    }
  }, [isSignup]);

  const goPersonalStep = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setConfirmErr('');
    const nextErrors = validateAuth('signup', values);
    setErrors(nextErrors);
    setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
    if (password !== confirmPassword) {
      setConfirmErr('Passwords do not match');
      return;
    }
    if (Object.keys(nextErrors).length > 0) return;
    setSignupStep('personal');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const nextErrors = validateAuth(mode, values);
    setErrors(nextErrors);
    setTouched({ email: true, password: true });
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const trusted = loadTrusted();
      const skipOtpHint = rememberDevice && !!trusted && trusted.email === email.trim().toLowerCase();

      const ch = await login(email.trim(), password, { trust_device: skipOtpHint });
      if (ch) {
        setChallenge(ch);
        setOtpCode('');
      } else {
        if (rememberDevice) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim().toLowerCase());
          saveTrusted(email.trim());
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
          localStorage.removeItem(TRUSTED_KEY);
        }
        navigate('/dashboard');
      }
    } catch (err: any) {
      setFormError(err?.message || 'We could not complete that request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersonalErr('');
    setFormError('');

    if (!phone.trim() || phone.trim().replace(/\D/g, '').length < 7) {
      setPersonalErr('Enter a valid phone number including country code.');
      return;
    }
    if (!dateOfBirth) {
      setPersonalErr('Enter your date of birth.');
      return;
    }
    const dob = new Date(dateOfBirth);
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(age) || age < 18) {
      setPersonalErr('You must be at least 18 years old to open an account.');
      return;
    }
    if (!address.trim() || address.trim().length < 8) {
      setPersonalErr('Enter your residential address.');
      return;
    }
    if (!country) {
      setPersonalErr('Select your country of residence.');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, fullName.trim(), {
        phone: phone.trim(),
        date_of_birth: dateOfBirth,
        address: address.trim(),
        country,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setFormError(err?.message || 'We could not create your login. Please try again.');
      setSignupStep('credentials');
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
      if (rememberDevice) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim().toLowerCase());
        saveTrusted(email.trim());
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
        localStorage.removeItem(TRUSTED_KEY);
      }
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

  const title =
    challenge
      ? 'Check your email'
      : isSignup
        ? signupStep === 'personal'
          ? 'Your details'
          : 'Create your login'
        : 'Sign in';

  const subtitle =
    challenge
      ? undefined
      : isSignup
        ? signupStep === 'personal'
          ? 'Required for account opening and security. You can request currency accounts after this step.'
          : 'This creates your secure login. Currency accounts are requested next from your dashboard.'
        : 'Use the email and password linked to your Rubicon relationship.';

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col lg:flex-row">
      <SkipLink />
      <div className="relative hidden lg:flex lg:w-[48%] flex-col justify-between p-10 overflow-hidden">
        <div className="absolute inset-0">
          <img src={AUTH_PHOTO} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[#070b14]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-[#070b14]/40 to-transparent" />
        </div>
        <div className="relative z-10">
          <BrandLogo size={40} withWordmark />
        </div>
        <div className="relative z-10 max-w-md pb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/90 mb-3 font-medium">Client access</p>
          <h1 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">
            {isSignup ? 'Open your multi-currency relationship' : 'Sign in to your accounts'}
          </h1>
          <p className="mt-4 text-slate-300/90 text-sm leading-relaxed">
            GBP, USD, and EUR under one login. Encrypted sessions and a verification code at every sign-in.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              256-bit encryption on every session
            </li>
            <li className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
              Email verification code at every sign-in
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-amber-400 shrink-0" />
              rubiconcapital@rubiconcapital.org
            </li>
          </ul>
        </div>
        <p className="relative z-10 text-[11px] text-slate-500">
          Client services by email ·{' '}
          <Link to="/" className="text-slate-400 hover:text-amber-400">
            Back to website
          </Link>
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center px-5 sm:px-10 py-12">
        <div className="lg:hidden mb-8">
          <BrandLogo size={36} withWordmark />
        </div>
        <div className="w-full max-w-md mx-auto">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 shadow-2xl shadow-black/40">
            {challenge ? (
              <>
                <h2 className="text-xl font-semibold tracking-tight">Check your email</h2>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  We sent a 6-digit code to{' '}
                  <span className="text-slate-200 font-medium">{challenge.email_hint}</span>. Enter it
                  below to finish signing in.
                </p>
                <form onSubmit={handleOtpSubmit} className="mt-6 space-y-4">
                  {formError && <Alert tone="error">{formError}</Alert>}
                  {resendNote && <Alert tone="success">{resendNote}</Alert>}
                  <Input
                    label="Verification code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    required
                    leadingIcon={<KeyRound className="w-4 h-4" />}
                  />
                  <Button type="submit" loading={loading} fullWidth>
                    Verify and sign in <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendBusy}
                    className="w-full text-sm text-amber-400/90 hover:text-amber-300 disabled:opacity-50"
                  >
                    {resendBusy ? 'Sending…' : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChallenge(null);
                      setOtpCode('');
                      setFormError('');
                    }}
                    className="w-full text-sm text-slate-500 hover:text-slate-300"
                  >
                    Use a different email
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                    {subtitle && (
                      <p className="mt-2 text-sm text-slate-400 leading-relaxed">{subtitle}</p>
                    )}
                  </div>
                  {isSignup && (
                    <span className="text-[11px] text-slate-500 shrink-0 pt-1">
                      Step {signupStep === 'credentials' ? '1' : '2'} of 2
                    </span>
                  )}
                </div>

                {isSignup && signupStep === 'credentials' && (
                  <form onSubmit={goPersonalStep} className="mt-6 space-y-4">
                    {formError && <Alert tone="error">{formError}</Alert>}
                    <Input
                      label="Full legal name"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="As it should appear on statements"
                      required
                      leadingIcon={<User className="w-4 h-4" />}
                      error={touched.fullName ? errors.fullName : undefined}
                    />
                    <Input
                      label="Email address"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      leadingIcon={<Mail className="w-4 h-4" />}
                      error={touched.email ? errors.email : undefined}
                    />
                    <Input
                      label="Password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      leadingIcon={<Lock className="w-4 h-4" />}
                      error={touched.password ? errors.password : undefined}
                    />
                    {password.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              strength.score <= 1
                                ? 'bg-red-500 w-1/4'
                                : strength.score === 2
                                  ? 'bg-amber-500 w-2/4'
                                  : strength.score === 3
                                    ? 'bg-emerald-500/80 w-3/4'
                                    : 'bg-emerald-400 w-full'
                            }`}
                          />
                        </div>
                        <span className="text-[11px] text-slate-500">{strength.label}</span>
                      </div>
                    )}
                    <Input
                      label="Confirm password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      required
                      leadingIcon={<Lock className="w-4 h-4" />}
                      error={confirmErr || undefined}
                    />
                    <Button type="submit" fullWidth>
                      Continue <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </form>
                )}

                {isSignup && signupStep === 'personal' && (
                  <form onSubmit={handleSignupFinish} className="mt-6 space-y-4">
                    {(personalErr || formError) && (
                      <Alert tone="error">{personalErr || formError}</Alert>
                    )}
                    <Input
                      label="Mobile phone"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 213 606 1732"
                      required
                      leadingIcon={<Phone className="w-4 h-4" />}
                      hint="Include country code"
                    />
                    <Input
                      label="Date of birth"
                      type="date"
                      autoComplete="bday"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      required
                      leadingIcon={<Calendar className="w-4 h-4" />}
                      hint="You must be 18 or older"
                    />
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Country of residence
                      </label>
                      <div className="relative">
                        <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <select
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          required
                          className="w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code} className="bg-slate-900">
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Input
                      label="Residential address"
                      autoComplete="street-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, city, postcode"
                      required
                      leadingIcon={<MapPin className="w-4 h-4" />}
                    />
                    <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-500/80 shrink-0" />
                      After this step you sign in and request the currency accounts you need (GBP, USD,
                      EUR). Deposits are reviewed before funds are credited.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setSignupStep('credentials');
                          setPersonalErr('');
                        }}
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                      </Button>
                      <Button type="submit" loading={loading} fullWidth>
                        Create login <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </form>
                )}

                {!isSignup && (
                  <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
                    {formError && <Alert tone="error">{formError}</Alert>}
                    <Input
                      label="Email address"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      leadingIcon={<Mail className="w-4 h-4" />}
                      error={touched.email ? errors.email : undefined}
                    />
                    <Input
                      label="Password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      required
                      leadingIcon={<Lock className="w-4 h-4" />}
                      error={touched.password ? errors.password : undefined}
                      hint="Never share your password. Rubicon staff will not ask for it."
                    />
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberDevice}
                          onChange={(e) => setRememberDevice(e.target.checked)}
                          className="rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/40"
                        />
                        <span className="text-sm text-slate-400">Remember this device</span>
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-sm text-amber-400/90 hover:text-amber-300"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <Button type="submit" loading={loading} fullWidth>
                      Continue <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </form>
                )}

                <p className="mt-5 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" /> Encrypted connection · TLS
                  1.3
                </p>
              </>
            )}
          </div>
          {!challenge && (
            <p className="mt-6 text-center text-sm text-slate-500">
              {isSignup ? (
                <>
                  Already a client?{' '}
                  <Link to="/login" className="text-amber-400 hover:text-amber-300">
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  New to Rubicon?{' '}
                  <Link to="/signup" className="text-amber-400 hover:text-amber-300">
                    Create a login
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
