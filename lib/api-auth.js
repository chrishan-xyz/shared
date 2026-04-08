// Shared API auth middleware — common auth checks across all Express apps.
//
// Validates requests via (in order):
//   1. X-API-Key or X-Arlo-Api-Key header (CLI, Hatch, programmatic)
//   2. Remote-User header (Authelia via Caddy forward_auth)
//   3. X-Arlo-Bypass header (Hatch sandbox — Caddy validates token)
//   4. Optional app-specific auth (provided via `appAuth` callback)
//
// Health endpoints are exempt by default.
// Returns 401 for unauthenticated requests.

const crypto = require('crypto');

const DEFAULT_HEALTH_PATHS = new Set([
  '/api/health',
  '/api/health/memory',
  '/health',
]);

/**
 * Timing-safe API key comparison using HMAC to normalize length.
 * Prevents timing-based key extraction attacks.
 */
function safeCompareKey(provided, expected) {
  if (!provided || !expected) return false;
  const hmac1 = crypto.createHmac('sha256', 'auth-key-check').update(String(provided)).digest();
  const hmac2 = crypto.createHmac('sha256', 'auth-key-check').update(String(expected)).digest();
  return crypto.timingSafeEqual(hmac1, hmac2);
}

/**
 * Create API auth middleware.
 *
 * @param {Object} options
 * @param {string} [options.apiKeyEnvVar='ARLO_API_KEY'] - Env var name for the API key
 * @param {string[]} [options.apiKeyFallbackEnvVars=[]] - Fallback env var names
 * @param {Set<string>} [options.healthPaths] - Paths exempt from auth (defaults: /api/health, /health)
 * @param {string[]} [options.skipPaths=[]] - Path prefixes to skip (e.g., ['/api/auth'])
 * @param {Function} [options.appAuth] - App-specific auth check: (req) => boolean. Called after
 *   common checks fail. If it returns true, request is authenticated.
 * @param {Function} [options.onAuth] - Called with (req, method) when auth succeeds.
 *   method is one of: 'api-key', 'remote-user', 'bypass', 'app-specific'
 * @param {Function} [options.logWarn] - Logger for unauthorized attempts
 * @returns {Function} Express middleware
 */
function createApiAuth(options = {}) {
  const {
    apiKeyEnvVar = 'ARLO_API_KEY',
    apiKeyFallbackEnvVars = [],
    healthPaths = DEFAULT_HEALTH_PATHS,
    skipPaths = [],
    appAuth = null,
    onAuth = null,
    logWarn = null,
  } = options;

  return function apiAuth(req, res, next) {
    // Build full path for health/skip checks
    const fullPath = req.baseUrl + req.path;

    // Allow health endpoints (no auth needed)
    if (healthPaths.has(fullPath) || healthPaths.has(req.path)) {
      return next();
    }

    // Allow configured skip paths
    for (const prefix of skipPaths) {
      if (req.path.startsWith(prefix) || fullPath.startsWith(prefix)) {
        return next();
      }
    }

    // 1. API key check — accept X-API-Key and X-Arlo-Api-Key
    const providedKey = req.headers['x-api-key'] || req.headers['x-arlo-api-key'];
    if (providedKey) {
      // Check primary env var, then fallbacks
      const envVars = [apiKeyEnvVar, ...apiKeyFallbackEnvVars];
      for (const envVar of envVars) {
        const expected = process.env[envVar];
        if (expected && safeCompareKey(providedKey, expected)) {
          if (onAuth) onAuth(req, 'api-key');
          return next();
        }
      }
    }

    // 2. Remote-User header (Authelia via Caddy forward_auth)
    const remoteUser = req.headers['remote-user'];
    if (remoteUser && typeof remoteUser === 'string' && remoteUser.length > 0) {
      if (onAuth) onAuth(req, 'remote-user');
      return next();
    }

    // 3. X-Arlo-Bypass header (Hatch sandbox — Caddy validates the token)
    const arloBypass = req.headers['x-arlo-bypass'];
    if (arloBypass && typeof arloBypass === 'string' && arloBypass.length > 0) {
      if (onAuth) onAuth(req, 'bypass');
      return next();
    }

    // 4. App-specific auth (session cookies, share tokens, etc.)
    if (appAuth && appAuth(req)) {
      if (onAuth) onAuth(req, 'app-specific');
      return next();
    }

    // No valid credentials — reject
    if (logWarn) {
      logWarn(`401 Unauthorized: ${req.method} ${req.originalUrl} from ${req.ip}`);
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Valid API key or authentication required' });
  };
}

module.exports = { createApiAuth, safeCompareKey, DEFAULT_HEALTH_PATHS };
