import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  is_locked?: boolean;
  phone?: string;
  address?: string;
  country?: string;
  date_of_birth?: string;
  kyc_status?: string;
  account_status?: string;
  created_at?: string;
  last_login?: string;
}

export interface OtpChallenge {
  challenge_id: string;
  email_hint: string;
  expires_in: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, opts?: { trust_device?: boolean }) => Promise<OtpChallenge | null>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  resendOtp: (challengeId: string) => Promise<OtpChallenge>;
  register: (
    email: string,
    password: string,
    full_name: string,
    profile?: { phone?: string; date_of_birth?: string; address?: string; country?: string },
  ) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = localStorage.getItem('rubicon_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      localStorage.removeItem('rubicon_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string, opts?: { trust_device?: boolean }): Promise<OtpChallenge | null> => {
    const res: any = await api.login({ email, password, trust_device: opts?.trust_device });
    if (res?.requires_otp && res.challenge_id) {
      return {
        challenge_id: res.challenge_id,
        email_hint: res.email_hint || email,
        expires_in: res.expires_in || 600,
      };
    }
    if (res?.token && res?.user) {
      localStorage.setItem('rubicon_token', res.token);
      setUser(res.user);
      return null;
    }
    throw new Error(res?.error || 'Sign in failed');
  };

  const verifyOtp = async (challengeId: string, code: string) => {
    const { user, token } = await api.verifyOtp({ challenge_id: challengeId, code });
    localStorage.setItem('rubicon_token', token);
    setUser(user);
  };

  const resendOtp = async (challengeId: string): Promise<OtpChallenge> => {
    const res: any = await api.resendOtp({ challenge_id: challengeId });
    return {
      challenge_id: challengeId,
      email_hint: res.email_hint || '',
      expires_in: res.expires_in || 600,
    };
  };

  const register = async (
    email: string,
    password: string,
    full_name: string,
    profile?: { phone?: string; date_of_birth?: string; address?: string; country?: string },
  ) => {
    const { user, token } = await api.register({ email, password, full_name, ...profile });
    localStorage.setItem('rubicon_token', token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('rubicon_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOtp, resendOtp, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
