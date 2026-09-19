import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useAdminAuth } from './context/AdminAuthContext';
import { Spinner } from './components/ui';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import AccountDetail from './pages/AccountDetail';
import AdminPanel from './pages/AdminPanel';
import AdminLoginPage from './pages/AdminLoginPage';
import TransferPage from './pages/TransferPage';
import DepositPage from './pages/DepositPage';
import CryptoPage from './pages/CryptoPage';
import TransactionHistoryPage from './pages/TransactionHistoryPage';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import LegalPage from './pages/LegalPage';
import { SessionIdle } from './components/SessionIdle';

function SessionLoader() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center" role="status" aria-live="polite">
      <Spinner className="w-8 h-8" label="Loading" />
    </div>
  );
}

function CustomerProtected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminAuth();
  if (loading) return <SessionLoader />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function AdminLoginGate() {
  const { admin, loading } = useAdminAuth();
  if (loading) return <SessionLoader />;
  if (admin) return <Navigate to="/admin" replace />;
  return <AdminLoginPage />;
}

export default function App() {
  return (
    <>
    <SessionIdle />
    <Routes>
      <Route path="/admin/login" element={<AdminLoginGate />} />
      <Route path="/admin/*" element={<AdminProtected><AdminPanel /></AdminProtected>} />

      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/privacy" element={<LegalPage />} />
      <Route path="/disclosures" element={<LegalPage />} />

      <Route path="/dashboard" element={<CustomerProtected><Dashboard /></CustomerProtected>} />
      <Route path="/account/:id" element={<CustomerProtected><AccountDetail /></CustomerProtected>} />
      <Route path="/account/:id/history" element={<CustomerProtected><TransactionHistoryPage /></CustomerProtected>} />
      <Route path="/transfers" element={<CustomerProtected><TransferPage /></CustomerProtected>} />
      <Route path="/deposits" element={<CustomerProtected><DepositPage /></CustomerProtected>} />
      <Route path="/crypto" element={<CustomerProtected><CryptoPage /></CustomerProtected>} />
      <Route path="/profile" element={<CustomerProtected><ProfilePage /></CustomerProtected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
