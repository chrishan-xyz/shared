import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Rate Limiting Middleware — In-memory, zero dependencies
// ---------------------------------------------------------------------------

interface RateLimitConfig {
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

interface RateLimitPresets {
  auth: RateLimitConfig;
  api: RateLimitConfig;
  arlo: RateLimitConfig;
  write: RateLimitConfig;
  heavy: RateLimitConfig;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStoreStats {
  activeKeys: number;
  entries: Array<{ key: string; count: number; resetsIn: number }>;
}

const DEFAULT_OPTIONS: Required<RateLimitConfig> = {
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
  statusCode: 429,
  headers: true,
  keyGenerator: (req: Request): string => {
    return req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
      || req.ip
      || req.socket?.remoteAddress
      || 'unknown';
  },
  skip: (): boolean => false,
};

// Presets for common route patterns
const rateLimitPresets: RateLimitPresets = {
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  api: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  arlo: {
    windowMs: 60 * 1000,
    max: 60,
    message: 'Arlo API rate limit exceeded. Slow down orchestration calls.',
  },
  write: {
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many write operations. Please slow down.',
  },
  heavy: {
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many requests to this resource. Please wait.',
  },
};

// ---------------------------------------------------------------------------
// Store: in-memory sliding window
// ---------------------------------------------------------------------------
class RateLimitStore {
  private hits: Map<string, RateLimitEntry>;
  private _cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.hits = new Map();
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Increment counter for a key. Returns { count, resetTime }.
   */
  increment(key: string, windowMs: number): RateLimitEntry {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now >= entry.resetTime) {
      const record: RateLimitEntry = { count: 1, resetTime: now + windowMs };
      this.hits.set(key, record);
      return record;
    }

    entry.count++;
    return entry;
  }

  /**
   * Get current state for a key without incrementing.
   */
  get(key: string): RateLimitEntry | null {
    return this.hits.get(key) || null;
  }

  /**
   * Remove expired entries to prevent memory leaks.
   */
  private _cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  /**
   * Get store stats for monitoring.
   */
  stats(): RateLimitStoreStats {
    return {
      activeKeys: this.hits.size,
      entries: Array.from(this.hits.entries()).map(([key, v]) => ({
        key: key.replace(/\d+/g, '*'),
        count: v.count,
        resetsIn: Math.max(0, Math.ceil((v.resetTime - Date.now()) / 1000)),
      })),
    };
  }
}

// Shared store across all limiters (single process)
const globalStore = new RateLimitStore();

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------
function rateLimit(options: RateLimitConfig = {}): RequestHandler {
  const opts: Required<RateLimitConfig> = { ...DEFAULT_OPTIONS, ...options };
  const store = globalStore;

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (opts.skip(req)) {
      next();
      return;
    }

    const key = `${opts.windowMs}:${opts.max}:${opts.keyGenerator(req)}`;
    const { count, resetTime } = store.increment(key, opts.windowMs);

    const remaining = Math.max(0, opts.max - count);
    const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);

    // Set rate limit headers
    if (opts.headers) {
      res.set('X-RateLimit-Limit', String(opts.max));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));
    }

    // Under limit — proceed
    if (count <= opts.max) {
      next();
      return;
    }

    // Over limit — 429
    if (opts.headers) {
      res.set('Retry-After', String(resetSeconds));
    }

    res.status(opts.statusCode).json({
      error: opts.message,
      retryAfter: resetSeconds,
    });
  };
}

// ---------------------------------------------------------------------------
// Utility: per-route key generator
// ---------------------------------------------------------------------------
function perRouteKeyGenerator(req: Request): string {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
    || req.ip
    || req.socket?.remoteAddress
    || 'unknown';
  return `${req.method}:${req.baseUrl || ''}${req.path}:${ip}`;
}

export { rateLimit, rateLimitPresets, perRouteKeyGenerator, globalStore };
export type { RateLimitConfig, RateLimitPresets, RateLimitStore, RateLimitEntry, RateLimitStoreStats };
