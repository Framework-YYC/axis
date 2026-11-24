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
        const multi = ["status", "priority"].includes(k);
        input[k] = multi ? val.split(",") : val;
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
    return envelope(await runOperation(ctx, op, input, request.headers.get("Idempotency-Key") ?? undefined));
  }
  return json({ success: false, error: { code: "not_found", message: "No such endpoint" } }, 404);
}
