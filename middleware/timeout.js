// ---------------------------------------------------------------------------
// timeout.js — Request timeout middleware
// ---------------------------------------------------------------------------
// Kills slow requests after a configurable duration. Prevents hung connections
// from blocking the server. Excludes SSE/streaming endpoints.
// ---------------------------------------------------------------------------

/**
 * Creates a request timeout middleware.
 * @param {object} opts
 * @param {number} [opts.ms=30000] - Timeout in milliseconds
 * @param {string[]} [opts.exclude=[]] - URL prefixes to skip (e.g. SSE endpoints)
 * @returns {Function} Express middleware
 */
function requestTimeout({ ms = 30000, exclude = [] } = {}) {
  return (req, res, next) => {
    // Skip excluded paths (SSE, streaming, long-poll)
    for (const prefix of exclude) {
      if (req.originalUrl.startsWith(prefix)) return next();
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

module.exports = { requestTimeout };
