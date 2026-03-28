// Security headers + CSRF protection middleware
// Addresses: H3 (session expiry), audit medium findings (missing headers)

/**
 * Secure headers middleware — adds defense-in-depth HTTP headers.
 * Apply before any route handlers.
 */
function securityHeaders(req, res, next) {
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

  // Referrer policy — don't leak full URL to external sites
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy — disable unnecessary browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy — restrict resource loading
  // Allows self + inline styles (Tailwind) + inline scripts (Vite dev)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",        // Vite injects inline scripts
    "style-src 'self' 'unsafe-inline'",          // Tailwind uses inline styles
    "img-src 'self' data: https:",               // Allow images from HTTPS + data URIs
    "font-src 'self'",
    "connect-src 'self'",                        // API calls to self only
    "frame-ancestors 'none'",                    // No framing (same as X-Frame-Options)
    "base-uri 'self'",                           // Prevent base tag injection
    "form-action 'self'",                        // Forms submit to self only
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  next();
}

/**
 * CSRF protection middleware — validates Origin/Referer on state-changing requests.
 * Only applies to POST, PUT, PATCH, DELETE requests.
 * API key requests (x-arlo-api-key) are exempt — they're machine-to-machine.
 */
function csrfProtection(allowedOrigins) {
  return function csrf(req, res, next) {
    // Only check state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    // API key requests are exempt (machine-to-machine, not browser)
    if (req.headers['x-arlo-api-key']) return next();

    // Auth routes are exempt (login needs to work from the same origin)
    if (req.path.startsWith('/auth') || req.path.startsWith('/api/auth')) return next();

    // Check Origin header first (most reliable)
    const origin = req.headers['origin'];
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (allowedOrigins.some(o => o === originHost || originHost.endsWith('.' + o))) {
          return next();
        }
      } catch (e) {
        // Invalid origin — fall through to reject
      }
      return res.status(403).json({ error: 'CSRF_REJECTED', message: 'Invalid origin' });
    }

    // Fallback: check Referer header
    const referer = req.headers['referer'];
    if (referer) {
      try {
        const refHost = new URL(referer).host;
        if (allowedOrigins.some(o => o === refHost || refHost.endsWith('.' + o))) {
          return next();
        }
      } catch (e) {
        // Invalid referer — fall through to reject
      }
      return res.status(403).json({ error: 'CSRF_REJECTED', message: 'Invalid referer' });
    }

    // No Origin or Referer — allow if it's likely a non-browser client
    // (curl, scripts, etc. typically don't send Origin/Referer)
    // But we've already exempted API key requests above.
    // For browser requests, same-origin POST always sends Origin.
    // If neither header is present, it's likely a non-browser client — allow it.
    next();
  };
}

/**
 * CORS middleware — restricts cross-origin requests to an allowlist.
 * Handles preflight OPTIONS requests and sets proper CORS headers.
 * Complements CSRF protection by telling browsers which origins are permitted.
 *
 * @param {string[]} allowedOrigins — full origins like 'https://your-app.fly.dev'
 */
function corsMiddleware(allowedOrigins) {
  const originsSet = new Set(allowedOrigins.map(o => o.toLowerCase()));

  return function cors(req, res, next) {
    const origin = req.headers['origin'];
    const isAllowed = origin && originsSet.has(origin.toLowerCase());

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-arlo-api-key, x-arlo-script-key, If-None-Match');
        res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24h
      }
      return res.status(204).end();
    }

    next();
  };
}

module.exports = { securityHeaders, csrfProtection, corsMiddleware };
