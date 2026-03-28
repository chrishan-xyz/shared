// Unified auth middleware factory — shared across all apps
// Supports: bcrypt password hashing, timing-safe API key comparison,
// pluggable session stores (sqlite, memory), configurable cookie/TTL/signing
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DEFAULTS = {
  cookieName: 'session',
  passwordEnvVar: 'APP_PASSWORD',
  defaultPassword: 'changeme',
  apiKeyHeader: 'x-api-key',
  apiKeyEnvVar: 'API_KEY',
  sessionStore: 'memory',       // 'memory' | 'sqlite'
  sessionTTL: 24 * 60 * 60 * 1000,        // 24h absolute
  sessionIdleTTL: 4 * 60 * 60 * 1000,     // 4h idle
  maxSessions: 100,
  cleanupInterval: 15 * 60 * 1000,        // 15 min
  bcryptRounds: 12,
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: 'strict',
  skipPaths: [],                // paths that bypass auth entirely
  logError: console.error,      // override with structured logger
};

// ── Memory session store ───────────────────────────────────────────────────
function createMemoryStore() {
  const sessions = new Map();

  return {
    get(id) {
      const s = sessions.get(id);
      if (!s) return null;
      return { id, created_at: s.created, last_access: s.lastAccess };
    },
    set(id, data) {
      sessions.set(id, { created: data.created_at, lastAccess: data.last_access });
    },
    touch(id, now) {
      const s = sessions.get(id);
      if (s) s.lastAccess = now;
    },
    delete(id) { sessions.delete(id); },
    count() { return sessions.size; },
    evictOldest() {
      let oldestId = null, oldestTime = Infinity;
      for (const [id, s] of sessions.entries()) {
        const t = new Date(s.lastAccess || s.created).getTime();
        if (t < oldestTime) { oldestTime = t; oldestId = id; }
      }
      if (oldestId) sessions.delete(oldestId);
    },
    cleanup(idleThreshold) {
      const now = Date.now();
      for (const [id, s] of sessions.entries()) {
        const created = new Date(s.created).getTime();
        const lastAccess = new Date(s.lastAccess || s.created).getTime();
        if (now - created > 0 && lastAccess < idleThreshold) sessions.delete(id);
      }
    },
  };
}

// ── SQLite session store ───────────────────────────────────────────────────
function createSqliteStore(getDb) {
  let _stmts = null;

  function stmts() {
    if (!_stmts) {
      const d = getDb();
      _stmts = {
        get: d.prepare('SELECT * FROM sessions WHERE id = ?'),
        insert: d.prepare('INSERT INTO sessions (id, created_at, last_access, expires_at) VALUES (?, ?, ?, ?)'),
        touch: d.prepare('UPDATE sessions SET last_access = ? WHERE id = ?'),
        delete: d.prepare('DELETE FROM sessions WHERE id = ?'),
        cleanup: d.prepare("DELETE FROM sessions WHERE expires_at < datetime('now') OR last_access < ?"),
        count: d.prepare('SELECT COUNT(*) as c FROM sessions'),
        oldest: d.prepare('SELECT id FROM sessions ORDER BY last_access ASC LIMIT 1'),
      };
    }
    return _stmts;
  }

  return {
    get(id) {
      try { return stmts().get.get(id) || null; }
      catch { return null; }
    },
    set(id, data) {
      try { stmts().insert.run(id, data.created_at, data.last_access, data.expires_at); }
      catch (e) { /* ignore dupes */ }
    },
    touch(id, now) {
      try { stmts().touch.run(now, id); }
      catch { /* ignore */ }
    },
    delete(id) {
      try { stmts().delete.run(id); }
      catch { /* ignore */ }
    },
    count() {
      try { return stmts().count.get().c; }
      catch { return 0; }
    },
    evictOldest() {
      try {
        const oldest = stmts().oldest.get();
        if (oldest) stmts().delete.run(oldest.id);
      } catch { /* ignore */ }
    },
    cleanup(idleThreshold) {
      try { stmts().cleanup.run(new Date(idleThreshold).toISOString()); }
      catch { /* ignore */ }
    },
  };
}

