import type { Request, Response, NextFunction, Router as ExpressRouter } from 'express';

// ---------------------------------------------------------------------------
// Shared Auth Types & Defaults
// ---------------------------------------------------------------------------

export interface DatabaseLike {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
  };
}

export interface SessionData {
  id?: string;
  created_at: string;
  last_access: string;
  expires_at?: string;
}

export interface SessionStore {
  get(id: string): SessionData | null;
  set(id: string, data: SessionData): void;
  touch(id: string, now: string): void;
  delete(id: string): void;
  count(): number;
  evictOldest(): void;
  cleanup(idleThreshold: number): void;
}

export interface AuthConfig {
  cookieName?: string;
  passwordEnvVar?: string;
  defaultPassword?: string;
  apiKeyHeader?: string;
  apiKeyEnvVar?: string;
  sessionStore?: 'memory' | 'sqlite';
  sessionTTL?: number;
  sessionIdleTTL?: number;
  maxSessions?: number;
  cleanupInterval?: number;
  bcryptRounds?: number;
  cookieSecure?: boolean;
  cookieSameSite?: 'strict' | 'lax' | 'none';
  skipPaths?: string[];
  logError?: (...args: unknown[]) => void;
  getDb?: () => DatabaseLike;
}

export interface AuthInstance {
  requireAuth(req: Request, res: Response, next: NextFunction): void;
  login(req: Request, res: Response): Promise<void>;
  logout(req: Request, res: Response): void;
  status(req: Request, res: Response): void;
  authRoutes(router?: ExpressRouter): ExpressRouter;
  validateSession(sessionId: string | undefined): boolean;
  safeCompareApiKey(provided: string | undefined): boolean;
  createSession(): string;
  setSessionCookie(res: Response, sessionId: string): void;
}

export interface InternalSessionEntry {
  created: string;
  lastAccess: string;
}

export interface SqliteStatements {
  get: { get(id: string): SessionData | undefined };
  insert: { run(id: string, created_at: string, last_access: string, expires_at: string): unknown };
  touch: { run(now: string, id: string): unknown };
  delete: { run(id: string): unknown };
  cleanup: { run(threshold: string): unknown };
  count: { get(): { c: number } };
  oldest: { get(): { id: string } | undefined };
}

export const DEFAULTS: Required<Omit<AuthConfig, 'getDb'>> = {
  cookieName: 'session',
  passwordEnvVar: 'APP_PASSWORD',
  defaultPassword: 'changeme',
  apiKeyHeader: 'x-api-key',
  apiKeyEnvVar: 'API_KEY',
  sessionStore: 'memory' as const,
  sessionTTL: 24 * 60 * 60 * 1000,
  sessionIdleTTL: 4 * 60 * 60 * 1000,
  maxSessions: 100,
  cleanupInterval: 15 * 60 * 1000,
  bcryptRounds: 12,
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: 'strict' as const,
  skipPaths: [] as string[],
  logError: console.error as (...args: unknown[]) => void,
};
