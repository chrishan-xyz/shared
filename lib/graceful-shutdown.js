// ---------------------------------------------------------------------------
// Graceful Shutdown — drain connections, close DB, flush logs, exit cleanly
// ---------------------------------------------------------------------------
// Shared module: prevents dropped requests during deploys. On SIGTERM/SIGINT:
// 1. Stop accepting new connections
// 2. Drain in-flight requests (configurable timeout)
// 3. Run custom cleanup (close DB, flush caches, etc.)
// 4. Exit with code 0 (or 1 on timeout)
// ---------------------------------------------------------------------------

let _shutdownInProgress = false;

/**
 * Attach graceful shutdown handlers to a running HTTP server.
 * @param {import('http').Server} server - The HTTP server from app.listen()
 * @param {object} options
 * @param {function} [options.onShutdown] - Async cleanup callback (close DB, timers, etc.)
 * @param {number}   [options.timeoutMs=10000] - Max ms to wait for connections to drain
 * @param {function} [options.log] - Logger function (defaults to console.log)
 */
function setupGracefulShutdown(server, options = {}) {
  const { onShutdown, timeoutMs = 10000, log } = options;

  const _log = (level, msg) => {
    if (log && typeof log[level] === 'function') {
      log[level](msg);
    } else if (log && typeof log === 'function') {
      log(msg);
    } else {
      console[level === 'error' ? 'error' : 'log'](msg);
    }
  };

  const shutdown = async (signal) => {
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
        _log('error', `Cleanup error: ${err.message}`);
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

module.exports = { setupGracefulShutdown };
