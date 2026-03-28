# Shared Middleware — Single Source of Truth

These files are the **canonical versions** of middleware shared across ArlOS and Recharge.

## How it works

1. **Edit here** — all shared middleware changes go in this directory
2. **Run sync** — `bash shared/sync-middleware.sh` copies to both projects
3. **Deploy gates catch drift** — `shared/check-drift.sh` runs in deploy pipelines

## Shared files (project-agnostic)

| File | Purpose |
|------|---------|
| `rate-limit.js` | Sliding window rate limiter, zero dependencies |
| `api-version.js` | URL rewrite for `/api/v1/` versioning |
| `error-logger.js` | Structured JSON error logging with rotation |
| `security.js` | CSRF, secure headers, CORS factory |
| `graceful-shutdown.js` | SIGTERM/SIGINT drain + cleanup |
| `asyncHandler.js` | Express async error wrapper |

## NOT shared (project-specific)

| File | Why |
|------|-----|
| `auth.js` | Different cookie names, share mode (Recharge), route patterns |
| `validate.js` | Different domain validators (dates for Recharge, tasks for ArlOS) |
| `etag.js` | Recharge only |
| `pii-guard.js` | Recharge only |
