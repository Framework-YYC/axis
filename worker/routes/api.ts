import type { Env } from "../env";
import { json } from "../http";
import { runOperation } from "../services/operations";
import type { Ctx, ErrorCode, Result } from "../services/types";

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400, forbidden: 403, not_found: 404, conflict: 409, idempotency_conflict: 422, approval_required: 202, internal_error: 500,
};

/** REST method + path -> shared operation. Path parameters are merged into the input. */
const ROUTES: Array<[string, RegExp, string]> = [
  ["GET", /^\/api\/v1\/summary$/, "get_daily_summary"],
  ["GET", /^\/api\/v1\/tasks$/, "list_tasks"],
  ["POST", /^\/api\/v1\/tasks$/, "create_task"],
  ["POST", /^\/api\/v1\/tasks\/bulk$/, "create_tasks"],
  ["GET", /^\/api\/v1\/tasks\/overdue$/, "get_overdue_tasks"],
  ["GET", /^\/api\/v1\/tasks\/completed$/, "get_completed_tasks"],
  ["GET", /^\/api\/v1\/tasks\/(?<id>[\w-]+)$/, "get_task"],
  ["PATCH", /^\/api\/v1\/tasks\/(?<id>[\w-]+)$/, "update_task"],
  ["GET", /^\/api\/v1\/tasks\/(?<id>[\w-]+)\/history$/, "get_task_history"],
  ["POST", /^\/api\/v1\/tasks\/(?<id>[\w-]+)\/complete$/, "complete_task"],
  ["POST", /^\/api\/v1\/tasks\/(?<id>[\w-]+)\/reopen$/, "reopen_task"],
  ["POST", /^\/api\/v1\/tasks\/(?<id>[\w-]+)\/archive$/, "archive_task"],
  ["GET", /^\/api\/v1\/activity$/, "get_recent_activity"],
  ["GET", /^\/api\/v1\/briefing$/, "get_briefing"],
  ["GET", /^\/api\/v1\/briefing\/(?<module>[a-z]+)$/, "get_briefing"],
  ["GET", /^\/api\/v1\/modules\/(?<module>[a-z]+)\/activity$/, "get_module_activity"],
  ["GET", /^\/api\/v1\/goals$/, "list_goals"],
  ["POST", /^\/api\/v1\/goals$/, "create_goal"],
  ["GET", /^\/api\/v1\/goals\/(?<id>[\w-]+)$/, "get_goal"],
  ["PATCH", /^\/api\/v1\/goals\/(?<id>[\w-]+)$/, "update_goal"],
  ["POST", /^\/api\/v1\/goals\/(?<id>[\w-]+)\/progress$/, "update_goal_progress"],
  ["GET", /^\/api\/v1\/goals\/(?<id>[\w-]+)\/history$/, "get_goal_history"],
  ["POST", /^\/api\/v1\/goals\/(?<id>[\w-]+)\/archive$/, "archive_goal"],
  ["POST", /^\/api\/v1\/goals\/(?<goalId>[\w-]+)\/milestones$/, "add_milestone"],
  ["POST", /^\/api\/v1\/milestones\/(?<id>[\w-]+)$/, "set_milestone"],
  ["GET", /^\/api\/v1\/habits$/, "list_habits"],
  ["POST", /^\/api\/v1\/habits$/, "create_habit"],
  ["GET", /^\/api\/v1\/habits\/(?<id>[\w-]+)$/, "get_habit"],
  ["PATCH", /^\/api\/v1\/habits\/(?<id>[\w-]+)$/, "update_habit"],
  ["POST", /^\/api\/v1\/habits\/(?<habitId>[\w-]+)\/log$/, "log_habit"],
  ["GET", /^\/api\/v1\/habits\/(?<id>[\w-]+)\/history$/, "get_habit_history"],
  ["GET", /^\/api\/v1\/events$/, "list_events"],
  ["POST", /^\/api\/v1\/events$/, "create_event"],
  ["PATCH", /^\/api\/v1\/events\/(?<id>[\w-]+)$/, "update_event"],
  ["GET", /^\/api\/v1\/settings$/, "get_settings"],
  ["POST", /^\/api\/v1\/settings$/, "set_setting"],
  ["POST", /^\/api\/v1\/demo\/load$/, "load_demo_data"],
  ["POST", /^\/api\/v1\/demo\/clear$/, "clear_demo_data"],
  ["GET", /^\/api\/v1\/inbox$/, "list_inbox"],
  ["POST", /^\/api\/v1\/inbox\/process$/, "process_inbox"],
  ["POST", /^\/api\/v1\/briefings\/refresh$/, "refresh_briefings"],
  ["GET", /^\/api\/v1\/approvals$/, "list_approvals"],
  ["POST", /^\/api\/v1\/approvals\/(?<id>[\w-]+)\/approve$/, "approve_action"],
  ["POST", /^\/api\/v1\/approvals\/(?<id>[\w-]+)\/reject$/, "reject_action"],
  ["GET", /^\/api\/v1\/integrations$/, "list_integrations"],
  ["POST", /^\/api\/v1\/integrations$/, "create_integration"],
  ["POST", /^\/api\/v1\/integrations\/(?<id>[\w-]+)\/revoke$/, "revoke_integration"],
];

function envelope(r: Result<unknown>): Response {
  if (r.ok) return json({ success: true, data: r.data, ...(r.duplicate ? { duplicate: true } : {}) }, 200);
  return json({ success: false, error: r.error }, STATUS[r.error.code] ?? 500);
}

export async function handleApi(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/v1/health" && request.method === "GET") {
    let db = false;
    try { db = (await env.AXIS_DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1; } catch { db = false; }
    return json({ status: db ? "ok" : "degraded", environment: env.ENVIRONMENT, database: db });
  }
  if (pathname === "/api/v1/me" && request.method === "GET") {
    return json({ success: true, data: { actor: ctx.actor.label, type: ctx.actor.type, channel: ctx.actor.channel, scopes: [...ctx.actor.scopes], environment: env.ENVIRONMENT } });
  }

  for (const [method, re, op] of ROUTES) {
    if (request.method !== method) continue;
    const m = re.exec(pathname);
    if (!m) continue;
    let input: Record<string, unknown> = {};
    if (method === "GET") {
      for (const [k, val] of url.searchParams) {
        const multi = ["status", "priority", "horizon", "module"].includes(k) && val.includes(",");
        input[k] = multi ? val.split(",") : k === "status" || k === "priority" ? [val] : val;
      }
    } else {
      const raw = await request.text();
      if (raw.length > 256_000) return json({ success: false, error: { code: "invalid_input", message: "Body too large" } }, 413);
      if (raw) {
        try { const parsed = JSON.parse(raw); if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw 0; input = parsed; }
        catch { return json({ success: false, error: { code: "invalid_input", message: "Body must be a JSON object" } }, 400); }
      }
    }
    Object.assign(input, m.groups ?? {});
    // Production holds real data only: no demonstration data and no SQL-fed assistant inbox.
    if (env.ENVIRONMENT === "production" && (op === "load_demo_data" || op === "process_inbox")) return json({ success: false, error: { code: "forbidden", message: "Not available in production" } }, 403);
    return envelope(await runOperation(ctx, op, input, request.headers.get("Idempotency-Key") ?? undefined));
  }
  return json({ success: false, error: { code: "not_found", message: "No such endpoint" } }, 404);
}
