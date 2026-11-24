/**
 * The only way the service layer changes data. It opens the write gate (migration 0004) for the duration of the batch.
 * A D1 batch is one transaction, so the gate is never visible open to any other connection, and a failed batch rolls the gate back shut.
 * Returns the results of the caller's statements only (not the two gate statements).
 */
export async function write(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const out = await db.batch([db.prepare("UPDATE write_gate SET open = 1 WHERE id = 1"), ...stmts, db.prepare("UPDATE write_gate SET open = 0 WHERE id = 1")]);
  return out.slice(1, -1);
}

export const changes = (r: D1Result | undefined): number => r?.meta?.changes ?? 0;
