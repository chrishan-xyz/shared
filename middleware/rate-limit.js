// ---------------------------------------------------------------------------
// Rate Limiting Middleware — In-memory, zero dependencies
// ---------------------------------------------------------------------------
// Configurable per-route or global. Uses a sliding window counter stored in
// a Map. Stale entries are cleaned up periodically to prevent memory leaks.
//
// Usage:
//   const { rateLimit, rateLimitPresets } = require('./middleware/rate-limit');
//
//   // Global: 100 requests per 15 min per IP
//   app.use('/api', rateLimit());
//
//   // Per-route: strict auth limit
//   app.post('/api/auth/login', rateLimit(rateLimitPresets.auth), handler);
//
//   // Custom:
//   app.use('/api/heavy', rateLimit({ windowMs: 60000, max: 10 }));
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // requests per window per key
  message: 'Too many requests, please try again later.',
  statusCode: 429,
  headers: true,              // send X-RateLimit-* and Retry-After headers
  keyGenerator: (req) => {
    // Use X-Forwarded-For (Fly.io proxy) or fall back to socket IP
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.ip
      || req.socket?.remoteAddress
      || 'unknown';
  },
  skip: () => false,          // return true to skip rate limiting for a request
};

// Presets for common route patterns
const rateLimitPresets = {
  // Auth: tight — 10 attempts per 15 min (brute force protection)
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  // API general: 100 req / 15 min (default)
  api: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  // Arlo script API: generous — these are automated orchestration calls
  arlo: {
    windowMs: 60 * 1000,
    max: 60,
    message: 'Arlo API rate limit exceeded. Slow down orchestration calls.',
  },
  // Write operations (POST/PUT/DELETE): 30 per minute
  write: {
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many write operations. Please slow down.',
  },
  // Heavy/expensive endpoints (metrics, dashboard aggregation): 20 per minute
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
  constructor() {
    this.hits = new Map(); // key -> { count, resetTime }
    // Cleanup stale entries every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    // Don't let cleanup interval keep the process alive
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Increment counter for a key. Returns { count, resetTime }.
   */
  increment(key, windowMs) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now >= entry.resetTime) {
      // New window
      const record = { count: 1, resetTime: now + windowMs };
      this.hits.set(key, record);
      return record;
    }

    // Existing window — increment
    entry.count++;
    return entry;
  }

  /**
   * Get current state for a key without incrementing.
   */
  get(key) {
    return this.hits.get(key) || null;
  }

  /**
   * Remove expired entries to prevent memory leaks.
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetTime) {
        this.hits.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      // Silent cleanup — only log in development for debugging
      if (process.env.NODE_ENV !== 'production') {
        // console.log(`[rate-limit] Cleaned ${cleaned} expired entries, ${this.hits.size} active`);
      }
    }
  }

  /**
   * Get store stats for monitoring.
   */
  stats() {
    return {
      activeKeys: this.hits.size,
      entries: Array.from(this.hits.entries()).map(([key, v]) => ({
        key: key.replace(/\d+/g, '*'), // mask IPs for privacy
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
function rateLimit(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const store = globalStore;

  return function rateLimitMiddleware(req, res, next) {
    // Skip if configured to
    if (opts.skip(req)) return next();

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
      return next();
    }

    // Over limit — 429
    if (opts.headers) {
      res.set('Retry-After', String(resetSeconds));
    }

    return res.status(opts.statusCode).json({
      error: opts.message,
      retryAfter: resetSeconds,
    });
  };
}

// ---------------------------------------------------------------------------
// Utility: create a key generator that includes the route path
// (useful for per-route limits that share the same middleware)
// ---------------------------------------------------------------------------
function perRouteKeyGenerator(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.ip
    || req.socket?.remoteAddress
    || 'unknown';
  return `${req.method}:${req.baseUrl || ''}${req.path}:${ip}`;
}

module.exports = { rateLimit, rateLimitPresets, perRouteKeyGenerator, globalStore };
