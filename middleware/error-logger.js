// ---------------------------------------------------------------------------
// Structured Error & Request Logger — JSON logging with timing, rotating files
// ---------------------------------------------------------------------------
// Logs all requests with timing (X-Response-Time header), flags slow requests
// (>500ms). Catches unhandled errors with structured context.
// Writes to rotating log files: errors-YYYY-MM-DD.json + requests-YYYY-MM-DD.json
//
// Usage:
//   const { errorLogger, requestLogger } = require('./middleware/error-logger');
//   app.use(requestLogger);       // Early — logs timing + sets X-Response-Time
//   // ... routes ...
//   app.use(errorLogger(dbGetter)); // Last — catches unhandled errors
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024;  // 5MB per file
const MAX_LOG_FILES = 5;                // Keep 5 rotated files
const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'api_key', 'apiKey',
  'authorization', 'cookie', 'x-arlo-api-key', 'x-arlo-script-key'
]);

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) { /* ok */ }

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize an object — redact sensitive fields, truncate large values
 */
function sanitize(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 10).map(v => sanitize(v, depth + 1));

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'string' && val.length > 500) {
      clean[key] = val.slice(0, 500) + `...[truncated ${val.length} chars]`;
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitize(val, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Get current log file path (date-based)
 */
function getLogPath() {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `errors-${date}.json`);
}

/**
 * Rotate log files — keep only MAX_LOG_FILES most recent
 */
function rotateIfNeeded() {
  try {
    const logPath = getLogPath();
    const stat = fs.statSync(logPath);
    if (stat.size > MAX_LOG_SIZE) {
      // Rename current to .1, shift others
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
        const to = `${logPath}.${i}`;
        try { fs.renameSync(from, to); } catch (e) { /* ok */ }
      }
    }
  } catch (e) { /* file doesn't exist yet, fine */ }

  // Cleanup old date files (keep last 7 days)
  try {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('errors-'));
    if (files.length > 7) {
      files.sort();
      for (const f of files.slice(0, files.length - 7)) {
        try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch (e) { /* ok */ }
      }
    }
  } catch (e) { /* ok */ }
}

/**
 * Write a structured log entry to file + console
 */
function writeLog(entry) {
  const line = JSON.stringify(entry);

  // Console — structured but readable
  const level = entry.level || 'error';
  const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
  console.error(`${color}[${entry.timestamp}] ${level.toUpperCase()} ${entry.method} ${entry.path}\x1b[0m — ${entry.error?.message || 'unknown'}`);

  // File — append JSON line
  try {
    rotateIfNeeded();
    fs.appendFileSync(getLogPath(), line + '\n');
  } catch (e) {
    console.error('[error-logger] Failed to write log file:', e.message);
  }
}

// ── Config — Request Timing ─────────────────────────────────────────────────
const SLOW_THRESHOLD_MS = 500;        // Flag requests slower than this
const SKIP_PATHS = new Set(['/api/health', '/sw.js', '/favicon.ico']);

/**
 * Get current request log file path (date-based, separate from error logs)
 */
function getRequestLogPath() {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `requests-${date}.json`);
}

/**
 * Write a request timing entry to file (no console for normal requests)
 */
function writeRequestLog(entry) {
  const line = JSON.stringify(entry);

  // Console only for slow/error requests
  if (entry.slow || entry.statusCode >= 400) {
    const color = entry.slow ? '\x1b[33m' : entry.statusCode >= 500 ? '\x1b[31m' : '\x1b[36m';
    const label = entry.slow ? '⚠️  SLOW' : `${entry.statusCode}`;
    console.log(`${color}[${entry.timestamp}] ${label} ${entry.method} ${entry.path} — ${entry.duration_ms}ms\x1b[0m`);
  }

  // File — append JSON line
  try {
    // Reuse rotate logic (check size, keep max files)
    const logPath = getRequestLogPath();
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > MAX_LOG_SIZE) {
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
          const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
          const to = `${logPath}.${i}`;
          try { fs.renameSync(from, to); } catch (e) { /* ok */ }
        }
      }
    } catch (e) { /* file doesn't exist yet, fine */ }

    fs.appendFileSync(logPath, line + '\n');
  } catch (e) { /* don't crash on log write failure */ }
}

