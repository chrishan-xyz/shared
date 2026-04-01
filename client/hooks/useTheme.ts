import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

export interface UseThemeOptions {
  /** localStorage key for persisting theme. Default: 'app-theme' */
  storageKey?: string;
  /** Custom event name for cross-tab sync. Default: 'app-theme-change' */
  eventName?: string;
  /** Default theme when nothing is stored. Default: 'dark' */
  defaultTheme?: Theme;
  /** Dark theme meta color. Default: '#0D1117' */
  darkMetaColor?: string;
  /** Light theme meta color. Default: '#F6F8FA' */
  lightMetaColor?: string;
}

export interface UseThemeResult {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

/**
 * Manages theme state with localStorage persistence,
 * data-theme attribute on <html>, and cross-tab sync via CustomEvent.
 *
 * @example
 *   const { theme, isDark, toggle } = useTheme({ storageKey: 'arlos-theme' });
 */
export function useTheme(options: UseThemeOptions = {}): UseThemeResult {
  const {
    storageKey = 'app-theme',
    eventName = 'app-theme-change',
    defaultTheme = 'dark',
    darkMetaColor = '#0D1117',
    lightMetaColor = '#F6F8FA',
  } = options;

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
  });

  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(storageKey, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) (meta as HTMLMetaElement).content = theme === 'dark' ? darkMetaColor : lightMetaColor;
  }, [theme, storageKey, darkMetaColor, lightMetaColor]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail !== theme) setTheme(detail);
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [theme, eventName]);

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
      return next;
    });
  }, [eventName]);

  return { theme, isDark, toggle };
}

export default useTheme;
