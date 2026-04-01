import { Component, ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────────

interface ErrorReportFn {
  (source: string, error: unknown, extra?: Record<string, unknown>): void;
}

// ── Error Boundary ───────────────────────────────────────────────────────

export interface ErrorBoundaryProps {
  /** Component name for error messages */
  name?: string;
  /** Custom fallback element */
  fallback?: ReactNode;
  children: ReactNode;
  /** Optional error reporting callback */
  onError?: ErrorReportFn;
  /** Max auto-retry attempts (default 3) */
  maxRetries?: number;
  /** Auto-retry delay in ms (default 3000) */
  retryDelay?: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    const { onError, name, maxRetries = 3 } = this.props;
    if (onError) {
      onError('ErrorBoundary', error, {
        component: name || 'unknown',
        componentStack: info?.componentStack?.slice(0, 500),
      });
    }
    if (this.state.retryCount < maxRetries) {
      this._retryTimer = setTimeout(() => {
        this.setState(s => ({ hasError: false, error: null, retryCount: s.retryCount + 1 }));
      }, this.props.retryDelay ?? 3000);
    }
  }

  componentWillUnmount(): void {
    if (this._retryTimer) clearTimeout(this._retryTimer);
  }

  handleRetry = (): void => {
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this.setState({ hasError: false, error: null, retryCount: 0 });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { name = 'Component', maxRetries = 3 } = this.props;
      return (
        <ErrorFallback
          name={name}
          error={this.state.error}
          onRetry={this.handleRetry}
          retryCount={this.state.retryCount}
          maxRetries={maxRetries}
        />
      );
    }
    return this.props.children;
  }
}

// ── Error Fallback ───────────────────────────────────────────────────────

export interface ErrorFallbackProps {
  name: string;
  error?: Error | null;
  onRetry?: () => void;
  retryCount?: number;
  maxRetries?: number;
  className?: string;
}

/** Inline X-circle icon — no external icon dependency */
function XCircleIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function ErrorFallback({
  name,
  error,
  onRetry,
  retryCount = 0,
  maxRetries = 3,
  className,
}: ErrorFallbackProps) {
  return (
    <div className={`ef-container ${className || ''}`}>
      <div className="ef-icon-wrap">
        <XCircleIcon size={24} className="ef-icon" />
      </div>

      <h3 className="ef-title">
        {name} failed to load
      </h3>

      {error?.message && (
        <pre className="ef-stack">
          {error.message.length > 300 ? error.message.slice(0, 300) + '…' : error.message}
        </pre>
      )}

      {retryCount < maxRetries && (
        <p className="ef-status">
          Auto-retrying in 3s… (attempt {retryCount + 1}/{maxRetries})
        </p>
      )}
      {retryCount >= maxRetries && (
        <p className="ef-status">
          Auto-retry exhausted.
        </p>
      )}

      <div className="ef-actions">
        {onRetry && (
          <button onClick={onRetry} className="ef-btn-retry">
            Retry
          </button>
        )}
        <button onClick={() => window.location.reload()} className="ef-btn-reload">
          Reload Page
        </button>
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────

export interface SkeletonProps {
  /** Width — CSS value (default '100%') */
  w?: string;
  /** Height — CSS value (default '16px') */
  h?: string;
  /** Additional class name */
  className?: string;
}

export function Skeleton({ w = '100%', h = '16px', className }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className || ''}`}
      style={{ width: w, height: h }}
    />
  );
}
