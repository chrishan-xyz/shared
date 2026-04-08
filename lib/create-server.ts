import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { Socket } from 'net';
import { setupGracefulShutdown } from './graceful-shutdown';

// ---------------------------------------------------------------------------
// create-server.ts — Express Server Factory
// ---------------------------------------------------------------------------

interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface ServerConfig {
  /** App identifier for logging (e.g. 'arlos', 'feed', 'recharge') */
  appName: string;
  /** Port to listen on (default: process.env.PORT || 8080) */
  port?: number | string;
  /** Path to static files directory (public/) */
  staticDir?: string;
  /** Mount all app routes: (app) => void */
  routes?: (app: Application) => void;
  /** Add app-specific middleware before routes: (app) => void */
  beforeRoutes?: (app: Application) => void;
  /** Add error handlers after routes: (app) => void */
  afterRoutes?: (app: Application) => void;
  /** Extra health check data returned at GET /api/health */
  onHealthCheck?: () => Record<string, unknown>;
  /** Cleanup callback on graceful shutdown */
  onShutdown?: () => void | Promise<void>;
  /** Called after server.listen() succeeds */
  onReady?: (server: Server) => void;
  /** Logger instance with .info/.warn/.error methods */
  logger?: Logger;
  /** Enable gzip compression (default: true) */
  compression?: boolean;
  /** Cookie signing secret (default: process.env.COOKIE_SECRET) */
  cookieSecret?: string;
  /** JSON body size limit (default: '1mb') */
  bodyLimit?: string | number;
  /** Graceful shutdown timeout in ms (default: 10000) */
  shutdownTimeoutMs?: number;
  /** Allowed CORS origins */
  corsOrigins?: string[];
}

interface ServerApplication extends Application {
  start(): Promise<Server>;
}

// Resolve peer dependencies from the calling app's node_modules.
function requirePeer(mod: string): unknown {
  try { return require(mod); } catch {
    return require(require.resolve(mod, { paths: [process.cwd()] }));
  }
}

/**
 * Create and configure a fully-featured Express server.
 */
function createServer(opts: ServerConfig): ServerApplication {
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

  const express = requirePeer('express') as typeof import('express');
  const cookieParser = requirePeer('cookie-parser') as (secret?: string) => RequestHandler;

  type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;

  const log: Logger = logger || {
    info: (...args: unknown[]) => console.log(`[${appName}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${appName}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${appName}]`, ...args),
  };

  // Documented `as` assertion: We add the `start()` method below, but express()
  // doesn't return it natively. Cast through unknown to satisfy the compiler.
  const app = express() as unknown as ServerApplication;

  // ── Compression ──────────────────────────────────────────────────────
  if (useCompression) {
    try {
      const compressionMw = requirePeer('compression') as Function & { filter: (req: Request, res: Response) => boolean };
      app.use(compressionMw({
        level: 6,
        threshold: 1024,
        filter: (req: Request, res: Response) => {
          const ct = (res.getHeader('Content-Type') || '') as string;
          if (/image|video|audio|font/.test(ct)) return false;
          return compressionMw.filter(req, res);
        },
      }));
    } catch {
      // compression not installed — skip silently
    }
  }

  // ── Core middleware ──────────────────────────────────────────────────
  app.use(cookieParser(cookieSecret));
  app.use(express.json({ limit: bodyLimit }));

  // ── CORS (simple) ───────────────────────────────────────────────────
  if (corsOrigins && corsOrigins.length > 0) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      if (origin && corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-arlo-api-key');
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  // ── Socket error protection ─────────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sock = req.socket as Socket & { __epipeGuarded?: boolean };
    if (sock && !sock.__epipeGuarded) {
      sock.__epipeGuarded = true;
      sock.on('error', (err: NodeJS.ErrnoException) => {
        if (['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(err.code || '')) return;
        log.error(`Socket error: ${err.code || err.message}`);
      });
    }
    next();
  });

  // ── Health check ────────────────────────────────────────────────────
  // Cache git SHA and package version at startup
  let _gitSha = process.env.GIT_SHA || 'unknown';
  if (_gitSha === 'unknown') {
    try {
      _gitSha = execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
      // Not in a git repo or git not available
    }
  }

  let _pkgVersion = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };
    _pkgVersion = pkg.version || '0.0.0';
  } catch {
    // package.json not found
  }

  app.get('/api/health', (_req: Request, res: Response) => {
    const extra = onHealthCheck ? onHealthCheck() : {};
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      app: appName,
      sha: _gitSha,
      uptime_seconds: Math.floor(process.uptime()),
      version: { commit: _gitSha, node: process.version, package: _pkgVersion },
      timestamp: new Date().toISOString(),
      memory: {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      system: {
        platform: process.platform,
        cpus: os.cpus().length,
        load_avg: os.loadavg().map((l: number) => Math.round(l * 100) / 100),
        free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      },
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

  // ── App-specific post-route middleware ───────────────────────────────
  if (afterRoutes) {
    afterRoutes(app);
  }

  // ── Global error handler ────────────────────────────────────────────
  app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
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
    const assetsDir = path.join(staticDir, 'assets');
    app.use('/assets', express.static(assetsDir, { maxAge: '1y', immutable: true }));

    app.use(express.static(staticDir, {
      maxAge: 0,
      etag: false,
      setHeaders: (res: Response) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      },
    }));

    // SPA fallback
    const indexPath = path.join(staticDir, 'index.html');
    app.get('*', (_req: Request, res: Response) => {
      try {
        const fs = require('fs');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(200).json({ status: 'ok', message: `${appName} API — no frontend deployed yet` });
        }
      } catch {
        res.status(200).json({ status: 'ok', message: `${appName} API` });
      }
    });
  }

  // ── Process-level error catchers ────────────────────────────────────
  process.on('uncaughtException', (err: Error) => {
    log.error(`Uncaught exception: ${err.message}`);
    if (err.stack) log.error(err.stack.split('\n').slice(0, 5).join('\n'));
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    log.error(`Unhandled rejection: ${msg}`);
  });

  // ── Start listening ─────────────────────────────────────────────────
  app.start = (): Promise<Server> => {
    return new Promise((resolve) => {
      const server = app.listen(port as number, '0.0.0.0', () => {
        log.info(`${appName} running on port ${port} (pid ${process.pid})`);

        setupGracefulShutdown(server, {
          timeoutMs: shutdownTimeoutMs,
          log,
          onShutdown: async () => {
            if (onShutdown) await onShutdown();
            log.info('Shutdown cleanup complete.');
          },
        });

        server.on('connection', (socket: Socket) => {
          socket.on('error', (err: NodeJS.ErrnoException) => {
            if (['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(err.code || '')) return;
            log.error(`Connection error: ${err.code || err.message}`);
          });
        });

        if (onReady) onReady(server);
        resolve(server);
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
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

export { createServer };
export type { ServerConfig, ServerApplication, Logger };
