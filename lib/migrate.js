// ---------------------------------------------------------------------------
// Shared Migration Runner — better-sqlite3
// ---------------------------------------------------------------------------
// Runs numbered .js migration files from a directory.
// Each migration exports: { up(db) }
// The db argument is a better-sqlite3 Database instance (or proxy with
// prepare/exec/pragma methods).
//
// Usage:
//   const { runMigrations } = require('@chrishan/shared/lib/migrate');
//   runMigrations(db, { migrationsDir: path.join(__dirname, 'migrations') });
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

/**
 * Ensure the _migrations tracking table exists.
 * @param {Object} db - Database instance with exec() method
 */
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Get list of already-applied migration filenames.
 * @param {Object} db - Database instance with prepare() method
 * @returns {string[]}
 */
function getAppliedMigrations(db) {
  try {
    return db.prepare('SELECT name FROM _migrations ORDER BY id').all().map(r => r.name);
  } catch {
    return [];
  }
}

/**
 * Get list of pending migration filenames from disk.
 * @param {string} migrationsDir - Path to migrations directory
 * @param {string[]} applied - Already-applied migration names
 * @returns {string[]}
 */
function getPendingMigrations(migrationsDir, applied) {
  if (!fs.existsSync(migrationsDir)) return [];

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') && /^\d{3}[a-z]?_/.test(f))
    .sort();

  return files.filter(f => !applied.includes(f));
}

/**
 * Run all pending migrations.
 * @param {Object} db - Database instance (better-sqlite3 or proxy)
 * @param {Object} [options]
 * @param {string} options.migrationsDir - Path to migrations directory
 * @param {boolean} [options.disableForeignKeys=true] - Disable FK during migrations
 * @param {Function} [options.logger=console.log] - Logger function
 * @returns {number} Number of migrations applied
 */
function runMigrations(db, options = {}) {
  const {
    migrationsDir,
    disableForeignKeys = true,
    logger = console.log,
  } = options;

  if (!migrationsDir) throw new Error('runMigrations: migrationsDir is required');

  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);
  const pending = getPendingMigrations(migrationsDir, applied);

  if (pending.length === 0) return 0;

  // Disable FK checks during migrations — seed data may not exist yet
  if (disableForeignKeys) {
    db.exec('PRAGMA foreign_keys = OFF');
  }

  let count = 0;
  for (const file of pending) {
    const migration = require(path.join(migrationsDir, file));
    try {
      if (typeof migration.up === 'function') {
        migration.up(db);
      }
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      if (logger) logger(`  ✅ Migration: ${file}`);
      count++;
    } catch (e) {
      if (logger) logger(`  ❌ Migration failed: ${file} — ${e.message}`);
      throw e;
    }
  }

  // Re-enable FK checks
  if (disableForeignKeys) {
    db.exec('PRAGMA foreign_keys = ON');
  }

  if (count > 0 && logger) {
    logger(`Applied ${count} migration(s)`);
  }
  return count;
}

module.exports = { runMigrations, ensureMigrationsTable, getAppliedMigrations, getPendingMigrations };
