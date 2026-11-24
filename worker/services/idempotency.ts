import { canonical, sha256Hex } from "../../shared/ingest";
import { write } from "./db";
import { fail, ok, type Ctx, type Result } from "./types";

/**
 * Same key + same request = the stored response again (nothing is created twice).
 * Same key + different request = an explicit conflict. Only successful results are remembered.
 */
export async function withIdempotency<T>(ctx: Ctx, op: string, key: string | undefined, input: unknown, fn: () => Promise<Result<T>>): Promise<Result<T>> {
  if (!key) return fn();
  if (key.length > 200 || !/^[\w.:-]+$/.test(key)) return fail("invalid_input", "Idempotency-Key must be 1-200 characters of letters, digits, . : _ -");
  const hash = await sha256Hex(`${op}:${canonical(input)}`);
  const row = await ctx.db.prepare("SELECT request_hash, response FROM idempotency_keys WHERE scope = ? AND key = ?").bind(ctx.actor.id, key).first<{ request_hash: string; response: string }>();
  if (row) {
    if (row.request_hash !== hash) return fail("idempotency_conflict", "This Idempotency-Key was already used for a different request");
    const prior = JSON.parse(row.response) as { data: T };
    return ok(prior.data, { duplicate: true });
  }
  const result = await fn();
  if (result.ok) {
    await write(ctx.db, [ctx.db
      .prepare("INSERT OR IGNORE INTO idempotency_keys (scope, key, request_hash, response, created_at) VALUES (?,?,?,?,?)")
      .bind(ctx.actor.id, key, hash, JSON.stringify({ data: result.data }), ctx.now().toISOString())]);
  }
  return result;
}
