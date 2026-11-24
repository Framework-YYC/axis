import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal D1Database look-alike over node:sqlite so the real service code runs unchanged in tests. */
class Stmt {
  constructor(private db: DatabaseSync, readonly sql: string, private args: SQLInputValue[] = []) {}
  bind(...a: unknown[]) { return new Stmt(this.db, this.sql, a as SQLInputValue[]); }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.args) as T | undefined) ?? null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.args) as T[], success: true }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
}

export function makeDb() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) raw.exec(readFileSync(join(dir, f), "utf8"));
  // Real D1 applies one batch at a time; the in-memory shim has a single connection, so it queues them the same way.
  let queue: Promise<unknown> = Promise.resolve();
  const db = {
    prepare: (sql: string) => new Stmt(raw, sql),
    batch(stmts: Stmt[]) {
      const job = queue.then(async () => {
        raw.exec("BEGIN");
        try { const out = []; for (const s of stmts) out.push(await s.run()); raw.exec("COMMIT"); return out; }
        catch (e) { raw.exec("ROLLBACK"); throw e; }
      });
      queue = job.catch(() => undefined);
      return job;
    },
  } as unknown as D1Database;
  return { db, raw };
}
