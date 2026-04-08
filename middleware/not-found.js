"use strict";
// ---------------------------------------------------------------------------
// Shared 404 / SPA Fallback Middleware
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.spaFallback = exports.apiNotFound = void 0;
const fs = require("fs");
// Static asset extensions — don't serve index.html for these
const ASSET_RE = /\.(js|css|map|woff2?|ico|png|jpe?g|gif|svg|webp|mp4|webm|json|txt|xml)$/i;
/**
 * Returns JSON 404 for any unmatched API route.
 *
 * Mount on `/api` after all API routers:
 *   app.use('/api', apiNotFound());
 */
function apiNotFound(opts) {
    const extra = (opts === null || opts === void 0 ? void 0 : opts.extra) || {};
    return (req, res, _next) => {
        res.status(404).json({ error: 'Not found', path: req.originalUrl || req.path, ...extra });
    };
}
exports.apiNotFound = apiNotFound;
/**
 * SPA catch-all: serves index.html for non-API, non-asset GET requests.
 *
 * Mount as the LAST `app.get('*', ...)` handler:
 *   app.get('*', spaFallback('/abs/path/to/index.html'));
 */
function spaFallback(indexPath, opts) {
    const skipAssets = (opts === null || opts === void 0 ? void 0 : opts.skipAssets) !== false; // default true
    const cacheControl = (opts === null || opts === void 0 ? void 0 : opts.cacheControl) || 'no-cache, no-store, must-revalidate';
    // Validate index.html exists at startup (fail-fast)
    if (!fs.existsSync(indexPath)) {
        console.warn(`[not-found] Warning: index.html not found at ${indexPath}`);
    }
    return (req, res, _next) => {
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
exports.spaFallback = spaFallback;
