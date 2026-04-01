import { useState, useEffect, useCallback } from 'react';

export interface UseOnlineStatusReturn {
  isOnline: boolean;
  wasOffline: boolean;
}

/**
 * useOnlineStatus — reactive hook for network connectivity.
 *
 * Uses navigator.onLine + online/offline events for instant detection.
 * Returns { isOnline, wasOffline } where wasOffline is true for 3s
 * after coming back online (for "back online" toast).
 */
export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState<boolean>(false);

  const goOnline = useCallback((): void => {
    setIsOnline(true);
    setWasOffline(true);
    setTimeout(() => setWasOffline(false), 3000);
  }, []);

  const goOffline = useCallback((): void => {
    setIsOnline(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [goOnline, goOffline]);

  return { isOnline, wasOffline };
}
