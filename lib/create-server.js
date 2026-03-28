// ---------------------------------------------------------------------------
// create-server.js — Express Server Factory
// ---------------------------------------------------------------------------
// Shared module: creates a fully configured Express server with the standard
// middleware stack used across all @chrishan apps. Each app provides its
// routes, config, and optional hooks — gets the full stack automatically.
//
// Usage:
//   const { createServer } = require('@chrishan/shared/lib/create-server');
//   createServer({
//     appName: 'feed',
//     port: process.env.PORT || 8080,
//     staticDir: path.join(__dirname, 'public'),
//     routes: (app) => { app.use('/api/feed', feedRoutes); },
//     onHealthCheck: () => ({ db_ok: true }),
//     onShutdown: () => { db.close(); },
//     logger: require('./lib/logger'),
//   });
// ---------------------------------------------------------------------------

const path = require('path');
const { setupGracefulShutdown } = require('./graceful-shutdown');

// Resolve peer dependencies from the calling app's node_modules.
// When shared/ is symlinked or referenced via file:, these resolve from
// the app's own install — shared/ doesn't need its own node_modules.
function requirePeer(mod) {
  try { return require(mod); } catch (_) {
    // Fallback: resolve from the caller's node_modules up the directory tree
    return require(require.resolve(mod, { paths: [process.cwd()] }));
  }
}

/**
 * Create and start a fully configured Express server.
 *
 * @param {object} opts
 * @param {string}   opts.appName       - App identifier for logging (e.g. 'arlos', 'feed')
 * @param {number}   [opts.port=8080]   - Port to listen on
 * @param {string}   [opts.staticDir]   - Path to static files directory (public/)
 * @param {function} opts.routes        - (app) => void — mount all app routes
 * @param {function} [opts.beforeRoutes] - (app) => void — add app-specific middleware before routes
 * @param {function} [opts.afterRoutes]  - (app) => void — add error handlers after routes
 * @param {function} [opts.onHealthCheck] - () => object — extra health check data
 * @param {function} [opts.onShutdown]   - () => void — cleanup on graceful shutdown
 * @param {function} [opts.onReady]      - (server) => void — called after listen()
 * @param {object}   [opts.logger]       - Logger instance with .info/.warn/.error methods
 * @param {boolean}  [opts.compression=true] - Enable gzip compression
 * @param {string}   [opts.cookieSecret] - Cookie signing secret (defaults to env COOKIE_SECRET)
 * @param {number}   [opts.bodyLimit]    - JSON body size limit in bytes (default: 1MB)
 * @param {number}   [opts.shutdownTimeoutMs=10000] - Graceful shutdown timeout
 * @param {string[]} [opts.corsOrigins]  - Allowed CORS origins
 * @returns {express.Application} The configured Express app
 */
