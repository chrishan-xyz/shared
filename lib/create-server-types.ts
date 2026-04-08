// ── create-server-types.ts — Shared type definitions ─────────────
// All interfaces used by the server factory and its consumers.

import type { Application } from 'express';
import type { Server } from 'http';

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

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

export interface ServerApplication extends Application {
  start(): Promise<Server>;
}
