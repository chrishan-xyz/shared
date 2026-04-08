// ---------------------------------------------------------------------------
// Shared 404 / SPA Fallback Middleware
// ---------------------------------------------------------------------------
// Provides two middleware functions:
//   - apiNotFound:  Returns JSON 404 for unmatched /api/* routes
//   - spaFallback:  Serves index.html for non-API, non-asset routes (SPA)
//
// Usage (must be mounted AFTER all routes, BEFORE error handler):
//
//   import { apiNotFound, spaFallback } from './not-found';
//   app.use('/api', apiNotFound());
//   app.get('*', spaFallback(path.join(__dirname, 'public', 'index.html')));
//   app.use(errorHandler);
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

// Static asset extensions — don't serve index.html for these
const ASSET_RE = /\.(js|css|map|woff2?|ico|png|jpe?g|gif|svg|webp|mp4|webm|json|txt|xml)$/i;

interface ApiNotFoundOptions {
  /** Extra fields merged into every 404 JSON response */
  extra?: Record<string, unknown>;
}

/**
 * Returns JSON 404 for any unmatched API route.
 *
 * Mount on `/api` after all API routers:
 *   app.use('/api', apiNotFound());
 */
function apiNotFound(opts?: ApiNotFoundOptions) {
  const extra = opts?.extra || {};
  return (req: Request, res: Response, _next: NextFunction): void => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl || req.path, ...extra });
  };
}

interface SpaFallbackOptions {
  /** Cache-Control header for the HTML response (default: no-cache) */
  cacheControl?: string;
  /** Serve 404 for missing static assets instead of index.html */
  skipAssets?: boolean;
}

/**
 * SPA catch-all: serves index.html for non-API, non-asset GET requests.
 *
 * Mount as the LAST `app.get('*', ...)` handler:
 *   app.get('*', spaFallback('/abs/path/to/index.html'));
 */
function spaFallback(indexPath: string, opts?: SpaFallbackOptions) {
  const skipAssets = opts?.skipAssets !== false; // default true
  const cacheControl = opts?.cacheControl || 'no-cache, no-store, must-revalidate';

  // Validate index.html exists at startup (fail-fast)
  if (!fs.existsSync(indexPath)) {
    console.warn(`[not-found] Warning: index.html not found at ${indexPath}`);
  }

  return (req: Request, res: Response, _next: NextFunction): void => {
    // API routes should have been caught by apiNotFound
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found', path: req.path });
      return;
    }

    // Don't serve index.html for asset requests — let them 404 naturally
    if (skipAssets && ASSET_RE.test(req.path)) {
      res.status(404).end();
      return;
    }

    res.set({
      'Cache-Control': cacheControl,
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.sendFile(indexPath);
  };
}

export { apiNotFound, spaFallback };
export type { ApiNotFoundOptions, SpaFallbackOptions };
