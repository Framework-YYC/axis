import type { Ctx } from "./types";

type Outcome = "success" | "denied" | "failure" | "approval_required";

/** Builds an audit statement so it can join the same atomic batch as the change it describes. No content is recorded. */
export function auditStmt(ctx: Ctx, action: string, entity: string, entityId: string | null, outcome: Outcome = "success") {
  return ctx.db
    .prepare(
      "INSERT INTO audit_log (at, actor_type, actor_id, actor_label, channel, action, entity, entity_id, outcome, request_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(ctx.now().toISOString(), ctx.actor.type, ctx.actor.id, ctx.actor.label, ctx.actor.channel, action, entity, entityId, outcome, ctx.requestId);
}

export async function audit(ctx: Ctx, action: string, entity: string, entityId: string | null, outcome: Outcome): Promise<void> {
  try {
    await auditStmt(ctx, action, entity, entityId, outcome).run();
  } catch {
    console.error(JSON.stringify({ event: "audit_write_failed", action }));
  }
}