// ── Request Logger + Timing ─────────────────────────────────────────────────

/**
 * Attaches timing info, logs completed requests with duration, flags slow ones.
 * Sets X-Response-Time header on every response.
 */
function requestLogger(req, res, next) {
  req._startTime = Date.now();
  req._requestId = Math.random().toString(36).slice(2, 10);

  // Hook into response finish to log timing
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - req._startTime;

    // Set X-Response-Time header (before end sends)
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }

    // Call original end
    originalEnd.apply(res, args);

    // Skip noisy paths
    const urlPath = req.originalUrl || req.path;
    if (SKIP_PATHS.has(urlPath)) return;
    // Skip static assets
    if (urlPath.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|map)$/)) return;

    const isSlow = duration > SLOW_THRESHOLD_MS;

    const entry = {
      timestamp: new Date().toISOString(),
      level: isSlow ? 'warn' : 'info',
      requestId: req._requestId,
      method: req.method,
      path: urlPath,
      statusCode: res.statusCode,
      duration_ms: duration,
      slow: isSlow || undefined,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
      userAgent: (req.headers['user-agent'] || '').slice(0, 100) || null,
    };

    writeRequestLog(entry);
  };

  next();
}

// ── Error Logger Middleware ──────────────────────────────────────────────────

/**
 * Creates the error logging middleware.
 * @param {Function} [getDb] — optional function returning DB instance for event logging
 * @returns Express error middleware (err, req, res, next)
 */
function errorLogger(getDb) {
  return (err, req, res, _next) => {
    const now = new Date();
    const duration = req._startTime ? Date.now() - req._startTime : null;

    // Build structured log entry
    const entry = {
      timestamp: now.toISOString(),
      level: 'error',
      requestId: req._requestId || null,
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: err.statusCode || err.status || 500,
      duration_ms: duration,
      error: {
        message: err.message,
        name: err.name || 'Error',
        code: err.code || null,
        stack: (err.stack || '').split('\n').slice(0, 5).map(l => l.trim()),
      },
      request: {
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        contentType: req.headers['content-type'] || null,
        body: req.body ? sanitize(req.body) : null,
        query: Object.keys(req.query || {}).length ? sanitize(req.query) : null,
      },
      session: {
        authenticated: !!req.session?.authenticated,
        sessionId: req.session?.id ? req.session.id.slice(0, 8) + '...' : null,
      },
    };

    // Write to console + file
    writeLog(entry);

    // Log to events table if DB available
    if (getDb) {
      try {
        const db = getDb();
        db.prepare(
          "INSERT INTO events (type, summary, metadata) VALUES ('error', ?, ?)"
        ).run(
          `Server error: ${req.method} ${entry.path} — ${err.message}`,
          JSON.stringify({
            requestId: entry.requestId,
            path: entry.path,
            method: entry.method,
            statusCode: entry.statusCode,
            duration_ms: entry.duration_ms,
            error: err.message,
            stack: entry.error.stack.slice(0, 3),
          })
        );
      } catch (logErr) { /* Don't let DB logging crash the error handler */ }
    }

    // Clean response — never leak stack traces in production
    const status = entry.statusCode;
    const isProduction = process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME;

    res.status(status).json({
      error: status === 500 ? 'Internal server error' : err.message,
      requestId: entry.requestId,
      ...(isProduction ? {} : { message: err.message, stack: entry.error.stack }),
    });
  };
}

// ── Unhandled Rejection / Exception Catchers ────────────────────────────────

function setupProcessHandlers() {
  process.on('uncaughtException', (err) => {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'fatal',
      method: 'PROCESS',
      path: 'uncaughtException',
      error: {
        message: err.message,
        name: err.name,
        stack: (err.stack || '').split('\n').slice(0, 10).map(l => l.trim()),
      },
    });
    // Don't exit — let the process try to recover
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      method: 'PROCESS',
      path: 'unhandledRejection',
      error: {
        message: err.message,
        name: err.name,
        stack: (err.stack || '').split('\n').slice(0, 10).map(l => l.trim()),
      },
    });
  });
}

module.exports = { errorLogger, requestLogger, sanitize, writeLog, setupProcessHandlers };
