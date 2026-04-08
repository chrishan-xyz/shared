// ── create-server-middleware.ts — Core middleware setup ───────────
// Compression, CORS, cookie parsing, JSON body, socket protection.

import type { Application, Request, Response, NextFunction } from 'express';
import type { Socket } from 'net';
import type { Logger } from './create-server-types';

// Resolve peer dependencies from the calling app's node_modules.
function requirePeer(mod: string): unknown {
  try { return require(mod); } catch {
    return require(require.resolve(mod, { paths: [process.cwd()] }));
  }
}

export { requirePeer };

type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;

/** Set up compression middleware if enabled and available. */
export function setupCompression(app: Application): void {
  try {
    const compressionMw = requirePeer('compression') as Function & { filter: (req: Request, res: Response) => boolean };
    app.use(compressionMw({
      level: 6,
      threshold: 1024,
      filter: (req: Request, res: Response) => {
        const ct = (res.getHeader('Content-Type') || '') as string;
        if (/image|video|audio|font/.test(ct)) return false;
        return compressionMw.filter(req, res);
      },
    }));
  } catch {
    // compression not installed — skip silently
  }
}

/** Set up cookie parser and JSON body parsing. */
export function setupCoreParsing(
  app: Application,
  cookieSecret?: string,
  bodyLimit: string | number = '1mb',
): void {
  const express = requirePeer('express') as typeof import('express');
  const cookieParser = requirePeer('cookie-parser') as (secret?: string) => RequestHandler;
  app.use(cookieParser(cookieSecret));
  app.use(express.json({ limit: bodyLimit }));
}

/** Set up simple CORS middleware for allowed origins. */
export function setupCors(app: Application, corsOrigins: string[]): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-arlo-api-key');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

/** Guard sockets against EPIPE/ECONNRESET noise. */
export function setupSocketProtection(app: Application, log: Logger): void {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sock = req.socket as Socket & { __epipeGuarded?: boolean };
    if (sock && !sock.__epipeGuarded) {
      sock.__epipeGuarded = true;
      sock.on('error', (err: NodeJS.ErrnoException) => {
        if (['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(err.code || '')) return;
        log.error(`Socket error: ${err.code || err.message}`);
      });
    }
    next();
  });
}
