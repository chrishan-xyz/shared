import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction, Router as ExpressRouter } from 'express';
import { DEFAULTS } from './auth-types';
import type { AuthConfig, AuthInstance, SessionStore } from './auth-types';
import { createMemoryStore, createSqliteStore } from './auth-session-stores';

// ---------------------------------------------------------------------------
// Unified Auth Middleware Factory — shared across all apps
// ---------------------------------------------------------------------------

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
  const cleanupTimer: NodeJS.Timeout = setInterval(() => {
    try {
      const idleThreshold: number = Date.now() - sessionIdleTTL;
      store.cleanup(idleThreshold);
    } catch (e) { logError('Session cleanup failed:', (e as Error).message); }
  }, cleanupInterval);
  cleanupTimer.unref();

  // ── Password hash cache ──
  let cachedHash: string | null = null;
  async function getPasswordHash(): Promise<string> {
    if (cachedHash) return cachedHash;
    const plaintext: string = process.env[passwordEnvVar] || defaultPassword;
    cachedHash = await bcrypt.hash(plaintext, bcryptRounds);
    return cachedHash;
  }
  getPasswordHash().catch(() => {}); // Eager init

  // ── Timing-safe API key comparison ──
  function safeCompareApiKey(provided: string | undefined): boolean {
    const expected: string | undefined = process.env[apiKeyEnvVar];
    if (!provided || !expected) return false;
    const hmac1: Buffer = crypto.createHmac('sha256', 'auth-key-check').update(provided).digest();
    const hmac2: Buffer = crypto.createHmac('sha256', 'auth-key-check').update(expected).digest();
    return crypto.timingSafeEqual(hmac1, hmac2);
  }

  // ── Session validation ──
  function validateSession(sessionId: string | undefined): boolean {
    if (!sessionId) return false;
    try {
      const session = store.get(sessionId);
      if (!session) return false;

      const now: number = Date.now();
      const created: number = new Date(session.created_at).getTime();
      const lastAccess: number = new Date(session.last_access).getTime();

      if (now - created > sessionTTL) { store.delete(sessionId); return false; }
      if (now - lastAccess > sessionIdleTTL) { store.delete(sessionId); return false; }
      store.touch(sessionId, new Date().toISOString());
      return true;
    } catch (e) {
      logError('Session validation failed:', (e as Error).message);
      return false;
    }
  }

  // ── Create session ──
  function createSession(): string {
    const sessionId: string = uuidv4();
    const now: string = new Date().toISOString();
    const expiresAt: string = new Date(Date.now() + sessionTTL).toISOString();
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
      if (req.path.startsWith(p)) { next(); return; }
    }

    // API key
    const apiKey: string | undefined = req.headers[apiKeyHeader] as string | undefined;
    if (apiKey && safeCompareApiKey(apiKey)) {
      (req as Request & { isApiKey?: boolean }).isApiKey = true;
      next();
      return;
    }

    // X-Arlo-Bypass header
    const bypassHeader: string | undefined = req.headers['x-arlo-bypass'] as string | undefined;
    const expectedBypass: string | undefined = process.env['ARLO_BYPASS_KEY'];
    if (bypassHeader && expectedBypass && bypassHeader === expectedBypass) {
      next();
      return;
    }

    // Remote-User (set by Caddy after Authelia forward_auth)
    const remoteUser: string | undefined = req.headers['remote-user'] as string | undefined;
    if (remoteUser) { next(); return; }

    // Authelia session cookie
    if (process.env.AUTHELIA_ENABLED === 'true') {
      const autheliaCookie: string | undefined =
        (req as Request & { cookies?: Record<string, string> }).cookies?.['authelia_session'];
      if (autheliaCookie) { next(); return; }
    }

    // Session cookie
    const sessionId: string | undefined = req.signedCookies?.[cookieName] as string | undefined;
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
    if (!password) { res.status(400).json({ error: 'Password required' }); return; }
    try {
      const hash: string = await getPasswordHash();
      const match: boolean = await bcrypt.compare(password, hash);
      if (!match) { res.status(401).json({ error: 'Invalid password' }); return; }
      const sessionId: string = createSession();
      setSessionCookie(res, sessionId);
      res.json({ ok: true });
    } catch (err) {
      logError('Login error:', (err as Error).message);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  function logout(req: Request, res: Response): void {
    const sessionId: string | undefined = req.signedCookies?.[cookieName] as string | undefined;
    if (sessionId) store.delete(sessionId);
    res.clearCookie(cookieName);
    res.json({ ok: true });
  }

  function status(req: Request, res: Response): void {
    const apiKey: string | undefined = req.headers[apiKeyHeader] as string | undefined;
    if (apiKey && safeCompareApiKey(apiKey)) {
      const sid: string = createSession();
      setSessionCookie(res, sid);
      res.json({ authenticated: true });
      return;
    }
    if (process.env.AUTHELIA_ENABLED === 'true') {
      const autheliaCookie: string | undefined =
        (req as Request & { cookies?: Record<string, string> }).cookies?.['authelia_session'];
      if (autheliaCookie) { res.json({ authenticated: true }); return; }
    }
    const sessionId: string | undefined = req.signedCookies?.[cookieName] as string | undefined;
    res.json({ authenticated: validateSession(sessionId) });
  }

  function authRoutes(router?: ExpressRouter): ExpressRouter {
    const express = require('express');
    const r: ExpressRouter = router || express.Router();
    r.post('/login', login);
    r.post('/logout', logout);
    r.get('/status', status);
    return r;
  }

  return {
    requireAuth, login, logout, status, authRoutes,
    validateSession, safeCompareApiKey, createSession, setSessionCookie,
  };
}

export { createAuth, createMemoryStore, createSqliteStore };
export type { AuthConfig, AuthInstance, SessionStore } from './auth-types';
export type { SessionData } from './auth-types';
