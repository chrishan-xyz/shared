// ── create-server-static.ts — Static file serving + SPA fallback ─
// Serves hashed assets with immutable caching, other files uncached,
// and falls back to index.html for client-side routing.

import * as path from 'path';
import type { Application, Request, Response } from 'express';

/** Resolve peer dependencies from the calling app's node_modules. */
function requirePeer(mod: string): unknown {
  try { return require(mod); } catch {
    return require(require.resolve(mod, { paths: [process.cwd()] }));
  }
}

/**
 * Mount static file serving with SPA fallback.
 * - /assets/* → 1-year immutable cache (Vite hashed filenames)
 * - Other static → no-cache (HTML, manifest, etc.)
 * - GET * → index.html fallback for client-side routing
 */
export function mountStaticFiles(
  app: Application,
  staticDir: string,
  appName: string,
): void {
  const express = requirePeer('express') as typeof import('express');

  const assetsDir = path.join(staticDir, 'assets');
  app.use('/assets', express.static(assetsDir, { maxAge: '1y', immutable: true }));

  app.use(express.static(staticDir, {
    maxAge: 0,
    etag: false,
    setHeaders: (res: Response) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }));

  // SPA fallback
  const indexPath = path.join(staticDir, 'index.html');
  app.get('*', (_req: Request, res: Response) => {
    try {
      const fs = require('fs');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).json({ status: 'ok', message: `${appName} API — no frontend deployed yet` });
      }
    } catch {
      res.status(200).json({ status: 'ok', message: `${appName} API` });
    }
  });
}
