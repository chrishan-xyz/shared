import type { Server } from 'http';
import { writeLog } from './error-logger';

// ---------------------------------------------------------------------------
// Graceful Shutdown Middleware — with structured logging
// ---------------------------------------------------------------------------

interface GracefulShutdownOptions {
  /** Async cleanup callback (close DB, timers, etc.) */
  onShutdown?: () => void | Promise<void>;
  /** Max ms to wait for connections to drain (default: 10000) */
  timeoutMs?: number;
}

let _shutdownInProgress = false;

/**
 * Attach graceful shutdown handlers to a running HTTP server.
 * Uses structured writeLog from error-logger for all shutdown events.
 */
function setupGracefulShutdown(server: Server, options: GracefulShutdownOptions = {}): void {
  const { onShutdown, timeoutMs = 10000 } = options;

  const shutdown = async (signal: string): Promise<void> => {
    if (_shutdownInProgress) return;
    _shutdownInProgress = true;

    console.log(`\n⏹️  [shutdown] ${signal} received — draining connections...`);
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      method: 'PROCESS',
      path: 'graceful-shutdown',
      error: { message: `${signal} received, starting graceful shutdown`, name: 'ShutdownSignal', stack: [] },
    });

    // 1. Stop accepting new connections
    server.close(async () => {
      console.log('⏹️  [shutdown] All connections drained.');

      try {
        // 2. Run custom cleanup (DB save + close, timers, etc.)
        if (onShutdown) {
          await onShutdown();
          console.log('⏹️  [shutdown] Cleanup complete.');
        }
      } catch (err) {
        console.error('⏹️  [shutdown] Cleanup error:', (err as Error).message);
        writeLog({
          timestamp: new Date().toISOString(),
          level: 'error',
          method: 'PROCESS',
          path: 'graceful-shutdown-cleanup',
          error: {
            message: (err as Error).message,
            name: (err as Error).name || 'Error',
            stack: ((err as Error).stack || '').split('\n').slice(0, 5),
          },
        });
      }

      console.log('⏹️  [shutdown] Exiting cleanly.');
      process.exit(0);
    });

    // 3. Force-kill after timeout if connections don't drain
    setTimeout(() => {
      console.error(`⏹️  [shutdown] Timeout (${timeoutMs}ms) — forcing exit.`);
      writeLog({
        timestamp: new Date().toISOString(),
        level: 'warn',
        method: 'PROCESS',
        path: 'graceful-shutdown-timeout',
        error: { message: `Forced exit after ${timeoutMs}ms timeout`, name: 'ShutdownTimeout', stack: [] },
      });
      process.exit(1);
    }, timeoutMs).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { setupGracefulShutdown };
export type { GracefulShutdownOptions };
