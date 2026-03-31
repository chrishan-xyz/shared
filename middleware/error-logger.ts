import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Structured Error & Request Logger — JSON logging with timing, rotating files
// ---------------------------------------------------------------------------

interface DatabaseLike {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
}

interface LogEntry {
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

// ── Config ──────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024;  // 5MB per file
const MAX_LOG_FILES = 5;
const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'api_key', 'apiKey',
  'authorization', 'cookie', 'x-arlo-api-key', 'x-arlo-script-key'
]);

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ok */ }

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize an object — redact sensitive fields, truncate large values
 */
function sanitize(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || depth > 3) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 10).map(v => sanitize(v as Record<string, unknown>, depth + 1)) as unknown as Record<string, unknown>;

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'string' && val.length > 500) {
      clean[key] = val.slice(0, 500) + `...[truncated ${val.length} chars]`;
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitize(val as Record<string, unknown>, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Get current log file path (date-based)
 */
function getLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `errors-${date}.json`);
}

/**
 * Rotate log files — keep only MAX_LOG_FILES most recent
 */
function rotateIfNeeded(): void {
  try {
    const logPath = getLogPath();
    const stat = fs.statSync(logPath);
    if (stat.size > MAX_LOG_SIZE) {
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
        const to = `${logPath}.${i}`;
        try { fs.renameSync(from, to); } catch { /* ok */ }
      }
    }
  } catch { /* file doesn't exist yet, fine */ }

  // Cleanup old date files (keep last 7 days)
  try {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('errors-'));
    if (files.length > 7) {
      files.sort();
      for (const f of files.slice(0, files.length - 7)) {
        try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch { /* ok */ }
      }
    }
  } catch { /* ok */ }
}

/**
 * Write a structured log entry to file + console
 */
function writeLog(entry: LogEntry): void {
  const line = JSON.stringify(entry);

  const level = entry.level || 'error';
  const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
  console.error(`${color}[${entry.timestamp}] ${level.toUpperCase()} ${entry.method} ${entry.path}\x1b[0m — ${entry.error?.message || 'unknown'}`);

  try {
    rotateIfNeeded();
    fs.appendFileSync(getLogPath(), line + '\n');
  } catch (e) {
    console.error('[error-logger] Failed to write log file:', (e as Error).message);
  }
}

// ── Config — Request Timing ─────────────────────────────────────────────────
const SLOW_THRESHOLD_MS = 500;
const SKIP_PATHS = new Set(['/api/health', '/sw.js', '/favicon.ico']);

function getRequestLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `requests-${date}.json`);
}

function writeRequestLog(entry: LogEntry): void {
  const line = JSON.stringify(entry);

  if (entry.slow || (entry.statusCode && entry.statusCode >= 400)) {
    const color = entry.slow ? '\x1b[33m' : (entry.statusCode && entry.statusCode >= 500) ? '\x1b[31m' : '\x1b[36m';
    const label = entry.slow ? '⚠️  SLOW' : `${entry.statusCode}`;
    console.log(`${color}[${entry.timestamp}] ${label} ${entry.method} ${entry.path} — ${entry.duration_ms}ms\x1b[0m`);
  }

  try {
    const logPath = getRequestLogPath();
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > MAX_LOG_SIZE) {
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
          const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
          const to = `${logPath}.${i}`;
          try { fs.renameSync(from, to); } catch { /* ok */ }
        }
      }
    } catch { /* file doesn't exist yet, fine */ }

    fs.appendFileSync(logPath, line + '\n');
  } catch { /* don't crash on log write failure */ }
}

// ── Extended Request with timing fields ─────────────────────────────────────
interface TimedRequest extends Request {
  _startTime?: number;
  _requestId?: string;
  session?: { authenticated?: boolean; id?: string };
}

// ── Request Logger + Timing ─────────────────────────────────────────────────

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const tReq = req as TimedRequest;
  tReq._startTime = Date.now();
  tReq._requestId = Math.random().toString(36).slice(2, 10);

  const originalEnd = res.end;
  // Documented `as` assertion: Express's res.end has multiple overloaded signatures.
  // We need to intercept it while preserving the original contract — casting is the
  // only way to hook into the overloaded method.
  res.end = function (this: Response, ...args: unknown[]): Response {
    const duration = Date.now() - (tReq._startTime || 0);

    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }

    (originalEnd as Function).apply(res, args);

    const urlPath = req.originalUrl || req.path;
    if (SKIP_PATHS.has(urlPath)) return this;
    if (urlPath.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|map)$/)) return this;

    const isSlow = duration > SLOW_THRESHOLD_MS;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: isSlow ? 'warn' : 'info',
      requestId: tReq._requestId || null,
      method: req.method,
      path: urlPath,
      statusCode: res.statusCode,
      duration_ms: duration,
      slow: isSlow || undefined,
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || null,
      userAgent: (req.headers['user-agent'] || '').slice(0, 100) || null,
    };

    writeRequestLog(entry);
    return this;
  } as typeof res.end;

  next();
}

// ── Error Logger Middleware ──────────────────────────────────────────────────

function errorLogger(getDb?: () => DatabaseLike): ErrorRequestHandler {
  return (err: Error & { statusCode?: number; status?: number; code?: string }, req: Request, res: Response, _next: NextFunction): void => {
    const tReq = req as TimedRequest;
    const duration = tReq._startTime ? Date.now() - tReq._startTime : null;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      requestId: tReq._requestId || null,
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
        ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        contentType: req.headers['content-type'] || null,
        body: req.body ? sanitize(req.body) : null,
        query: Object.keys(req.query || {}).length ? sanitize(req.query as Record<string, unknown>) : null,
      },
      session: {
        authenticated: !!(tReq.session?.authenticated),
        sessionId: tReq.session?.id ? tReq.session.id.slice(0, 8) + '...' : null,
      },
    };

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
            stack: entry.error!.stack.slice(0, 3),
          })
        );
      } catch { /* Don't let DB logging crash the error handler */ }
    }

    const status = entry.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.FLY_APP_NAME;

    res.status(status).json({
      error: status === 500 ? 'Internal server error' : err.message,
      requestId: entry.requestId,
      ...(isProduction ? {} : { message: err.message, stack: entry.error!.stack }),
    });
  };
}

// ── Unhandled Rejection / Exception Catchers ────────────────────────────────

function setupProcessHandlers(): void {
  process.on('uncaughtException', (err: Error) => {
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
  });

  process.on('unhandledRejection', (reason: unknown) => {
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

export { errorLogger, requestLogger, sanitize, writeLog, setupProcessHandlers };
export type { LogEntry, DatabaseLike, TimedRequest };
