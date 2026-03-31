import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction, Router as ExpressRouter } from 'express';

// ---------------------------------------------------------------------------
// Unified Auth Middleware Factory — shared across all apps
// ---------------------------------------------------------------------------

interface DatabaseLike {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
  };
}

interface SessionData {
  id?: string;
  created_at: string;
  last_access: string;
  expires_at?: string;
}

interface SessionStore {
  get(id: string): SessionData | null;
  set(id: string, data: SessionData): void;
  touch(id: string, now: string): void;
  delete(id: string): void;
  count(): number;
  evictOldest(): void;
  cleanup(idleThreshold: number): void;
}

interface AuthConfig {
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

interface AuthInstance {
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

interface InternalSessionEntry {
  created: string;
  lastAccess: string;
}

const DEFAULTS = {
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

// ── Memory session store ───────────────────────────────────────────────────
function createMemoryStore(): SessionStore {
  const sessions = new Map<string, InternalSessionEntry>();

  return {
    get(id: string): SessionData | null {
      const s = sessions.get(id);
      if (!s) return null;
      return { id, created_at: s.created, last_access: s.lastAccess };
    },
    set(id: string, data: SessionData): void {
      sessions.set(id, { created: data.created_at, lastAccess: data.last_access });
    },
    touch(id: string, now: string): void {
      const s = sessions.get(id);
      if (s) s.lastAccess = now;
    },
    delete(id: string): void { sessions.delete(id); },
    count(): number { return sessions.size; },
    evictOldest(): void {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, s] of sessions.entries()) {
        const t = new Date(s.lastAccess || s.created).getTime();
        if (t < oldestTime) { oldestTime = t; oldestId = id; }
      }
      if (oldestId) sessions.delete(oldestId);
    },
    cleanup(idleThreshold: number): void {
      for (const [id, s] of sessions.entries()) {
        const lastAccess = new Date(s.lastAccess || s.created).getTime();
        if (lastAccess < idleThreshold) sessions.delete(id);
      }
    },
  };
}

// ── SQLite session store ───────────────────────────────────────────────────
interface SqliteStatements {
  get: { get(id: string): SessionData | undefined };
  insert: { run(id: string, created_at: string, last_access: string, expires_at: string): unknown };
  touch: { run(now: string, id: string): unknown };
  delete: { run(id: string): unknown };
  cleanup: { run(threshold: string): unknown };
  count: { get(): { c: number } };
  oldest: { get(): { id: string } | undefined };
}

function createSqliteStore(getDb: () => DatabaseLike): SessionStore {
  let _stmts: SqliteStatements | null = null;

  function stmts(): SqliteStatements {
    if (!_stmts) {
      const d = getDb();
      _stmts = {
        get: d.prepare('SELECT * FROM sessions WHERE id = ?') as SqliteStatements['get'],
        insert: d.prepare('INSERT INTO sessions (id, created_at, last_access, expires_at) VALUES (?, ?, ?, ?)') as SqliteStatements['insert'],
        touch: d.prepare('UPDATE sessions SET last_access = ? WHERE id = ?') as SqliteStatements['touch'],
        delete: d.prepare('DELETE FROM sessions WHERE id = ?') as SqliteStatements['delete'],
        cleanup: d.prepare("DELETE FROM sessions WHERE expires_at < datetime('now') OR last_access < ?") as SqliteStatements['cleanup'],
        count: d.prepare('SELECT COUNT(*) as c FROM sessions') as SqliteStatements['count'],
        oldest: d.prepare('SELECT id FROM sessions ORDER BY last_access ASC LIMIT 1') as SqliteStatements['oldest'],
      };
    }
    return _stmts;
  }

  return {
    get(id: string): SessionData | null {
      try { return (stmts().get.get(id) as SessionData) || null; }
      catch { return null; }
    },
    set(id: string, data: SessionData): void {
      try { stmts().insert.run(id, data.created_at, data.last_access, data.expires_at || ''); }
      catch { /* ignore dupes */ }
    },
    touch(id: string, now: string): void {
      try { stmts().touch.run(now, id); }
      catch { /* ignore */ }
    },
    delete(id: string): void {
      try { stmts().delete.run(id); }
      catch { /* ignore */ }
    },
    count(): number {
      try { return stmts().count.get().c; }
      catch { return 0; }
    },
    evictOldest(): void {
      try {
        const oldest = stmts().oldest.get();
        if (oldest) stmts().delete.run(oldest.id);
      } catch { /* ignore */ }
    },
    cleanup(idleThreshold: number): void {
      try { stmts().cleanup.run(new Date(idleThreshold).toISOString()); }
      catch { /* ignore */ }
    },
  };
}

// ── Factory ────────────────────────────────────────────────────────────────
function createAuth(options: AuthConfig = {}): AuthInstance {
  const config = { ...DEFAULTS, ...options };
  const {
    cookieName, passwordEnvVar, defaultPassword, apiKeyHeader, apiKeyEnvVar,
    sessionStore: storeType, sessionTTL, sessionIdleTTL, maxSessions,
    cleanupInterval, bcryptRounds, cookieSecure, cookieSameSite,
    skipPaths, logError,
  } = config;

  // ── Session store ──
  let store: SessionStore;
  if (storeType === 'sqlite') {
    if (!config.getDb) throw new Error('createAuth: sessionStore "sqlite" requires getDb function');
    store = createSqliteStore(config.getDb);
  } else {
    store = createMemoryStore();
  }

  // ── Cleanup timer ──
  const cleanupTimer = setInterval(() => {
    try {
      const idleThreshold = Date.now() - sessionIdleTTL;
      store.cleanup(idleThreshold);
    } catch (e) { logError('Session cleanup failed:', (e as Error).message); }
  }, cleanupInterval);
  cleanupTimer.unref();

  // ── Password hash cache ──
  let cachedHash: string | null = null;
  async function getPasswordHash(): Promise<string> {
    if (cachedHash) return cachedHash;
    const plaintext = process.env[passwordEnvVar] || defaultPassword;
    cachedHash = await bcrypt.hash(plaintext, bcryptRounds);
    return cachedHash;
  }
  getPasswordHash().catch(() => {}); // Eager init

  // ── Timing-safe API key comparison ──
  function safeCompareApiKey(provided: string | undefined): boolean {
    const expected = process.env[apiKeyEnvVar];
    if (!provided || !expected) return false;
    const hmac1 = crypto.createHmac('sha256', 'auth-key-check').update(provided).digest();
    const hmac2 = crypto.createHmac('sha256', 'auth-key-check').update(expected).digest();
    return crypto.timingSafeEqual(hmac1, hmac2);
  }

  // ── Session validation ──
  function validateSession(sessionId: string | undefined): boolean {
    if (!sessionId) return false;
    try {
      const session = store.get(sessionId);
      if (!session) return false;

      const now = Date.now();
      const created = new Date(session.created_at).getTime();
      const lastAccess = new Date(session.last_access).getTime();

      if (now - created > sessionTTL) {
        store.delete(sessionId);
        return false;
      }
      if (now - lastAccess > sessionIdleTTL) {
        store.delete(sessionId);
        return false;
      }
      store.touch(sessionId, new Date().toISOString());
      return true;
    } catch (e) {
      logError('Session validation failed:', (e as Error).message);
      return false;
    }
  }

  // ── Create session ──
  function createSession(): string {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + sessionTTL).toISOString();

    if (store.count() >= maxSessions) store.evictOldest();
    store.set(sessionId, { created_at: now, last_access: now, expires_at: expiresAt });
    return sessionId;
  }

