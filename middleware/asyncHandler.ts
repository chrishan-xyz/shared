import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandlerFn = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Wraps route handlers to catch sync and async errors, forwarding them to next().
 * Usage: router.get('/', wrap(async (req, res) => { ... }))
 */
const wrap = (fn: AsyncHandlerFn): RequestHandler => (req: Request, res: Response, next: NextFunction): void => {
  try {
    const result = fn(req, res, next);
    // Handle async functions too
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(next);
    }
  } catch (err) {
    next(err);
  }
};

export = wrap;
