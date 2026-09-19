import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Modal, Button } from './ui';

const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = 13 * 60 * 1000;

/** Bank-style idle session timeout for customer sessions. */
export function SessionIdle() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [warn, setWarn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      setWarn(false);
      return;
    }

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
    };

    const arm = () => {
      clear();
      setWarn(false);
      warnTimer.current = setTimeout(() => setWarn(true), WARN_MS);
      timer.current = setTimeout(() => {
        logout();
        navigate('/login', { replace: true });
      }, IDLE_MS);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clear();
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [user, logout, navigate]);

  if (!user || !warn) return null;

  return (
    <Modal open={warn} onClose={() => setWarn(false)} title="Session expiring">
      <p className="text-sm text-content-secondary leading-relaxed">
        You will be signed out soon due to inactivity. Move your mouse or press a key to stay signed in.
      </p>
      <div className="mt-4">
        <Button fullWidth onClick={() => setWarn(false)}>Stay signed in</Button>
      </div>
    </Modal>
  );
}
