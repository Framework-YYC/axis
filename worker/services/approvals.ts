import { audit, auditStmt } from "./audit";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

const EXPIRY_MS = 7 * 86_400_000;

/** An integration asked for something bulk or destructive. Nothing happens until the owner approves it in the web app. */
export async function requestApproval(ctx: Ctx, action: string, summary: string, payload: unknown): Promise<Result<never>> {
  const id = `apr_${crypto.randomUUID()}`;
  await ctx.db.batch([
    ctx.db
      .prepare("INSERT INTO pending_approvals (id, action, summary, payload, requested_by_id, requested_by_label, channel, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, action, summary, JSON.stringify(payload), ctx.actor.id, ctx.actor.label, ctx.actor.channel, ctx.now().toISOString()),
    auditStmt(ctx, `approval.requested:${action}`, "approval", id, "approval_required"),
  ]);
  return fail("approval_required", `${summary} needs the owner's approval in the Axis app. Nothing was changed. Approval id: ${id}`, id);
}

export async function listApprovals(ctx: Ctx) {
  const { results } = await ctx.db
    .prepare("SELECT id, action, summary, requested_by_label AS requestedBy, channel, status, created_at AS createdAt, decided_at AS decidedAt FROM pending_approvals ORDER BY created_at DESC LIMIT 100")
    .all();
  return ok({ approvals: results });
}

type Executor = (ctx: Ctx, payload: unknown) => Promise<Result<unknown>>;

/** Owner only. Approving runs the stored action once, attributed to the integration that asked and marked as approved. */
export async function decideApproval(ctx: Ctx, raw: unknown, approve: boolean, executors: Record<string, Executor>): Promise<Result<{ status: string; result?: unknown }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can decide approvals");
  try {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const row = await ctx.db.prepare("SELECT * FROM pending_approvals WHERE id = ?").bind(id).first<{ id: string; action: string; payload: string; status: string; created_at: string; requested_by_id: string; requested_by_label: string; channel: string }>();
    if (!row) return fail("not_found", "No such approval");
    if (row.status !== "pending") return fail("conflict", `Already ${row.status}`);
    const at = ctx.now().toISOString();
    if (!approve || Date.parse(row.created_at) + EXPIRY_MS < ctx.now().getTime()) {
      await ctx.db.batch([
        ctx.db.prepare("UPDATE pending_approvals SET status='rejected', decided_at=? WHERE id=?").bind(at, id),
        auditStmt(ctx, `approval.rejected:${row.action}`, "approval", id),
      ]);
      return ok({ status: "rejected" });
    }
    const exec = executors[row.action];
    if (!exec) return fail("internal_error", "Unknown approval action");
    await ctx.db.prepare("UPDATE pending_approvals SET status='approved', decided_at=? WHERE id=?").bind(at, id).run();
    // Execute as the integration that asked (so history shows the true origin), flagged as approved.
    const asRequester: Ctx = { ...ctx, approved: true, actor: { ...ctx.actor, type: "integration", id: row.requested_by_id, label: row.requested_by_label, channel: row.channel as Ctx["actor"]["channel"] } };
    const result = await exec(asRequester, JSON.parse(row.payload));
    await audit(ctx, `approval.approved:${row.action}`, "approval", id, result.ok ? "success" : "failure");
    return ok({ status: "approved", result: result.ok ? result.data : result.error });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}
