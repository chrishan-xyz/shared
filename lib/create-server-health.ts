// ── create-server-health.ts — Health endpoint factory ────────────
// Mounts GET /api/health with system metrics, git SHA, and optional extras.

import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import type { Application, Request, Response } from 'express';

/**
 * Mount the standard /api/health endpoint on the given Express app.
 */
export function mountHealthCheck(
  app: Application,
  appName: string,
  onHealthCheck?: () => Record<string, unknown>,
): void {
  // Cache git SHA and package version at startup
  let gitSha = process.env.GIT_SHA || 'unknown';
  if (gitSha === 'unknown') {
    try {
      gitSha = execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
      // Not in a git repo or git not available
    }
  }

  let pkgVersion = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };
    pkgVersion = pkg.version || '0.0.0';
  } catch {
    // package.json not found
  }

  app.get('/api/health', (_req: Request, res: Response) => {
    const extra = onHealthCheck ? onHealthCheck() : {};
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      app: appName,
      sha: gitSha,
      uptime_seconds: Math.floor(process.uptime()),
      version: { commit: gitSha, node: process.version, package: pkgVersion },
      timestamp: new Date().toISOString(),
      memory: {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      system: {
        platform: process.platform,
        cpus: os.cpus().length,
        load_avg: os.loadavg().map((l: number) => Math.round(l * 100) / 100),
        free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      },
      ...extra,
    });
  });
}
