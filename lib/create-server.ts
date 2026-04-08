// ---------------------------------------------------------------------------
// create-server.ts — Express Server Factory (barrel)
// Orchestrates split modules into a single createServer() call.
// ---------------------------------------------------------------------------

import type { Server } from 'http';
import type { Socket } from 'net';
import type { Logger, ServerConfig, ServerApplication } from './create-server-types';
import { requirePeer, setupCompression, setupCoreParsing, setupCors, setupSocketProtection } from './create-server-middleware';
import { mountHealthCheck } from './create-server-health';
import { mountErrorHandler, setupProcessCatchers } from './create-server-errors';
import { mountStaticFiles } from './create-server-static';
import { setupGracefulShutdown } from './graceful-shutdown';

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

  const log: Logger = logger || {
    info: (...args: unknown[]) => console.log(`[${appName}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${appName}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${appName}]`, ...args),
  };

  const app = express() as unknown as ServerApplication;

  // ── Middleware pipeline ────────────────────────────────────────────
  if (useCompression) setupCompression(app);
  setupCoreParsing(app, cookieSecret, bodyLimit);
  if (corsOrigins && corsOrigins.length > 0) setupCors(app, corsOrigins);
  setupSocketProtection(app, log);

  // ── Health check ──────────────────────────────────────────────────
  mountHealthCheck(app, appName, onHealthCheck);

  // ── App hooks ─────────────────────────────────────────────────────
  if (beforeRoutes) beforeRoutes(app);
  if (routes) routes(app);
  if (afterRoutes) afterRoutes(app);

  // ── Error handling ────────────────────────────────────────────────
  mountErrorHandler(app, log);
  if (staticDir) mountStaticFiles(app, staticDir, appName);
  setupProcessCatchers(log);

  // ── Start listening ───────────────────────────────────────────────
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
