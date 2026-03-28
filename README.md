# @chrishan/shared

Shared infrastructure modules across all apps. Improve once → all apps benefit.

```
shared/
├── css/
│   └── tokens.css          # Design system tokens
├── lib/
│   ├── logger.js            # Structured logger
│   ├── create-auth.js       # Auth middleware factory
│   ├── create-server.js     # Express server factory
│   ├── create-db.js         # SQLite database factory
│   ├── migrate.js           # Migration runner
│   └── graceful-shutdown.js # Drain-and-exit (used internally by create-server)
└── package.json             # Own deps: bcryptjs, uuid
```

## Usage

Apps reference shared via relative path — no npm publish needed:

```js
// From an app at ~/workspace/feed/server.js
const { createServer } = require('../shared/lib/create-server');
```

In Docker, shared is copied to `/_shared/` and referenced accordingly.

---

## Modules

### `css/tokens.css`

Single source of truth for the design system. Defines CSS custom properties for typography, spacing, radius, motion, and theme colors.

**Themes:** Dark (default) and Light. Apps set `data-theme="light"` on `<html>` for the cream/warm palette (Recharge).

**Per-app customization:** Each app overrides `--accent` and optionally other colors. The token *names* are shared; the *values* differ per theme.

| Token | Dark (ArlOS/Feed/Home) | Light (Recharge) |
|-------|----------------------|------------------|
| `--bg-base` | `#0A0A0A` | `#FDF6EC` |
| `--bg-surface` | `#141414` | `#F7F0E4` |
| `--bg-elevated` | `#1A1A1A` | `#FFFFFF` |
| `--text-primary` | `#F5F5F5` | `#2C2420` |
| `--text-secondary` | `#A0A0A0` | `#6B5E54` |
| `--border-default` | `#2A2A2A` | `#E8DDD0` |

**Import:**
```css
/* In app's index.css */
@import url('./styles/tokens.css');  /* Local copy synced from shared */
```

**Used by:** ArlOS, Feed, Recharge, chrishan.xyz

---

### `lib/logger.js`

Structured logger with level filtering and consistent format.

**Import:**
```js
// Pattern 1 — direct call
const log = require('../../shared/lib/logger')('startup');

// Pattern 2 — named export
const { createLogger } = require('../../shared/lib/logger');
const log = createLogger('startup');
```

**API:**
```js
log.info('Server ready', { port: 8080 });
log.warn('Slow query', { ms: 500 });
log.error('Failed', err);           // Error objects → message extracted
log.debug('Trace', data);           // Only shown when LOG_LEVEL=debug
```

**Output format:**
```
2026-03-28T01:30:00.000Z [startup] INFO Server ready {"port":8080}
```

**Env:** `LOG_LEVEL` — `debug | info (default) | warn | error`

**Used by:** ArlOS, Feed, Recharge (via local `lib/logger.js` wrappers that re-export)

---

### `lib/create-auth.js`

Auth middleware factory. Bcrypt password hashing, timing-safe API key comparison, pluggable session stores.

**Import:**
```js
const { createAuth } = require('../../shared/lib/create-auth');

const auth = createAuth({
  cookieName: 'session',
  passwordEnvVar: 'APP_PASSWORD',
  apiKeyHeader: 'x-arlo-api-key',
  apiKeyEnvVar: 'ARLOS_API_KEY',
  sessionStore: 'sqlite',        // or 'memory' (default)
  getDb: () => db,               // required when sessionStore='sqlite'
  skipPaths: ['/api/auth', '/api/health'],
  bcryptRounds: 12,
});
```

**Returns:**
| Method | Purpose |
|--------|---------|
| `auth.requireAuth` | Express middleware — checks session cookie or API key |
| `auth.login` | Route handler — `POST /login` with bcrypt comparison |
| `auth.logout` | Route handler — destroy session + clear cookie |
| `auth.status` | Route handler — `GET /status` check |
| `auth.authRoutes(router?)` | Mount all 3 routes on a router |
| `auth.safeCompareApiKey(key)` | Timing-safe HMAC comparison |
| `auth.validateSession(id)` | Check session validity + touch |
| `auth.createSession()` | Create new session, returns ID |

**Config defaults:**
- Session TTL: 24h absolute, 4h idle
- Max sessions: 100 (LRU eviction)
- Cleanup: every 15 min
- Cookie: httpOnly, signed, secure in production, sameSite=strict

**Used by:** ArlOS (SQLite sessions), Feed (memory sessions), Recharge (memory sessions)

---

### `lib/create-server.js`

Express server factory. One call gives you the full middleware stack.

**Import:**
```js
const { createServer } = require('../shared/lib/create-server');

const app = createServer({
  appName: 'feed',
  port: process.env.PORT || 8080,
  staticDir: path.join(__dirname, 'public'),
  routes: (app) => {
    app.use('/api/feed', feedRoutes);
  },
  beforeRoutes: (app) => { /* pre-route middleware */ },
  afterRoutes: (app) => { /* error handlers */ },
  onHealthCheck: () => ({ db_ok: true }),
  onShutdown: () => { db.close(); },
  logger: log,
});

app.start();  // Returns Promise<http.Server>
```

