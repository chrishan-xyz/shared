// ---------------------------------------------------------------------------
// Shared Database Types — better-sqlite3 patterns
// ---------------------------------------------------------------------------
// Type declarations for lib/create-db.js and lib/migrate.js
// ---------------------------------------------------------------------------

import type Database from 'better-sqlite3';

// ── create-db.js ────────────────────────────────────────────────────────────

/** Configuration options for createDatabase() */
export interface DatabaseConfig {
  /** Full path to the .db file (required) */
  dbPath: string;
  /** Display name for logging (default: 'app') */
  dbName?: string;
  /** PRAGMA busy_timeout in ms (default: 10000) */
  busyTimeout?: number;
  /** PRAGMA cache_size in pages; negative = KB (default: -20000) */
  cacheSize?: number;
  /** PRAGMA foreign_keys (default: true) */
  foreignKeys?: boolean;
  /** PRAGMA journal_mode = WAL (default: true) */
  wal?: boolean;
  /** Optional logger called with dbName + path on init */
  logger?: ((message: string) => void) | null;
}

/**
 * Create a configured better-sqlite3 database instance with standard pragmas.
 * Uses requirePeer pattern to resolve better-sqlite3 from the calling app.
 */
export function createDatabase(options?: DatabaseConfig): Database.Database;

// ── migrate.js ──────────────────────────────────────────────────────────────

/** A migration file module — must export an `up` function */
export interface Migration {
  up(db: DatabaseLike): void;
}

/** Row from the _migrations tracking table */
export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

/** Configuration options for runMigrations() */
export interface MigrationConfig {
  /** Path to the migrations directory (required) */
  migrationsDir: string;
  /** Disable FK checks during migration (default: true) */
  disableForeignKeys?: boolean;
  /** Logger function; null to suppress output (default: console.log) */
  logger?: ((message: string) => void) | null;
}

/**
 * Minimal DB interface used by the migration runner.
 * Compatible with better-sqlite3's Database but doesn't require it directly.
 */
export interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  pragma(sql: string): unknown;
}

/** Ensure the _migrations tracking table exists */
export function ensureMigrationsTable(db: DatabaseLike): void;

/** Get list of already-applied migration filenames */
export function getAppliedMigrations(db: DatabaseLike): string[];

/** Get list of pending migration filenames from disk */
export function getPendingMigrations(migrationsDir: string, applied: string[]): string[];

/**
 * Run all pending migrations.
 * @returns Number of migrations applied
 */
export function runMigrations(db: DatabaseLike, options?: MigrationConfig): number;
