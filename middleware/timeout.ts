import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// timeout.ts — Request timeout middleware
// ---------------------------------------------------------------------------
// Kills slow requests after a configurable duration. Prevents hung connections
// from blocking the server. Excludes SSE/streaming endpoints.
// ---------------------------------------------------------------------------

interface TimeoutConfig {
  /** Timeout in milliseconds (default: 30000) */
  ms?: number;
  /** URL prefixes to skip (e.g. SSE endpoints) */
  exclude?: string[];
}

/**
 * Creates a request timeout middleware.
 */
function requestTimeout({ ms = 30000, exclude = [] }: TimeoutConfig = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip excluded paths (SSE, streaming, long-poll)
    for (const prefix of exclude) {
      if (req.originalUrl.startsWith(prefix)) {
        next();
        return;
      }
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          error: 'GATEWAY_TIMEOUT',
          message: `Request timed out after ${ms}ms`,
          path: req.originalUrl
        });
      }
    }, ms);

    // Clear timeout when response finishes (success or error)
    res.on('close', () => clearTimeout(timer));
    res.on('finish', () => clearTimeout(timer));

    next();
  };
}

export { requestTimeout };
export type { TimeoutConfig };
