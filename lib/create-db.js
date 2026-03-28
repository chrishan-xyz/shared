// ---------------------------------------------------------------------------
// Shared Database Factory — better-sqlite3
// ---------------------------------------------------------------------------
// Creates and configures a better-sqlite3 database with standard pragmas.
// Uses requirePeer pattern to resolve better-sqlite3 from the calling app.
// Usage: const db = createDatabase({ dbPath, dbName: 'myapp' });
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const Module = require('module');

/**
 * Resolve a peer dependency from the caller's context (not shared/).
 */
function requirePeer(name) {
  // Walk up the call stack to find the calling module's directory
  const callerFile = new Error().stack.split('\n').find(line =>
    line.includes('.js') && !line.includes('shared/lib/')
  );
  if (callerFile) {
    const match = callerFile.match(/\((.+\.js)/);
    if (match) {
      try {
        return require(Module.createRequire(match[1]).resolve(name));
      } catch {}
    }
  }
  // Fallback: try from each app's known node_modules
  const appDirs = ['arlos', 'feed', 'recharge-2026', 'chrishan.xyz'];
  for (const dir of appDirs) {
    try {
      return require(path.join(__dirname, '..', '..', dir, 'node_modules', name));
    } catch {}
  }
  return require(name);
}

/**
 * Create a configured better-sqlite3 database instance.
 * @param {Object} options
 * @param {string} options.dbPath - Full path to the .db file
 * @param {string} [options.dbName='app'] - Display name for logging
 * @param {number} [options.busyTimeout=10000] - PRAGMA busy_timeout (ms)
 * @param {number} [options.cacheSize=-20000] - PRAGMA cache_size (pages, negative = KB)
 * @param {boolean} [options.foreignKeys=true] - PRAGMA foreign_keys
 * @param {boolean} [options.wal=true] - PRAGMA journal_mode = WAL
 * @param {Function} [options.logger] - Optional logger (called with dbName + path)
 * @returns {import('better-sqlite3').Database}
 */
function createDatabase(options = {}) {
  const {
    dbPath,
    dbName = 'app',
    busyTimeout = 10000,
    cacheSize = -20000,
    foreignKeys = true,
    wal = true,
    logger = null,
  } = options;

  if (!dbPath) throw new Error('createDatabase: dbPath is required');

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const Database = requirePeer('better-sqlite3');
  const db = new Database(dbPath);

  // Standard pragmas
  if (wal) db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${busyTimeout}`);
  db.pragma('synchronous = NORMAL');
  db.pragma(`cache_size = ${cacheSize}`);
  if (foreignKeys) db.pragma('foreign_keys = ON');

  if (logger) {
    logger(`${dbName} DB initialized at ${dbPath}`);
  }

  return db;
}

module.exports = { createDatabase };
