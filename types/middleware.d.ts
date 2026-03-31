// ---------------------------------------------------------------------------
// Shared Middleware Types
// ---------------------------------------------------------------------------
// Type declarations for middleware/asyncHandler.js, middleware/rate-limit.js,
// middleware/timeout.js, middleware/security.js, middleware/api-version.js,
// and middleware/error-logger.js
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';

// ── asyncHandler.js ─────────────────────────────────────────────────────────

/** Handler function that may be sync or async */
export type AsyncHandlerFn = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Wraps route handlers to catch sync and async errors, forwarding them to next().
 * Usage: router.get('/', wrap(async (req, res) => { ... }))
 */
export function wrap(fn: AsyncHandlerFn): RequestHandler;

// Re-export as default (asyncHandler.js uses module.exports = wrap)
export default wrap;

// ── rate-limit.js ───────────────────────────────────────────────────────────

/** Configuration options for the rate limiter */
export interface RateLimitConfig {
  /** Window duration in ms (default: 15 min) */
  windowMs?: number;
  /** Max requests per window per key (default: 100) */
  max?: number;
  /** Response message when rate limited */
  message?: string;
  /** HTTP status code for rate limit responses (default: 429) */
  statusCode?: number;
  /** Send X-RateLimit-* and Retry-After headers (default: true) */
  headers?: boolean;
  /** Extract a rate-limit key from the request (default: IP-based) */
  keyGenerator?: (req: Request) => string;
  /** Return true to skip rate limiting for a request */
  skip?: (req: Request) => boolean;
}

/** Preset configurations for common rate-limit patterns */
export interface RateLimitPresets {
  /** Auth: 10 attempts per 15 min (brute force protection) */
  auth: RateLimitConfig;
  /** API general: 100 req / 15 min */
  api: RateLimitConfig;
  /** Arlo orchestration: 60 req / 1 min */
  arlo: RateLimitConfig;
  /** Write operations: 30 per minute */
  write: RateLimitConfig;
  /** Heavy/expensive endpoints: 20 per minute */
  heavy: RateLimitConfig;
}

/** In-memory sliding window rate limit store */
export interface RateLimitStore {
  increment(key: string, windowMs: number): { count: number; resetTime: number };
  get(key: string): { count: number; resetTime: number } | null;
  stats(): {
    activeKeys: number;
    entries: Array<{ key: string; count: number; resetsIn: number }>;
  };
}

/** Create a rate-limiting middleware */
export function rateLimit(options?: RateLimitConfig): RequestHandler;

/** Preset rate limit configurations */
export const rateLimitPresets: RateLimitPresets;

/** Key generator that includes method + route path + IP */
export function perRouteKeyGenerator(req: Request): string;

/** Global shared rate limit store (single process) */
export const globalStore: RateLimitStore;

// ── timeout.js ──────────────────────────────────────────────────────────────

/** Configuration for request timeout middleware */
export interface TimeoutConfig {
  /** Timeout in milliseconds (default: 30000) */
  ms?: number;
  /** URL prefixes to skip (e.g. SSE endpoints) */
  exclude?: string[];
}

/**
 * Creates a request timeout middleware.
 * Kills slow requests after a configurable duration. Excludes SSE/streaming.
 */
export function requestTimeout(options?: TimeoutConfig): RequestHandler;

// ── security.js ─────────────────────────────────────────────────────────────

/**
 * Secure headers middleware — adds defense-in-depth HTTP headers
 * (X-Content-Type-Options, X-Frame-Options, HSTS, CSP, etc.)
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void;

/**
 * CSRF protection middleware — validates Origin/Referer on state-changing requests.
 * API key requests are exempt.
 * @param allowedOrigins — host strings like 'arlo.chrishan.xyz'
 */
export function csrfProtection(allowedOrigins: string[]): RequestHandler;

/**
 * CORS middleware — restricts cross-origin requests to an allowlist.
 * Handles preflight OPTIONS and sets proper CORS headers.
 * @param allowedOrigins — full origins like 'https://arlo.chrishan.xyz'
 */
export function corsMiddleware(allowedOrigins: string[]): RequestHandler;

// ── api-version.js ──────────────────────────────────────────────────────────

/** Extended request with API version info */
export interface VersionedRequest extends Request {
  /** API version string (e.g. 'v1') */
  apiVersion?: string;
}

/**
 * API versioning middleware — rewrites /api/v1/* → /api/* and sets req.apiVersion.
 * Current: v1 is the only version; /api/* and /api/v1/* are equivalent.
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void;

/** Current API version string */
export const CURRENT_VERSION: string;

// ── error-logger.js ─────────────────────────────────────────────────────────

/** Structured log entry written to file and console */
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'fatal';
  requestId?: string | null;
  method: string;
  path: string;
  statusCode?: number;
  duration_ms?: number | null;
  slow?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  error?: {
    message: string;
    name: string;
    code?: string | null;
    stack: string[];
  };
  request?: {
    ip: string | null;
    userAgent: string | null;
    contentType: string | null;
    body: Record<string, unknown> | null;
    query: Record<string, unknown> | null;
  };
  session?: {
    authenticated: boolean;
    sessionId: string | null;
  };
}

/**
 * Request timing + logging middleware.
 * Sets X-Response-Time header and logs completed requests.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void;

/**
 * Creates the error logging middleware.
 * @param getDb — optional function returning DB instance for event logging
 * @returns Express error middleware (err, req, res, next)
 */
export function errorLogger(getDb?: () => import('./db').DatabaseLike): ErrorRequestHandler;

/** Sanitize an object — redact sensitive fields, truncate large values */
export function sanitize(obj: Record<string, unknown>, depth?: number): Record<string, unknown>;

/** Write a structured log entry to file + console */
export function writeLog(entry: LogEntry): void;

/** Attach process-level uncaughtException and unhandledRejection handlers */
export function setupProcessHandlers(): void;
