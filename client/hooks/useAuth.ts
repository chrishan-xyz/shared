import { useState, useEffect } from 'react';

export interface UseAuthOptions {
  /** Function that checks authentication status. Should resolve to boolean. */
  checkAuth: () => Promise<boolean>;
}

export interface UseAuthResult {
  /** null = still checking, true = authenticated, false = not authenticated */
  authed: boolean | null;
  /** Call after successful login to set authed = true */
  onLogin: () => void;
}

/**
 * Generic authentication hook.
 * Checks auth status on mount, provides login callback.
 *
 * @example
 *   const { authed, onLogin } = useAuth({
 *     checkAuth: () => fetch('/auth/status').then(r => r.json()).then(d => d.authenticated)
 *   });
 */
export function useAuth(options: UseAuthOptions): UseAuthResult {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    options.checkAuth()
      .then(result => setAuthed(result))
      .catch(() => setAuthed(false));
  }, []);

  const onLogin = () => setAuthed(true);

  return { authed, onLogin };
}

export default useAuth;
