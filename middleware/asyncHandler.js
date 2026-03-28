// Wraps route handlers to catch sync and async errors
// Usage: router.get('/', wrap((req, res) => { ... }))
const wrap = (fn) => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    // Handle async functions too
    if (result && typeof result.catch === 'function') {
      result.catch(next);
    }
  } catch (err) {
    next(err);
  }
};

module.exports = wrap;