// ── Factory ────────────────────────────────────────────────────────────────
function createAuth(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const {
    cookieName, passwordEnvVar, defaultPassword, apiKeyHeader, apiKeyEnvVar,
    sessionStore: storeType, sessionTTL, sessionIdleTTL, maxSessions,
    cleanupInterval, bcryptRounds, cookieSecure, cookieSameSite,
    skipPaths, logError,
  } = config;

  // ── Session store ──
  let store;
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
    } catch (e) { logError('Session cleanup failed:', e.message); }
  }, cleanupInterval);
  cleanupTimer.unref();

  // ── Password hash cache ──
  let cachedHash = null;
  async function getPasswordHash() {
    if (cachedHash) return cachedHash;
    const plaintext = process.env[passwordEnvVar] || defaultPassword;
    cachedHash = await bcrypt.hash(plaintext, bcryptRounds);
    return cachedHash;
  }
  getPasswordHash().catch(() => {}); // Eager init

  // ── Timing-safe API key comparison ──
  function safeCompareApiKey(provided) {
    const expected = process.env[apiKeyEnvVar];
    if (!provided || !expected) return false;
    const hmac1 = crypto.createHmac('sha256', 'auth-key-check').update(provided).digest();
    const hmac2 = crypto.createHmac('sha256', 'auth-key-check').update(expected).digest();
    return crypto.timingSafeEqual(hmac1, hmac2);
  }

  // ── Session validation ──
  function validateSession(sessionId) {
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
      logError('Session validation failed:', e.message);
      return false;
    }
  }

  // ── Create session ──
  function createSession() {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + sessionTTL).toISOString();

    if (store.count() >= maxSessions) store.evictOldest();
    store.set(sessionId, { created_at: now, last_access: now, expires_at: expiresAt });
    return sessionId;
  }

  // ── Cookie helper ──
  function setSessionCookie(res, sessionId) {
    res.cookie(cookieName, sessionId, {
      signed: true, httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: sessionTTL,
    });
  }

  // ── Middleware ──
  function requireAuth(req, res, next) {
    // Skip configured paths
    for (const path of skipPaths) {
      if (req.path.startsWith(path)) return next();
    }

    // API key auth (timing-safe)
    const apiKey = req.headers[apiKeyHeader];
    if (apiKey && safeCompareApiKey(apiKey)) {
      req.isApiKey = true;
      return next();
    }

    // Session cookie auth
    const sessionId = req.signedCookies?.[cookieName];
    if (validateSession(sessionId)) {
      req.sessionId = sessionId;
      return next();
    }

    return res.status(401).json({ error: 'Authentication required' });
  }

  // ── Route handlers ──
  async function login(req, res) {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    try {
      const hash = await getPasswordHash();
      const match = await bcrypt.compare(password, hash);
      if (!match) return res.status(401).json({ error: 'Invalid password' });

      const sessionId = createSession();
      setSessionCookie(res, sessionId);
      res.json({ ok: true });
    } catch (err) {
      logError('Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  function logout(req, res) {
    const sessionId = req.signedCookies?.[cookieName];
    if (sessionId) store.delete(sessionId);
    res.clearCookie(cookieName);
    res.json({ ok: true });
  }

  function status(req, res) {
    // API key → auto-create session
    const apiKey = req.headers[apiKeyHeader];
    if (apiKey && safeCompareApiKey(apiKey)) {
      const sessionId = createSession();
      setSessionCookie(res, sessionId);
      return res.json({ authenticated: true });
    }

    const sessionId = req.signedCookies?.[cookieName];
    res.json({ authenticated: validateSession(sessionId) });
  }

  // ── Auth routes helper ──
  function authRoutes(router) {
    const express = require('express');
    const r = router || express.Router();
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

module.exports = { createAuth, createMemoryStore, createSqliteStore };
