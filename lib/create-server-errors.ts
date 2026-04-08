// ── create-server-errors.ts — Error handling ─────────────────────
// Global Express error handler + process-level crash catchers.

import type { Request, Response, NextFunction, Application } from 'express';
import type { Logger } from './create-server-types';

/** Mount global Express error handler (must be added after all routes). */
export function mountErrorHandler(app: Application, log: Logger): void {
  app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
    const msg = err.message || 'Internal server error';
    log.error(`${req.method} ${req.path}: ${msg}`);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: 'Internal server error',
        detail: process.env.NODE_ENV === 'production' ? undefined : msg,
      });
    }
  });
}

/** Attach process-level error catchers to prevent unhandled crashes. */
export function setupProcessCatchers(log: Logger): void {
  process.on('uncaughtException', (err: Error) => {
    log.error(`Uncaught exception: ${err.message}`);
    if (err.stack) log.error(err.stack.split('\n').slice(0, 5).join('\n'));
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    log.error(`Unhandled rejection: ${msg}`);
  });
}
