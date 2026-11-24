import { authenticate } from "./auth";
import type { Env } from "./env";
import { finalize, json, sameOriginWrite } from "./http";
import { handleApi } from "./routes/api";
import { handleMcp } from "./routes/mcp";
import { maintenance, processInbox } from "./services/inbox";
import { authenticateBearer } from "./services/integrations";
import { ownerActor, type Actor, type Channel, type Ctx } from "./services/types";

const deny = (status: number, pathname: string, headers: Record<string, string> = {}) =>
  finalize(new Response(status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Service unavailable", { status, headers: { "Content-Type": "text/plain", ...headers } }), pathname);

export default {
  async fetch(request: Request, env: Env, exec?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const isMcp = pathname === "/mcp";
    const isApi = pathname.startsWith("/api/v1/");
    const bearer = request.headers.get("Authorization");

    // Two ways in, and only two:
    //  1. Integrations (REST and MCP only): a scoped, revocable bearer token, validated against the database.
    //  2. Everyone else, and every other path: the Cloudflare Access JWT of the owner. Static files included.
    // An Authorization header on any other path is ignored, never trusted.
    let actor: Actor | null = null;
    let viaBearer = false;
    if ((isMcp || isApi) && bearer) {
      const channel: Channel = isMcp ? "mcp" : "rest";
      actor = await authenticateBearer(env.AXIS_DB, bearer, channel);
      if (!actor) {
        console.warn(JSON.stringify({ event: "auth_denied", status: 401, reason: "invalid or revoked token" }));
        return deny(401, pathname, { "WWW-Authenticate": 'Bearer realm="axis"' });
      }
      viaBearer = true;
    } else {
      const auth = await authenticate(request, env);
      if (!auth.ok) {
        // Reason only. Never tokens, emails or bodies.
        console.warn(JSON.stringify({ event: "auth_denied", status: auth.status, reason: auth.reason }));
        return deny(auth.status, pathname, auth.status === 401 && (isMcp || isApi) ? { "WWW-Authenticate": 'Bearer realm="axis"' } : {});
      }
      actor = ownerActor(isMcp ? "mcp" : "web");
    }

    if (isMcp || isApi) {
      // Browser sessions carry ambient cookies, so writes must be same-origin JSON. Bearer calls have no ambient credential.
      if (!viaBearer && !sameOriginWrite(request)) return finalize(json({ success: false, error: { code: "forbidden", message: "Cross-origin or non-JSON write" } }, 403), pathname);
      const ctx: Ctx = { db: env.AXIS_DB, actor, requestId: crypto.randomUUID(), now: () => new Date() };
      // The owner's app polls the task list; applying any waiting assistant requests first keeps it current between cron runs.
      if (!viaBearer && env.ENVIRONMENT !== "production" && request.method === "GET" && pathname === "/api/v1/tasks" && exec) exec.waitUntil(processInbox(env.AXIS_DB).then(() => undefined).catch(() => undefined));
      try {
        const res = isMcp ? await handleMcp(request, env, ctx) : await handleApi(request, env, ctx);
        res.headers.set("X-Request-Id", ctx.requestId);
        return finalize(res, pathname);
      } catch {
        console.error(JSON.stringify({ event: "request_error", path: pathname, request: ctx.requestId }));
        return finalize(json({ success: false, error: { code: "internal_error", message: "Something went wrong" } }, 500), pathname);
      }
    }
    if (pathname.startsWith("/api/")) return finalize(json({ success: false, error: { code: "not_found", message: "Use /api/v1" } }, 404), pathname);

    if (request.method !== "GET" && request.method !== "HEAD") return finalize(new Response("Method not allowed", { status: 405 }), pathname);
    return finalize(await env.ASSETS.fetch(request), pathname);
  },

  /** Every minute: apply pending assistant requests through the service layer and keep stored briefings current. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.ENVIRONMENT === "production") return; // production has no assistant inbox and no Cron Trigger; assistants use scoped REST/MCP tokens
    ctx.waitUntil(maintenance(env.AXIS_DB).then((r) => { if (r.processed) console.log(JSON.stringify({ event: "inbox_processed", count: r.processed })); }).catch(() => console.error(JSON.stringify({ event: "maintenance_failed" }))));
  },
} satisfies ExportedHandler<Env>;
