// ---------------------------------------------------------------------------
// Graceful Shutdown — drain connections, close DB, flush logs, exit cleanly
// ---------------------------------------------------------------------------
// Prevents dropped requests during Fly.io deploys. On SIGTERM/SIGINT:
// 1. Stop accepting new connections
// 2. Drain in-flight requests (10s timeout)
// 3. Close DB connection (flush sql.js to disk)
// 4. Flush error logs
// 5. Exit with code 0
// ---------------------------------------------------------------------------

const { writeLog } = require('./error-logger');

let _shutdownInProgress = false;

/**
 * Attach graceful shutdown handlers to a running HTTP server.
 * @param {import('http').Server} server - The HTTP server from app.listen()
 * @param {object} options
 * @param {function} [options.onShutdown] - Async cleanup callback (close DB, timers, etc.)
 * @param {number} [options.timeoutMs=10000] - Max ms to wait for connections to drain
 */
function setupGracefulShutdown(server, options = {}) {
  const { onShutdown, timeoutMs = 10000 } = options;

  const shutdown = async (signal) => {
    if (_shutdownInProgress) return;
    _shutdownInProgress = true;

    console.log(`\n⏹️  [shutdown] ${signal} received — draining connections...`);
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      method: 'PROCESS',
      path: 'graceful-shutdown',
      error: { message: `${signal} received, starting graceful shutdown` },
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
        console.error('⏹️  [shutdown] Cleanup error:', err.message);
        writeLog({
          timestamp: new Date().toISOString(),
          level: 'error',
          method: 'PROCESS',
          path: 'graceful-shutdown-cleanup',
          error: { message: err.message, stack: (err.stack || '').split('\n').slice(0, 5) },
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
        error: { message: `Forced exit after ${timeoutMs}ms timeout` },
      });
      process.exit(1);
    }, timeoutMs).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { setupGracefulShutdown };
