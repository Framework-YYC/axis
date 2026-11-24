import { sha256Hex } from "../../shared/ingest";
import { audit } from "./audit";
import { write } from "./db";
import { SCOPES, fail, ok, type Actor, type Channel, type Ctx, type Result } from "./types";
import * as v from "./validate";

const KINDS = ["chatgpt", "shortcut", "mcp_client", "automation", "other"] as const;
const TOKEN_PREFIX = "axk_";

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return TOKEN_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Resolves a bearer token to an integration actor. Revoked or expired tokens and revoked integrations never resolve. */
export async function authenticateBearer(db: D1Database, header: string, channel: Channel, now = new Date()): Promise<Actor | null> {
  const m = /^Bearer (axk_[A-Za-z0-9_-]{20,100})$/.exec(header);
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const at = now.toISOString();
  const row = await db
    .prepare(
      "SELECT t.id AS token_id, i.id, i.name, i.kind, i.scopes, i.modules FROM api_tokens t JOIN integrations i ON i.id = t.integration_id WHERE t.token_hash = ? AND t.revoked_at IS NULL AND i.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > ?)",
    )
    .bind(hash, at)
    .first<{ token_id: string; id: string; name: string; kind: string; scopes: string; modules: string | null }>();
  if (!row) return null;
  try {
    // Throttled to once a minute so reads do not become writes.
    await write(db, [db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)").bind(at, row.token_id, new Date(now.getTime() - 60_000).toISOString())]);
  } catch { /* last-used is informational */ }
  const label = row.kind === "chatgpt" ? `ChatGPT: ${row.name}` : row.name;
  return { type: "integration", id: row.id, label, scopes: new Set(JSON.parse(row.scopes) as string[]), channel, ...(row.modules ? { modules: new Set(JSON.parse(row.modules) as string[]) } : {}) };
}

export async function createIntegration(ctx: Ctx, raw: unknown): Promise<Result<{ id: string; name: string; kind: string; scopes: string[]; token: string; note: string }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can create integrations");
  try {
    const i = v.obj(raw, "input");
    const name = v.text(i.name, "name", { max: 60 })!;
    const kind = v.oneOf(i.kind, "kind", KINDS, "other")!;
    const scopes = v.stringList(i.scopes, "scopes", SCOPES);
    const modules = i.modules === undefined ? null : (Array.isArray(i.modules) ? i.modules : [i.modules]).map((m) => v.moduleId(m)!);
    if (!scopes?.length) return fail("invalid_input", "scopes must list at least one scope (least privilege: grant only what is needed)");
    const id = `int_${crypto.randomUUID()}`;
    const token = newToken();
    const at = ctx.now().toISOString();
    const expiryDays = v.int(i.expiresInDays, "expiresInDays", { min: 1, max: 365, fallback: 90 });
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO integrations (id, name, kind, scopes, modules, created_at) VALUES (?,?,?,?,?,?)").bind(id, name, kind, JSON.stringify([...new Set(scopes)]), modules ? JSON.stringify([...new Set(modules)]) : null, at),
      ctx.db.prepare("INSERT INTO api_tokens (id, integration_id, token_hash, prefix, created_at, expires_at) VALUES (?,?,?,?,?,?)")
        .bind(`tok_${crypto.randomUUID()}`, id, await sha256Hex(token), token.slice(0, 8), at, new Date(ctx.now().getTime() + expiryDays * 86_400_000).toISOString()),
    ]);
    await audit(ctx, "integration.create", "integration", id, "success");
    return ok({ id, name, kind, scopes: [...new Set(scopes)], token, note: "Store this token now. It is shown once and only its hash is kept." });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

export async function listIntegrations(ctx: Ctx) {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can list integrations");
  const { results } = await ctx.db
    .prepare("SELECT i.id, i.name, i.kind, i.scopes, i.modules, i.created_at AS createdAt, i.revoked_at AS revokedAt, (SELECT MAX(last_used_at) FROM api_tokens WHERE integration_id = i.id) AS lastUsedAt FROM integrations i ORDER BY i.created_at DESC")
    .all<{ scopes: string; modules: string | null }>();
  return ok({ integrations: results.map((r) => ({ ...r, scopes: JSON.parse(r.scopes), modules: r.modules ? JSON.parse(r.modules) : null })) });
}

/** Immediate: the next request with any of the integration's tokens is refused. */
export async function revokeIntegration(ctx: Ctx, raw: unknown): Promise<Result<{ id: string; revoked: true }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can revoke integrations");
  try {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const at = ctx.now().toISOString();
    const row = await ctx.db.prepare("SELECT id FROM integrations WHERE id = ?").bind(id).first();
    if (!row) return fail("not_found", "No such integration");
    await write(ctx.db, [
      ctx.db.prepare("UPDATE integrations SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").bind(at, id),
      ctx.db.prepare("UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE integration_id = ?").bind(at, id),
    ]);
    await audit(ctx, "integration.revoke", "integration", id, "success");
    return ok({ id, revoked: true });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}
