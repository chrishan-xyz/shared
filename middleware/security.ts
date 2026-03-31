import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Security headers + CSRF protection middleware
// ---------------------------------------------------------------------------

/**
 * Secure headers middleware — adds defense-in-depth HTTP headers.
 */
function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // HSTS — enforce HTTPS for 1 year (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  next();
}

/**
 * CSRF protection middleware — validates Origin/Referer on state-changing requests.
 * API key requests are exempt.
 */
function csrfProtection(allowedOrigins: string[]): RequestHandler {
  return function csrf(req: Request, res: Response, next: NextFunction): void {
    // Only check state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }

    // API key requests are exempt
    if (req.headers['x-arlo-api-key']) {
      next();
      return;
    }

    // Auth routes are exempt
    if (req.path.startsWith('/auth') || req.path.startsWith('/api/auth')) {
      next();
      return;
    }

    // Check Origin header first (most reliable)
    const origin = req.headers['origin'];
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (allowedOrigins.some(o => o === originHost || originHost.endsWith('.' + o))) {
          next();
          return;
        }
      } catch {
        // Invalid origin — fall through to reject
      }
      res.status(403).json({ error: 'CSRF_REJECTED', message: 'Invalid origin' });
      return;
    }

    // Fallback: check Referer header
    const referer = req.headers['referer'];
    if (referer) {
      try {
        const refHost = new URL(referer).host;
        if (allowedOrigins.some(o => o === refHost || refHost.endsWith('.' + o))) {
          next();
          return;
        }
      } catch {
        // Invalid referer — fall through to reject
      }
      res.status(403).json({ error: 'CSRF_REJECTED', message: 'Invalid referer' });
      return;
    }

    // No Origin or Referer — likely non-browser client, allow
    next();
  };
}

/**
 * CORS middleware — restricts cross-origin requests to an allowlist.
 */
function corsMiddleware(allowedOrigins: string[]): RequestHandler {
  const originsSet = new Set(allowedOrigins.map(o => o.toLowerCase()));

  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers['origin'];
    const isAllowed = origin ? originsSet.has(origin.toLowerCase()) : false;

    if (isAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-arlo-api-key, x-arlo-script-key, If-None-Match');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      res.status(204).end();
      return;
    }

    next();
  };
}

export { securityHeaders, csrfProtection, corsMiddleware };
