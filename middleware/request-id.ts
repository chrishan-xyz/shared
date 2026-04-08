/**
 * Request ID middleware — cross-service correlation.
 *
 * Accepts incoming `X-Request-Id` header (for tracing across services),
 * or generates a new short UUID via `crypto.randomUUID()`.
 *
 * Sets `req._requestId` and `X-Request-Id` response header.
 *
 * Usage:
 *   import { requestId } from './middleware/request-id';
 *   app.use(requestId());
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      _requestId?: string;
    }
  }
}

export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Accept incoming X-Request-Id for cross-service correlation (truncate to prevent abuse)
    const id = (req.headers['x-request-id'] as string)?.slice(0, 64)
      || crypto.randomUUID().slice(0, 8);

    req._requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}
