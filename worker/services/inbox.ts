import { isModule, type ModuleId } from "../../shared/modules";
import { assistantActor } from "./assistants";
import { changes, write } from "./db";
import { refreshBriefings } from "./briefing";
import { runOperation } from "./operations";
import type { Ctx, Result } from "./types";

/** The requests an assistant may add to assistant_inbox, and the service operation each one runs. */
export const INBOX_OPS: Record<string, { operation: string; creates: boolean }> = {
  "task.create": { operation: "create_task", creates: true },
  "task.create_many": { operation: "create_tasks", creates: true },
  "task.update": { operation: "update_task", creates: false },
  "task.complete": { operation: "complete_task", creates: false },
  "task.reopen": { operation: "reopen_task", creates: false },
  "task.archive": { operation: "archive_task", creates: false },
  "goal.create": { operation: "create_goal", creates: true },
  "goal.update": { operation: "update_goal", creates: false },
  "goal.progress": { operation: "update_goal_progress", creates: false },
  "habit.create": { operation: "create_habit", creates: true },
  "habit.update": { operation: "update_habit", creates: false },
  "habit.log": { operation: "log_habit", creates: false },
  "event.create": { operation: "create_event", creates: true },
  "event.update": { operation: "update_event", creates: false },
  "briefing.refresh": { operation: "get_briefing", creates: false },
};

interface InboxRow { id: string; assistant: string; op: string; payload: string; created_at: string }
export type InboxStatus = "applied" | "duplicate" | "rejected" | "error" | "approval_required";

/** A short, content-free summary of what happened, stored on the request row for the assistant to read back. */
function summarize(r: Result<unknown>): { status: InboxStatus; result: Record<string, unknown>; approvalId?: string } {
  if (r.ok) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const items = Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : null;
    const entity = (d.task ?? d) as Record<string, unknown>;
    const result: Record<string, unknown> = { ok: true, duplicate: !!r.duplicate };
    if (items) Object.assign(result, { created: d.created, duplicates: d.duplicates, failed: d.failed, ids: items.filter((x) => x.ok).map((x) => (x.task as { id?: string } | undefined)?.id), errors: items.filter((x) => !x.ok).map((x) => ({ index: x.index, error: x.error })) });
    else Object.assign(result, { id: entity.id ?? null, version: entity.version ?? null, status: entity.status ?? null, next: (d as { next?: unknown }).next ?? null });
    return { status: r.duplicate ? "duplicate" : "applied", result };
  }
  const e = r.error;
  const status: InboxStatus = e.code === "approval_required" ? "approval_required" : e.code === "internal_error" ? "error" : "rejected";
  return { status, result: { ok: false, code: e.code, message: e.message, ...(e.approvalId ? { approvalId: e.approvalId } : {}) }, approvalId: e.approvalId };
}

/**
 * Applies pending assistant requests through the same service layer as the app, REST and MCP, with the assistant's own module-confined identity.
 * Safe to run concurrently (rows are claimed atomically) and to run repeatedly (a request id is applied at most once).
 */
export async function processInbox(db: D1Database, opts: { now?: Date; limit?: number } = {}): Promise<{ processed: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 25;
  // A claim older than five minutes belonged to a run that died; put it back.
  await write(db, [db.prepare("UPDATE assistant_inbox SET status = 'pending', processed_at = NULL WHERE status = 'processing' AND processed_at < ?").bind(new Date(now.getTime() - 5 * 60_000).toISOString())]);
  const { results } = await db.prepare("SELECT id, assistant, op, payload, created_at FROM assistant_inbox WHERE status = 'pending' ORDER BY created_at, id LIMIT ?").bind(limit).all<InboxRow>();
  const touched = new Set<ModuleId>();
  let processed = 0;
  for (const row of results) {
    const claim = await write(db, [db.prepare("UPDATE assistant_inbox SET status = 'processing', processed_at = ? WHERE id = ? AND status = 'pending'").bind(now.toISOString(), row.id)]);
    if (changes(claim[0]) !== 1) continue; // another run took it
    let outcome: ReturnType<typeof summarize>;
    try {
      const spec = INBOX_OPS[row.op];
      if (!spec || !isModule(row.assistant)) throw Object.assign(new Error("unknown request"), { code: "invalid_input" });
      const assistant = row.assistant;
      let payload: Record<string, unknown>;
      try { const p = JSON.parse(row.payload); if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(); payload = p; } catch { throw Object.assign(new Error("payload must be a JSON object"), { code: "invalid_input" }); }
      // Module separation: an assistant may only create records in its own module; everything else is enforced by the module-confined identity.
      const stamp = (o: Record<string, unknown>) => { if (o.module !== undefined && o.module !== assistant) throw Object.assign(new Error(`The ${assistant} assistant cannot write to the ${String(o.module)} module`), { code: "forbidden" }); return { ...o, module: assistant }; };
      if (spec.creates) payload = row.op === "task.create_many" ? { ...payload, tasks: Array.isArray(payload.tasks) ? (payload.tasks as Array<Record<string, unknown>>).map(stamp) : payload.tasks } : stamp(payload);
      if (row.op === "briefing.refresh") payload = { module: assistant };
      const ctx: Ctx = { db, actor: assistantActor(assistant), requestId: `inbox-${row.id}`, now: () => now };
      const r = await runOperation(ctx, spec.operation, payload, `inbox:${row.id}`);
      outcome = summarize(r);
      touched.add(assistant);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "internal_error";
      outcome = { status: code === "internal_error" ? "error" : "rejected", result: { ok: false, code, message: code === "internal_error" ? "Axis could not apply this request. Nothing was changed." : (e as Error).message } };
    }
    await write(db, [db.prepare("UPDATE assistant_inbox SET status = ?, result = ?, processed_at = ?, approval_id = ? WHERE id = ?").bind(outcome.status, JSON.stringify(outcome.result), now.toISOString(), outcome.approvalId ?? null, row.id)]);
    processed++;
  }
  if (touched.size) await refreshBriefings(db, now, ["overview", ...touched]);
  return { processed };
}

export async function maintenance(db: D1Database, now = new Date()): Promise<{ processed: number }> {
  const r = await processInbox(db, { now, limit: 50 });
  await refreshBriefings(db, now); // keeps "today" correct across midnight even when nothing changed
  return r;
}
