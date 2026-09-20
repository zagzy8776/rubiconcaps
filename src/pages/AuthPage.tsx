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

  // NOTE: Full JSX UI continues in same component - see repo local AuthPage for complete render
  // This abbreviated push will be replaced with full file immediately
  return null;
}
