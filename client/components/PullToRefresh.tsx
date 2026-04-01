import { useState, useRef, useCallback, type ReactNode, type TouchEvent } from 'react';
import './PullToRefresh.css';

/**
 * PullToRefresh — mobile-native pull-to-refresh for any scrollable container.
 * Uses CSS custom properties for theming — no app-specific imports.
 */
const THRESHOLD = 60;
const MAX_PULL = 100;
const RESISTANCE = 0.4;

export interface PullToRefreshProps {
  onRefresh: () => void;
  refreshing: boolean;
  children: ReactNode;
  /** CSS class name for the outer container */
  className?: string;
}

export default function PullToRefresh({ onRefresh, refreshing, children, className }: PullToRefreshProps): JSX.Element {
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAtTop = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el) return false;
    let parent: HTMLElement | null = el;
    while (parent && parent !== document.body) {
      if (parent.scrollTop > 0) return false;
      parent = parent.parentElement;
    }
    return window.scrollY <= 0;
  }, []);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (refreshing) return;
    if (!isAtTop()) return;
    touchStartY.current = e.touches[0].clientY;
    setPulling(true);
  }, [refreshing, isAtTop]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy < 0) {
      setPullDistance(0);
      return;
    }
    const dampened = Math.min(dy * RESISTANCE, MAX_PULL);
    setPullDistance(dampened);
  }, [pulling, refreshing]);

  const onTouchEnd = useCallback(() => {
    if (!pulling) return;
    if (pullDistance >= THRESHOLD && onRefresh && !refreshing) {
      onRefresh();
    }
    setPullDistance(0);
    setPulling(false);
  }, [pulling, pullDistance, onRefresh, refreshing]);

  const triggered = pullDistance >= THRESHOLD;
  const showIndicator = pullDistance > 10 || refreshing;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`ptr-container${className ? ` ${className}` : ''}`}
    >
      {showIndicator && (
        <div
          className="ptr-indicator"
          style={{
            transform: `translate3d(0, ${refreshing ? THRESHOLD * 0.6 : pullDistance - 20}px, 0)`,
            transition: pulling ? 'none' : 'transform 0.35s var(--spring-bounce, ease-out)',
          }}
        >
          <div className="ptr-spinner-wrap">
            {refreshing ? (
              <div className="ptr-loading-ring" />
            ) : (
              <svg
                width={14} height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke={triggered ? 'var(--accent, #22c55e)' : 'var(--text-dim, #666)'}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: `rotate(${triggered ? 180 : 0}deg)`,
                  transition: 'transform 0.2s ease',
                }}
              >
                <path d="M12 5v14M5 12l7-7 7 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div style={{
        transform: `translate3d(0, ${refreshing ? 8 : pullDistance > 10 ? pullDistance * 0.3 : 0}px, 0)`,
        transition: pulling ? 'none' : 'transform 0.35s var(--spring-bounce, ease-out)',
      }}>
        {children}
      </div>
    </div>
  );
}
