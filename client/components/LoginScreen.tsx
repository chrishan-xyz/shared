import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import './LoginScreen.css';

/**
 * LoginScreen — generic password login form with animated mount and error shake.
 * Uses CSS custom properties for theming — no app-specific imports.
 * Pass a custom `onSubmit` to handle authentication.
 */

export interface LoginScreenProps {
  /** Called with the entered password when form is submitted */
  onSubmit: (password: string) => Promise<void>;
  /** App title displayed in the wordmark (e.g., "ArlOS", "Recharge") */
  title?: string;
  /** Subtitle below the title */
  subtitle?: string;
  /** Optional icon/logo to render above the title */
  logo?: ReactNode;
  /** Optional loading spinner component; defaults to a CSS spinner */
  loadingIndicator?: ReactNode;
  /** CSS class name for the outer container */
  className?: string;
}

export default function LoginScreen({
  onSubmit,
  title = 'Login',
  subtitle,
  logo,
  loadingIndicator,
  className,
}: LoginScreenProps): JSX.Element {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await onSubmit(pw);
    } catch {
      setError('Invalid password');
      const form = document.getElementById('login-form');
      if (form) {
        form.style.animation = 'none';
        void (form as HTMLElement).offsetHeight;
        form.style.animation = 'fail-shake 0.4s ease-out';
      }
    } finally { setLoading(false); }
  };

  const inputClass = `ls-input${error ? ' ls-input--error' : pw ? ' ls-input--active' : ''}`;
  const submitClass = `ls-submit${pw ? ' ls-submit--ready' : ''}`;
  const formClass = `ls-form${mounted ? ' ls-form--mounted' : ''}`;

  const defaultSpinner = (
    <svg width={18} height={18} viewBox="0 0 24 24" className="ls-default-spinner">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
    </svg>
  );

  return (
    <div className={`ls-container${className ? ` ${className}` : ''}`}>
      <form id="login-form" onSubmit={submit} className={formClass}>
        {/* Logo */}
        {logo && <div className="ls-logo">{logo}</div>}

        {/* Wordmark */}
        <div className="ls-wordmark">
          <h1 className="ls-title">{title}</h1>
        </div>

        {/* Subtitle */}
        {subtitle && <p className="ls-subtitle">{subtitle}</p>}

        {/* Password input */}
        <div className="ls-input-group">
          <input
            type="password"
            placeholder="Password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className={inputClass}
          />
          {error && <p className="ls-error">{error}</p>}
        </div>

        {/* Submit button */}
        <button type="submit" disabled={loading || !pw} className={submitClass}>
          {loading ? (loadingIndicator || defaultSpinner) : 'Enter'}
        </button>
      </form>
    </div>
  );
}
