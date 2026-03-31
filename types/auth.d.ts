// ---------------------------------------------------------------------------
// Shared Auth Types — create-auth.js patterns
// ---------------------------------------------------------------------------
// Type declarations for lib/create-auth.js
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction, Router } from 'express';

// ── Session Store ───────────────────────────────────────────────────────────

/** Session data stored in memory or SQLite */
export interface SessionData {
  id?: string;
  created_at: string;
  last_access: string;
  expires_at?: string;
}

/** Interface for pluggable session stores (memory or SQLite) */
export interface SessionStore {
  get(id: string): SessionData | null;
  set(id: string, data: SessionData): void;
  touch(id: string, now: string): void;
  delete(id: string): void;
  count(): number;
  evictOldest(): void;
  cleanup(idleThreshold: number): void;
}

// ── Auth Config ─────────────────────────────────────────────────────────────

/** Configuration options for createAuth() */
export interface AuthConfig {
  /** Cookie name for session ID (default: 'session') */
  cookieName?: string;
  /** Env var name for the password (default: 'APP_PASSWORD') */
  passwordEnvVar?: string;
  /** Fallback password if env var is unset (default: 'changeme') */
  defaultPassword?: string;
  /** Header name for API key auth (default: 'x-api-key') */
  apiKeyHeader?: string;
  /** Env var name for the API key (default: 'API_KEY') */
  apiKeyEnvVar?: string;
  /** Session store type (default: 'memory') */
  sessionStore?: 'memory' | 'sqlite';
  /** Absolute session TTL in ms (default: 24h) */
  sessionTTL?: number;
  /** Idle session TTL in ms (default: 4h) */
  sessionIdleTTL?: number;
  /** Max concurrent sessions (default: 100) */
  maxSessions?: number;
  /** Session cleanup interval in ms (default: 15 min) */
  cleanupInterval?: number;
  /** bcrypt hash rounds (default: 12) */
  bcryptRounds?: number;
  /** Set Secure flag on cookie (default: true in production) */
  cookieSecure?: boolean;
  /** SameSite cookie attribute (default: 'strict') */
  cookieSameSite?: 'strict' | 'lax' | 'none';
  /** Paths that bypass auth entirely */
  skipPaths?: string[];
  /** Error logger function (default: console.error) */
  logError?: (...args: unknown[]) => void;
  /** Required when sessionStore is 'sqlite': returns a DB instance */
  getDb?: () => import('./db').DatabaseLike;
}

// ── Auth Request Extensions ─────────────────────────────────────────────────

/** Extended Express request with auth fields set by requireAuth middleware */
export interface AuthenticatedRequest extends Request {
  /** True when authenticated via API key */
  isApiKey?: boolean;
  /** Session ID when authenticated via cookie */
  sessionId?: string;
}

// ── Auth Instance ───────────────────────────────────────────────────────────

/** The auth instance returned by createAuth() */
export interface AuthInstance {
  /** Middleware: require authentication (API key or session cookie) */
  requireAuth(req: Request, res: Response, next: NextFunction): void;
  /** Route handler: POST /login — validates password, creates session */
  login(req: Request, res: Response): Promise<void>;
  /** Route handler: POST /logout — destroys session */
  logout(req: Request, res: Response): void;
  /** Route handler: GET /status — returns authentication state */
  status(req: Request, res: Response): void;
  /** Mount auth routes (/login, /logout, /status) on a router */
  authRoutes(router?: Router): Router;
  /** Validate a session ID, touching last_access if valid */
  validateSession(sessionId: string | undefined): boolean;
  /** Timing-safe API key comparison */
  safeCompareApiKey(provided: string | undefined): boolean;
  /** Create a new session, returning the session ID */
  createSession(): string;
  /** Set the session cookie on a response */
  setSessionCookie(res: Response, sessionId: string): void;
}

// ── Exports ─────────────────────────────────────────────────────────────────

/** Create a fully configured auth instance */
export function createAuth(options?: AuthConfig): AuthInstance;

/** Create an in-memory session store */
export function createMemoryStore(): SessionStore;

/** Create a SQLite-backed session store */
export function createSqliteStore(getDb: () => import('./db').DatabaseLike): SessionStore;
