import { write } from "./db";
import type { Ctx } from "./types";

type Outcome = "success" | "denied" | "failure" | "approval_required";

/** The audit table predates the inbox channel, so applied assistant requests are recorded as channel 'system' with via = 'inbox'. */
const auditChannel = (c: Ctx["actor"]["channel"]) => (c === "inbox" ? "system" : c);

/** Builds an audit statement so it can join the same atomic batch as the change it describes. No content is recorded. */
export function auditStmt(ctx: Ctx, action: string, entity: string, entityId: string | null, outcome: Outcome = "success") {
  return ctx.db
    .prepare(
      "INSERT INTO audit_log (at, actor_type, actor_id, actor_label, channel, action, entity, entity_id, outcome, request_id, via) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(ctx.now().toISOString(), ctx.actor.type, ctx.actor.id, ctx.actor.label, auditChannel(ctx.actor.channel), action, entity, entityId, outcome, ctx.requestId, ctx.actor.channel === "inbox" ? "inbox" : null);
}

export async function audit(ctx: Ctx, action: string, entity: string, entityId: string | null, outcome: Outcome): Promise<void> {
  try {
    await write(ctx.db, [auditStmt(ctx, action, entity, entityId, outcome)]);
  } catch {
    console.error(JSON.stringify({ event: "audit_write_failed", action }));
  }
}
