// ---------------------------------------------------------------------------
// API Versioning Middleware
// ---------------------------------------------------------------------------
// Rewrites /api/v1/* → /api/* so all existing routes, middleware, and rate
// limiters work without modification. The `req.apiVersion` property is set
// for downstream handlers that may want version-aware behavior in the future.
//
// Current: v1 is the only version. /api/* and /api/v1/* are equivalent.
// Future:  Mount a v2 router at /api/v2/* with breaking changes while v1
//          continues to work for existing clients.
//
// Usage (in server.js, BEFORE any /api middleware):
//   app.use(require('./middleware/api-version'));
// ---------------------------------------------------------------------------

const CURRENT_VERSION = 'v1';
const VERSION_PREFIX = `/api/${CURRENT_VERSION}`;

function apiVersionMiddleware(req, res, next) {
  if (req.url.startsWith(VERSION_PREFIX)) {
    // Rewrite /api/v1/tasks → /api/tasks
    req.url = '/api' + req.url.slice(VERSION_PREFIX.length);
    req.originalUrl = req.originalUrl.replace(VERSION_PREFIX, '/api');
    req.apiVersion = CURRENT_VERSION;
  } else if (req.url.startsWith('/api')) {
    // Unversioned /api/* defaults to current version
    req.apiVersion = CURRENT_VERSION;
  }

  // Set version header on all API responses
  if (req.apiVersion) {
    res.setHeader('X-API-Version', req.apiVersion);
  }

  next();
}

module.exports = apiVersionMiddleware;
module.exports.CURRENT_VERSION = CURRENT_VERSION;