  // ── Cookie helper ──
  function setSessionCookie(res: Response, sessionId: string): void {
    res.cookie(cookieName, sessionId, {
      signed: true, httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: sessionTTL,
    });
  }

  // ── Middleware ──
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    for (const p of skipPaths) {
      if (req.path.startsWith(p)) {
        next();
        return;
      }
    }

    const apiKey = req.headers[apiKeyHeader] as string | undefined;
    if (apiKey && safeCompareApiKey(apiKey)) {
      (req as Request & { isApiKey?: boolean }).isApiKey = true;
      next();
      return;
    }

    const sessionId = req.signedCookies?.[cookieName] as string | undefined;
    if (validateSession(sessionId)) {
      (req as Request & { sessionId?: string }).sessionId = sessionId;
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required' });
  }

  // ── Route handlers ──
  async function login(req: Request, res: Response): Promise<void> {
    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    try {
      const hash = await getPasswordHash();
      const match = await bcrypt.compare(password, hash);
      if (!match) {
        res.status(401).json({ error: 'Invalid password' });
        return;
      }

      const sessionId = createSession();
      setSessionCookie(res, sessionId);
      res.json({ ok: true });
    } catch (err) {
      logError('Login error:', (err as Error).message);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  function logout(req: Request, res: Response): void {
    const sessionId = req.signedCookies?.[cookieName] as string | undefined;
    if (sessionId) store.delete(sessionId);
    res.clearCookie(cookieName);
    res.json({ ok: true });
  }

  function status(req: Request, res: Response): void {
    const apiKey = req.headers[apiKeyHeader] as string | undefined;
    if (apiKey && safeCompareApiKey(apiKey)) {
      const sessionId = createSession();
      setSessionCookie(res, sessionId);
      res.json({ authenticated: true });
      return;
    }

    const sessionId = req.signedCookies?.[cookieName] as string | undefined;
    res.json({ authenticated: validateSession(sessionId) });
  }

  // ── Auth routes helper ──
  function authRoutes(router?: ExpressRouter): ExpressRouter {
    const express = require('express');
    const r: ExpressRouter = router || express.Router();
    r.post('/login', login);
    r.post('/logout', logout);
    r.get('/status', status);
    return r;
  }

  return {
    requireAuth,
    login,
    logout,
    status,
    authRoutes,
    validateSession,
    safeCompareApiKey,
    createSession,
    setSessionCookie,
  };
}

export { createAuth, createMemoryStore, createSqliteStore };
export type { AuthConfig, AuthInstance, SessionStore, SessionData };
