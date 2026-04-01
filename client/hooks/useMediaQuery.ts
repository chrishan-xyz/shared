import { useState, useEffect } from 'react';

/**
 * Returns true when the given CSS media query matches.
 * Updates reactively on viewport resize.
 *
 * @example
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 */
export default function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
