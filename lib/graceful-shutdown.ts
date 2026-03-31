import type { Server } from 'http';

// ---------------------------------------------------------------------------
// Graceful Shutdown — drain connections, close DB, flush logs, exit cleanly
// ---------------------------------------------------------------------------

interface LoggerLike {
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface GracefulShutdownConfig {
  /** Async cleanup callback (close DB, timers, etc.) */
  onShutdown?: () => void | Promise<void>;
  /** Max ms to wait for connections to drain (default: 10000) */
  timeoutMs?: number;
  /** Logger — object with .info/.error, or a plain function */
  log?: LoggerLike | ((...args: unknown[]) => void);
}

let _shutdownInProgress = false;

/**
 * Attach graceful shutdown handlers to a running HTTP server.
 */
function setupGracefulShutdown(server: Server, options: GracefulShutdownConfig = {}): void {
  const { onShutdown, timeoutMs = 10000, log } = options;

  const _log = (level: 'info' | 'error', msg: string): void => {
    if (log && typeof (log as LoggerLike)[level] === 'function') {
      (log as LoggerLike)[level](msg);
    } else if (log && typeof log === 'function') {
      (log as (...args: unknown[]) => void)(msg);
    } else {
      console[level === 'error' ? 'error' : 'log'](msg);
    }
  };

  const shutdown = async (signal: string): Promise<void> => {
    if (_shutdownInProgress) return;
    _shutdownInProgress = true;

    _log('info', `${signal} received — draining connections...`);

    // 1. Stop accepting new connections
    server.close(async () => {
      _log('info', 'All connections drained.');

      try {
        // 2. Run custom cleanup (DB save + close, timers, etc.)
        if (onShutdown) {
          await onShutdown();
          _log('info', 'Cleanup complete.');
        }
      } catch (err) {
        _log('error', `Cleanup error: ${(err as Error).message}`);
      }

      _log('info', 'Exiting cleanly.');
      process.exit(0);
    });

    // 3. Force-kill after timeout if connections don't drain
    setTimeout(() => {
      _log('error', `Timeout (${timeoutMs}ms) — forcing exit.`);
      process.exit(1);
    }, timeoutMs).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { setupGracefulShutdown };
export type { GracefulShutdownConfig };
