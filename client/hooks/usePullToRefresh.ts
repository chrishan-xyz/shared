import { useState, useRef, useCallback, useEffect } from 'react';

const THRESHOLD = 70;
const MAX_PULL = 120;
const RESISTANCE = 0.45;

export interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
  bindRef: (node: HTMLElement | null) => void;
  THRESHOLD: number;
}

export default function usePullToRefresh(onRefresh: () => Promise<void>): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);

  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const pulling = useRef<boolean>(false);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent): void => {
    const el = containerRef.current;
    const scrollTop = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5 || isRefreshing) return;

    startY.current = e.touches[0].clientY;
    currentY.current = startY.current;
    pulling.current = false;
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent): void => {
    if (isRefreshing) return;

    const el = containerRef.current;
    const scrollTop = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5) {
      if (pulling.current) {
        pulling.current = false;
        setIsPulling(false);
        setPullDistance(0);
      }
      return;
    }

    currentY.current = e.touches[0].clientY;
    const rawDelta = currentY.current - startY.current;

    if (rawDelta > 10) {
      if (!pulling.current) {
        pulling.current = true;
        setIsPulling(true);
        startY.current = currentY.current;
      }

      const delta = (currentY.current - startY.current) * RESISTANCE;
      const clamped = Math.min(delta, MAX_PULL);
      setPullDistance(clamped);

      if (clamped > 0) {
        e.preventDefault();
      }
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async (): Promise<void> => {
    if (!pulling.current || isRefreshing) {
      setPullDistance(0);
      setIsPulling(false);
      pulling.current = false;
      return;
    }

    pulling.current = false;
    setIsPulling(false);

    if (pullDistance >= THRESHOLD * RESISTANCE) {
      setIsRefreshing(true);
      setPullDistance(THRESHOLD * RESISTANCE);
      try {
        await onRefresh();
      } catch {
        // Error handled silently
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  const bindRef = useCallback((node: HTMLElement | null): void => {
    if (containerRef.current) {
      containerRef.current.removeEventListener('touchstart', handleTouchStart);
      containerRef.current.removeEventListener('touchmove', handleTouchMove);
      containerRef.current.removeEventListener('touchend', handleTouchEnd);
    }

    containerRef.current = node;

    if (node) {
      node.addEventListener('touchstart', handleTouchStart, { passive: true });
      node.addEventListener('touchmove', handleTouchMove, { passive: false });
      node.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('touchstart', handleTouchStart);
        containerRef.current.removeEventListener('touchmove', handleTouchMove);
        containerRef.current.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing, isPulling, bindRef, THRESHOLD: THRESHOLD * RESISTANCE };
}