function createServer(opts) {
  const {
    appName,
    port = process.env.PORT || 8080,
    staticDir,
    routes,
    beforeRoutes,
    afterRoutes,
    onHealthCheck,
    onShutdown,
    onReady,
    logger,
    compression: useCompression = true,
    cookieSecret = process.env.COOKIE_SECRET,
    bodyLimit = '1mb',
    shutdownTimeoutMs = 10000,
    corsOrigins,
  } = opts;

  const express = requirePeer('express');
  const cookieParser = requirePeer('cookie-parser');

  const log = logger || {
    info: (...args) => console.log(`[${appName}]`, ...args),
    warn: (...args) => console.warn(`[${appName}]`, ...args),
    error: (...args) => console.error(`[${appName}]`, ...args),
  };

  const app = express();

  // ── Compression ──────────────────────────────────────────────────────
  if (useCompression) {
    try {
      const compressionMw = requirePeer('compression');
      app.use(compressionMw({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
          const ct = res.getHeader('Content-Type') || '';
          if (/image|video|audio|font/.test(ct)) return false;
          return compressionMw.filter(req, res);
        },
      }));
    } catch (_) {
      // compression not installed — skip silently
    }
  }

  // ── Core middleware ──────────────────────────────────────────────────
  app.use(cookieParser(cookieSecret));
  app.use(express.json({ limit: bodyLimit }));

  // ── CORS (simple) ───────────────────────────────────────────────────
  if (corsOrigins && corsOrigins.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-arlo-api-key');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  // ── Socket error protection ─────────────────────────────────────────
  app.use((req, res, next) => {
    const sock = req.socket;
    if (sock && !sock.__epipeGuarded) {
      sock.__epipeGuarded = true;
      sock.on('error', (err) => {
        if (['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(err.code)) return;
        log.error(`Socket error: ${err.code || err.message}`);
      });
    }
    next();
  });

  // ── Health check ────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    const extra = onHealthCheck ? onHealthCheck() : {};
    res.json({
      status: 'ok',
      app: appName,
      uptime_seconds: Math.floor(process.uptime()),
      ...extra,
    });
  });

  // ── App-specific pre-route middleware ────────────────────────────────
  if (beforeRoutes) {
    beforeRoutes(app);
  }

  // ── App routes ──────────────────────────────────────────────────────
  if (routes) {
    routes(app);
  }

  // ── App-specific post-route middleware (error handlers, etc.) ────────
  if (afterRoutes) {
    afterRoutes(app);
  }

  // ── Global error handler ────────────────────────────────────────────
  app.use((err, req, res, _next) => {
    const msg = err.message || 'Internal server error';
    log.error(`${req.method} ${req.path}: ${msg}`);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: 'Internal server error',
        detail: process.env.NODE_ENV === 'production' ? undefined : msg,
      });
    }
  });

  // ── Static files ────────────────────────────────────────────────────
  if (staticDir) {
    // Hashed assets — immutable cache
    const assetsDir = path.join(staticDir, 'assets');
    app.use('/assets', express.static(assetsDir, { maxAge: '1y', immutable: true }));

    // Everything else — no cache (HTML, SW, etc.)
    app.use(express.static(staticDir, {
      maxAge: 0,
      etag: false,
      setHeaders: (res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      },
    }));

    // ── SPA fallback ──────────────────────────────────────────────────
    const indexPath = path.join(staticDir, 'index.html');
    app.get('*', (req, res) => {
      try {
        const fs = require('fs');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(200).json({ status: 'ok', message: `${appName} API — no frontend deployed yet` });
        }
      } catch (_) {
        res.status(200).json({ status: 'ok', message: `${appName} API` });
      }
    });
  }

  // ── Process-level error catchers ────────────────────────────────────
  process.on('uncaughtException', (err) => {
    log.error(`Uncaught exception: ${err.message}`);
    if (err.stack) log.error(err.stack.split('\n').slice(0, 5).join('\n'));
    // Don't exit — let graceful shutdown handle it if the server is broken
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    log.error(`Unhandled rejection: ${msg}`);
  });

  // ── Start listening ─────────────────────────────────────────────────
  /**
   * Start the server. Call this after any async init (DB, seeding, etc.).
   * @returns {Promise<import('http').Server>}
   */
  app.start = () => {
    return new Promise((resolve) => {
      const server = app.listen(port, '0.0.0.0', () => {
        log.info(`${appName} running on port ${port} (pid ${process.pid})`);

        // Graceful shutdown
        setupGracefulShutdown(server, {
          timeoutMs: shutdownTimeoutMs,
          log,
          onShutdown: async () => {
            if (onShutdown) await onShutdown();
            log.info('Shutdown cleanup complete.');
          },
        });

        // Connection-level error handling
        server.on('connection', (socket) => {
          socket.on('error', (err) => {
            if (['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(err.code)) return;
            log.error(`Connection error: ${err.code || err.message}`);
          });
        });

        if (onReady) onReady(server);
        resolve(server);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          log.error(`Port ${port} already in use. Exiting.`);
          process.exit(1);
        }
        log.error(`Server error: ${err.message}`);
        process.exit(1);
      });
    });
  };

  return app;
}

module.exports = { createServer };