**Included automatically:**
- gzip compression (level 6, 1KB threshold, skips binary)
- `cookie-parser` with signing
- `express.json()` body parsing
- EPIPE/ECONNRESET socket protection
- `GET /api/health` endpoint
- SPA fallback (serves `index.html` for non-API routes)
- Hashed asset caching (`/assets/*` → 1 year immutable)
- Global error handler (500 with stack in dev)
- Graceful shutdown on SIGTERM/SIGINT
- Process-level uncaughtException/unhandledRejection catchers

**Config:**

| Option | Default | Notes |
|--------|---------|-------|
| `appName` | required | Used in logs + health endpoint |
| `port` | `8080` | |
| `staticDir` | — | Path to built frontend |
| `compression` | `true` | Set `false` to disable |
| `cookieSecret` | `$COOKIE_SECRET` | For signed cookies |
| `bodyLimit` | `'1mb'` | JSON body max size |
| `shutdownTimeoutMs` | `10000` | Force-kill after this |
| `corsOrigins` | — | Array of allowed origins |

**Peer deps** (resolved from the app's `node_modules`): `express`, `cookie-parser`, `compression` (optional)

**Used by:** Feed, chrishan.xyz (Home)

---

### `lib/create-db.js`

SQLite database factory using better-sqlite3 with standard pragmas.

**Import:**
```js
const { createDatabase } = require('../shared/lib/create-db');

const db = createDatabase({
  dbPath: path.join(__dirname, 'data', 'feed.db'),
  dbName: 'feed',
  logger: (msg) => log.info(msg),
});
```

**Standard pragmas applied:**
- `journal_mode = WAL`
- `busy_timeout = 10000` (10s)
- `synchronous = NORMAL`
- `cache_size = -20000` (~20MB)
- `foreign_keys = ON`

**Config:**

| Option | Default | Notes |
|--------|---------|-------|
| `dbPath` | required | Full path to `.db` file |
| `dbName` | `'app'` | Display name for logging |
| `busyTimeout` | `10000` | ms |
| `cacheSize` | `-20000` | Negative = KB |
| `foreignKeys` | `true` | |
| `wal` | `true` | |

**Peer dep:** `better-sqlite3` (resolved from the app)

**Used by:** Feed

---

### `lib/migrate.js`

Migration runner for better-sqlite3 databases. Runs numbered `.js` files from a directory.

**Import:**
```js
const { runMigrations } = require('../shared/lib/migrate');

runMigrations(db, {
  migrationsDir: path.join(__dirname, 'migrations'),
  logger: (msg) => log.info(msg),
});
```

**Migration file format:**
```js
// migrations/001_create_users.js
exports.up = function(db) {
  db.exec(`CREATE TABLE users (...)`);
};
```

**Naming:** `NNN_description.js` — files must match `/^\d{3}[a-z]?_/` and are sorted alphabetically.

**Tracking:** Creates `_migrations` table automatically. Each migration runs once — tracked by filename.

**Behavior:**
- Disables `foreign_keys` during migration (re-enables after)
- Stops on first error (no partial runs)
- Returns count of applied migrations

**Exports:** `runMigrations`, `ensureMigrationsTable`, `getAppliedMigrations`, `getPendingMigrations`

**Used by:** Feed

---

### `lib/graceful-shutdown.js`

Drain connections and exit cleanly on SIGTERM/SIGINT. Used internally by `create-server.js` — you typically don't import this directly.

**API:**
```js
const { setupGracefulShutdown } = require('./graceful-shutdown');

setupGracefulShutdown(server, {
  timeoutMs: 10000,
  log: logger,
  onShutdown: async () => { db.close(); },
});
```

**Behavior:**
1. Stop accepting new connections
2. Wait for in-flight requests to drain (up to `timeoutMs`)
3. Run `onShutdown` callback
4. `process.exit(0)` (or `1` on timeout)

---

## Adding a New App

1. Import shared modules via relative path: `require('../shared/lib/...')`
2. Copy `tokens.css` to your client's styles directory (or use `sync-tokens.sh`)
3. In Dockerfile, copy shared into the container:
   ```dockerfile
   COPY _shared/ /_shared/
   ENV NODE_PATH=/app/node_modules
   ```
4. Peer deps (`express`, `better-sqlite3`, etc.) must be in your app's `package.json`

## Scripts

| Script | Purpose |
|--------|---------|
| `sync-tokens.sh` | Copy `tokens.css` to all app client directories |
| `sync-middleware.sh` | Sync middleware to apps (legacy — being replaced by direct imports) |
| `check-drift.sh` | Detect when local copies drift from shared source |
