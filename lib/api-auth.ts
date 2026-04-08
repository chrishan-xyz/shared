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

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const DEFAULT_HEALTH_PATHS = new Set([
  '/api/health',
  '/api/health/memory',
  '/health',
]);

/**
 * Timing-safe API key comparison using HMAC to normalize length.
 * Prevents timing-based key extraction attacks.
 */
export function safeCompareKey(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const hmac1 = crypto.createHmac('sha256', 'auth-key-check').update(String(provided)).digest();
  const hmac2 = crypto.createHmac('sha256', 'auth-key-check').update(String(expected)).digest();
  return crypto.timingSafeEqual(hmac1, hmac2);
}

export type AuthMethod = 'api-key' | 'remote-user' | 'bypass' | 'app-specific';

export interface ApiAuthOptions {
  /** Env var name for the API key (default: 'ARLO_API_KEY') */
  apiKeyEnvVar?: string;
  /** Fallback env var names to check for the API key */
  apiKeyFallbackEnvVars?: string[];
  /** Paths exempt from auth (defaults: /api/health, /api/health/memory, /health) */
  healthPaths?: Set<string>;
  /** Path prefixes to skip auth entirely (e.g., ['/api/auth']) */
  skipPaths?: string[];
  /** App-specific auth check: (req) => boolean. Called when common checks fail. */
  appAuth?: (req: Request) => boolean;
  /** Called with (req, method) when auth succeeds */
  onAuth?: (req: Request, method: AuthMethod) => void;
  /** Logger for unauthorized attempts */
  logWarn?: (msg: string) => void;
}

/**
 * Create API auth middleware.
 *
 * Checks in order: API key → Remote-User → X-Arlo-Bypass → appAuth callback.
 * Health endpoints and skipPaths are always exempt.
 */
export function createApiAuth(options: ApiAuthOptions = {}) {
  const {
    apiKeyEnvVar = 'ARLO_API_KEY',
    apiKeyFallbackEnvVars = [],
    healthPaths = DEFAULT_HEALTH_PATHS,
    skipPaths = [],
    appAuth = null,
    onAuth = null,
    logWarn = null,
  } = options;

  return function apiAuth(req: Request, res: Response, next: NextFunction): void {
    // Build full path for health/skip checks
    const fullPath = req.baseUrl + req.path;

    // Allow health endpoints (no auth needed)
    if (healthPaths.has(fullPath) || healthPaths.has(req.path)) {
      next();
      return;
    }

    // Allow configured skip paths
    for (const prefix of skipPaths) {
      if (req.path.startsWith(prefix) || fullPath.startsWith(prefix)) {
        next();
        return;
      }
    }

    // 1. API key check — accept X-API-Key and X-Arlo-Api-Key
    const providedKey = (req.headers['x-api-key'] || req.headers['x-arlo-api-key']) as string | undefined;
    if (providedKey) {
      const envVars = [apiKeyEnvVar, ...apiKeyFallbackEnvVars];
      for (const envVar of envVars) {
        const expected = process.env[envVar];
        if (expected && safeCompareKey(providedKey, expected)) {
          if (onAuth) onAuth(req, 'api-key');
          next();
          return;
        }
      }
    }

    // 2. Remote-User header (Authelia via Caddy forward_auth)
    const remoteUser = req.headers['remote-user'];
    if (remoteUser && typeof remoteUser === 'string' && remoteUser.length > 0) {
      if (onAuth) onAuth(req, 'remote-user');
      next();
      return;
    }

    // 3. X-Arlo-Bypass header (Hatch sandbox — Caddy validates the token)
    const arloBypass = req.headers['x-arlo-bypass'];
    if (arloBypass && typeof arloBypass === 'string' && arloBypass.length > 0) {
      if (onAuth) onAuth(req, 'bypass');
      next();
      return;
    }

    // 4. App-specific auth (session cookies, share tokens, etc.)
    if (appAuth && appAuth(req)) {
      if (onAuth) onAuth(req, 'app-specific');
      next();
      return;
    }

    // No valid credentials — reject
    if (logWarn) {
      logWarn(`401 Unauthorized: ${req.method} ${req.originalUrl} from ${req.ip}`);
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Valid API key or authentication required' });
  };
}
