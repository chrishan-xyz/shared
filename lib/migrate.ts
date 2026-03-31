import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Shared Migration Runner — better-sqlite3
// ---------------------------------------------------------------------------

interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  pragma(sql: string): unknown;
}

interface Migration {
  up(db: DatabaseLike): void;
}

interface MigrationConfig {
  /** Path to the migrations directory (required) */
  migrationsDir: string;
  /** Disable FK checks during migration (default: true) */
  disableForeignKeys?: boolean;
  /** Logger function; null to suppress output (default: console.log) */
  logger?: ((message: string) => void) | null;
}

/**
 * Ensure the _migrations tracking table exists.
 */
function ensureMigrationsTable(db: DatabaseLike): void {
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
 */
function getAppliedMigrations(db: DatabaseLike): string[] {
  try {
    return (db.prepare('SELECT name FROM _migrations ORDER BY id').all() as Array<{ name: string }>).map(r => r.name);
  } catch {
    return [];
  }
}

/**
 * Get list of pending migration filenames from disk.
 */
function getPendingMigrations(migrationsDir: string, applied: string[]): string[] {
  if (!fs.existsSync(migrationsDir)) return [];

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') && /^\d{3}[a-z]?_/.test(f))
    .sort();

  return files.filter(f => !applied.includes(f));
}

/**
 * Run all pending migrations.
 * @returns Number of migrations applied
 */
function runMigrations(db: DatabaseLike, options: MigrationConfig): number {
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
    const migration: Migration = require(path.join(migrationsDir, file));
    try {
      if (typeof migration.up === 'function') {
        migration.up(db);
      }
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      if (logger) logger(`  ✅ Migration: ${file}`);
      count++;
    } catch (e) {
      if (logger) logger(`  ❌ Migration failed: ${file} — ${(e as Error).message}`);
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

export { runMigrations, ensureMigrationsTable, getAppliedMigrations, getPendingMigrations };
export type { DatabaseLike, Migration, MigrationConfig };
