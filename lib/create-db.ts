import * as fs from 'fs';
import * as path from 'path';
import * as Module from 'module';

// ---------------------------------------------------------------------------
// Shared Database Factory — better-sqlite3
// ---------------------------------------------------------------------------

interface DatabaseConfig {
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
 * Resolve a peer dependency from the caller's context (not shared/).
 */
function requirePeer(name: string): unknown {
  // Walk up the call stack to find the calling module's directory
  const callerFile = new Error().stack?.split('\n').find(line =>
    (line.includes('.js') || line.includes('.ts')) && !line.includes('shared/lib/')
  );
  if (callerFile) {
    const match = callerFile.match(/\((.+\.(js|ts))/);
    if (match) {
      try {
        return require((Module as { createRequire?: (filename: string) => NodeRequire }).createRequire!(match[1]).resolve(name));
      } catch { /* fall through */ }
    }
  }
  // Fallback: try from each app's known node_modules
  const appDirs = ['arlos', 'feed', 'recharge-2026', 'chrishan.xyz'];
  for (const dir of appDirs) {
    try {
      return require(path.join(__dirname, '..', '..', dir, 'node_modules', name));
    } catch { /* fall through */ }
  }
  return require(name);
}

/**
 * Create a configured better-sqlite3 database instance.
 */
function createDatabase(options: DatabaseConfig): unknown {
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

  // Documented `as` assertion: better-sqlite3 is a peer dependency resolved at runtime,
  // so we can't statically type the constructor. The returned db object is typed by consumers.
  const Database = requirePeer('better-sqlite3') as new (path: string) => {
    pragma(sql: string): unknown;
  };
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

export { createDatabase };
export type { DatabaseConfig };
