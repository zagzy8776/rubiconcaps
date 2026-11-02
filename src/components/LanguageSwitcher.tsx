import { useEffect, useState, useCallback } from 'react';
import { Languages } from 'lucide-react';

/**
 * Bank-style language helper using Google Translate.
 * Good for clients who do not read English; not a full native i18n.
 */
const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh-CN', label: '中文' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'ig', label: 'Igbo' },
  { code: 'ha', label: 'Hausa' },
  { code: 'de', label: 'Deutsch' },
  { code: 'sw', label: 'Kiswahili' },
];

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: any;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setGoogleLang(lang: string) {
  // Always set the cookie first so a reload still lands in the right language
  try {
    if (lang === 'en') {
      document.cookie = 'googtrans=;path=/;max-age=0';
      document.cookie = `googtrans=;path=/;domain=${window.location.hostname};max-age=0`;
    } else {
      document.cookie = `googtrans=/en/${lang};path=/;max-age=31536000`;
    }
  } catch {
    /* ignore */
  }

  const apply = () => {
    const select = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
    if (!select) return false;
    if (select.value !== lang) {
      select.value = lang;
      select.dispatchEvent(new Event('change'));
    }
    return true;
  };

  // Try immediately, then retry a few times while Google finishes injecting the combo
  if (apply()) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (apply() || attempts >= 20) clearInterval(timer);
  }, 150);
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const [lang, setLang] = useState(() => {
    const cookie = getCookie('googtrans');
    if (cookie && cookie.includes('/')) {
      const parts = cookie.split('/');
      return parts[parts.length - 1] || 'en';
    }
    return 'en';
  });
  const [ready, setReady] = useState(false);

  // Load Google Translate script once
  useEffect(() => {
    if (document.getElementById('google-translate-script')) {
      setReady(!!document.querySelector('.goog-te-combo'));
      return;
    }

    window.googleTranslateElementInit = () => {
      try {
        // eslint-disable-next-line no-new
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: LANGS.map((l) => l.code).join(','),
            autoDisplay: false,
            layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
          },
          'google_translate_element',
        );
        setReady(true);
        // Re-apply current language after the widget is ready
        const current = getCookie('googtrans');
        if (current && current.includes('/')) {
          const parts = current.split('/');
          const code = parts[parts.length - 1];
          if (code && code !== 'en') setGoogleLang(code);
        }
      } catch {
        setReady(false);
      }
    };

    const s = document.createElement('script');
    s.id = 'google-translate-script';
    s.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const onChange = useCallback((code: string) => {
    setLang(code);

    if (code === 'en') {
      // Full reset: clear cookie + reload so no leftover <font> nodes remain
      try {
        document.cookie = 'googtrans=;path=/;max-age=0';
        document.cookie = `googtrans=;path=/;domain=${window.location.hostname};max-age=0`;
      } catch {
        /* ignore */
      }
      window.location.reload();
      return;
    }

    setGoogleLang(code);
  }, []);

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <Languages className="w-3.5 h-3.5 text-content-muted shrink-0" aria-hidden />
      <label className="sr-only" htmlFor="site-lang">
        Language
      </label>
      <select
        id="site-lang"
        value={lang}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-caption text-content-secondary border border-line-subtle rounded-control px-2 py-1 max-w-[9rem] focus:outline-none focus:ring-1 focus:ring-brand-400/50"
        title="Translate this page"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} className="bg-surface text-content-primary">
            {l.label}
          </option>
        ))}
      </select>
      {/* Hidden Google element host */}
      <div id="google_translate_element" className="sr-only" aria-hidden />
      {!ready && <span className="sr-only">Loading translator…</span>}
    </div>
  );
}
