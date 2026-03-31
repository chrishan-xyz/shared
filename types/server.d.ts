// ---------------------------------------------------------------------------
// Shared Server Types — create-server.js patterns
// ---------------------------------------------------------------------------
// Type declarations for lib/create-server.js and lib/graceful-shutdown.js
// ---------------------------------------------------------------------------

import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// ── Logger Interface ────────────────────────────────────────────────────────

/** Logger interface expected by createServer and graceful shutdown */
export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug?(...args: unknown[]): void;
}

/** Logger factory — createLogger('module') returns a Logger */
export type LoggerFactory = (module: string) => Logger;

// ── create-server.js ────────────────────────────────────────────────────────

/** Configuration options for createServer() */
export interface ServerConfig {
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

/** Express Application with the added start() method from createServer */
export interface ServerApplication extends Application {
  /** Start the server. Call after any async init (DB, seeding, etc.) */
  start(): Promise<Server>;
}

/**
 * Create and configure a fully-featured Express server with the standard
 * middleware stack (compression, cookie-parser, JSON body, CORS, health check,
 * global error handler, static files, SPA fallback, graceful shutdown).
 */
export function createServer(opts: ServerConfig): ServerApplication;

// ── graceful-shutdown.js ────────────────────────────────────────────────────

/** Options for setupGracefulShutdown() */
export interface GracefulShutdownConfig {
  /** Async cleanup callback (close DB, timers, etc.) */
  onShutdown?: () => void | Promise<void>;
  /** Max ms to wait for connections to drain (default: 10000) */
  timeoutMs?: number;
  /** Logger — object with .info/.error, or a plain function */
  log?: Logger | ((...args: unknown[]) => void);
}

/**
 * Attach graceful shutdown handlers (SIGTERM/SIGINT) to a running HTTP server.
 * Drains in-flight connections, runs cleanup, exits cleanly.
 */
export function setupGracefulShutdown(server: Server, options?: GracefulShutdownConfig): void;
