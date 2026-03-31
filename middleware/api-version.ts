import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// API Versioning Middleware
// ---------------------------------------------------------------------------

const CURRENT_VERSION = 'v1';
const VERSION_PREFIX = `/api/${CURRENT_VERSION}`;

interface VersionedRequest extends Request {
  apiVersion?: string;
}

function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const vReq = req as VersionedRequest;

  if (req.url.startsWith(VERSION_PREFIX)) {
    // Rewrite /api/v1/tasks → /api/tasks
    req.url = '/api' + req.url.slice(VERSION_PREFIX.length);
    req.originalUrl = req.originalUrl.replace(VERSION_PREFIX, '/api');
    vReq.apiVersion = CURRENT_VERSION;
  } else if (req.url.startsWith('/api')) {
    // Unversioned /api/* defaults to current version
    vReq.apiVersion = CURRENT_VERSION;
  }

  // Set version header on all API responses
  if (vReq.apiVersion) {
    res.setHeader('X-API-Version', vReq.apiVersion);
  }

  next();
}

// Dual export: default function + named constant
// Documented `as` assertion: Express types need the middleware signature to match exactly.
// The cast to `RequestHandler & { CURRENT_VERSION: string }` preserves the CommonJS
// pattern `module.exports = fn; module.exports.CURRENT_VERSION = ...`
const exportedMiddleware = apiVersionMiddleware as RequestHandler & { CURRENT_VERSION: string };
exportedMiddleware.CURRENT_VERSION = CURRENT_VERSION;

export = exportedMiddleware;
