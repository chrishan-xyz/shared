import type { SessionStore, SessionData, InternalSessionEntry, SqliteStatements, DatabaseLike } from './auth-types';

// ---------------------------------------------------------------------------
// Memory Session Store
// ---------------------------------------------------------------------------
export function createMemoryStore(): SessionStore {
  const sessions = new Map<string, InternalSessionEntry>();

  return {
    get(id: string): SessionData | null {
      const s: InternalSessionEntry | undefined = sessions.get(id);
      if (!s) return null;
      return { id, created_at: s.created, last_access: s.lastAccess };
    },
    set(id: string, data: SessionData): void {
      sessions.set(id, { created: data.created_at, lastAccess: data.last_access });
    },
    touch(id: string, now: string): void {
      const s: InternalSessionEntry | undefined = sessions.get(id);
      if (s) s.lastAccess = now;
    },
    delete(id: string): void { sessions.delete(id); },
    count(): number { return sessions.size; },
    evictOldest(): void {
      let oldestId: string | null = null;
      let oldestTime: number = Infinity;
      for (const [id, s] of sessions.entries()) {
        const t: number = new Date(s.lastAccess || s.created).getTime();
        if (t < oldestTime) { oldestTime = t; oldestId = id; }
      }
      if (oldestId) sessions.delete(oldestId);
    },
    cleanup(idleThreshold: number): void {
      for (const [id, s] of sessions.entries()) {
        const lastAccess: number = new Date(s.lastAccess || s.created).getTime();
        if (lastAccess < idleThreshold) sessions.delete(id);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// SQLite Session Store
// ---------------------------------------------------------------------------
export function createSqliteStore(getDb: () => DatabaseLike): SessionStore {
  let _stmts: SqliteStatements | null = null;

  function stmts(): SqliteStatements {
    if (!_stmts) {
      const d: DatabaseLike = getDb();
      _stmts = {
        get: d.prepare('SELECT * FROM sessions WHERE id = ?') as SqliteStatements['get'],
        insert: d.prepare('INSERT INTO sessions (id, created_at, last_access, expires_at) VALUES (?, ?, ?, ?)') as SqliteStatements['insert'],
        touch: d.prepare('UPDATE sessions SET last_access = ? WHERE id = ?') as SqliteStatements['touch'],
        delete: d.prepare('DELETE FROM sessions WHERE id = ?') as SqliteStatements['delete'],
        cleanup: d.prepare("DELETE FROM sessions WHERE expires_at < datetime('now') OR last_access < ?") as SqliteStatements['cleanup'],
        count: d.prepare('SELECT COUNT(*) as c FROM sessions') as SqliteStatements['count'],
        oldest: d.prepare('SELECT id FROM sessions ORDER BY last_access ASC LIMIT 1') as SqliteStatements['oldest'],
      };
    }
    return _stmts;
  }

  return {
    get(id: string): SessionData | null {
      try { return (stmts().get.get(id) as SessionData) || null; }
      catch { return null; }
    },
    set(id: string, data: SessionData): void {
      try { stmts().insert.run(id, data.created_at, data.last_access, data.expires_at || ''); }
      catch { /* ignore dupes */ }
    },
    touch(id: string, now: string): void {
      try { stmts().touch.run(now, id); }
      catch { /* ignore */ }
    },
    delete(id: string): void {
      try { stmts().delete.run(id); }
      catch { /* ignore */ }
    },
    count(): number {
      try { return stmts().count.get().c; }
      catch { return 0; }
    },
    evictOldest(): void {
      try {
        const oldest: { id: string } | undefined = stmts().oldest.get();
        if (oldest) stmts().delete.run(oldest.id);
      } catch { /* ignore */ }
    },
    cleanup(idleThreshold: number): void {
      try { stmts().cleanup.run(new Date(idleThreshold).toISOString()); }
      catch { /* ignore */ }
    },
  };
}
