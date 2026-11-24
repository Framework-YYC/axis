import { assertModule, defaultModule, Forbidden, moduleFilter } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { withIdempotency } from "./idempotency";
import { resolveToday } from "./prefs";
import { addDays } from "../../shared/rotation";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

interface EventRow {
  id: string; module: string; title: string; description: string | null; date: string; start_time: string | null; end_time: string | null; location: string | null; status: string;
  source_kind: string; source_name: string; source_assistant: string | null; source_ref: string | null; external_id: string | null; demo: number;
  created_at: string; updated_at: string; created_by: string; updated_by: string; version: number;
}
export interface CalEvent {
  id: string; module: string; title: string; description: string | null; date: string; startTime: string | null; endTime: string | null; location: string | null; status: string;
  source: { kind: string; name: string; assistant: string | null; ref: string | null }; externalId: string | null; demo: boolean; createdAt: string; updatedAt: string; version: number;
}
const toEvent = (r: EventRow): CalEvent => ({
  id: r.id, module: r.module, title: r.title, description: r.description, date: r.date, startTime: r.start_time, endTime: r.end_time, location: r.location, status: r.status,
  source: { kind: r.source_kind, name: r.source_name, assistant: r.source_assistant, ref: r.source_ref }, externalId: r.external_id, demo: r.demo === 1, createdAt: r.created_at, updatedAt: r.updated_at, version: r.version,
});
const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};
const fetchRow = async (ctx: Ctx, id: string) => { const r = await ctx.db.prepare("SELECT * FROM events WHERE id = ?").bind(id).first<EventRow>(); if (r) assertModule(ctx.actor, r.module); return r; };

export const listEvents = (ctx: Ctx, raw: unknown): Promise<Result<{ events: CalEvent[]; count: number }>> =>
  guard(async () => {
    const i = v.obj(raw ?? {}, "input");
    const today = await resolveToday(ctx, i, v);
    const from = v.date(i.from, "from") ?? today;
    const to = v.date(i.to, "to") ?? addDays(from, 30);
    const where = ["date >= ?", "date <= ?"];
    const args: unknown[] = [from, to];
    if (v.bool(i.includeCancelled, "includeCancelled") !== true) where.push("status = 'scheduled'");
    const allowed = moduleFilter(ctx.actor);
    const asked = i.module === undefined ? null : [v.moduleId(i.module)!];
    const mods = asked ? (allowed ? asked.filter((m) => allowed.includes(m)) : asked) : allowed;
    if (asked && allowed && mods && mods.length === 0) throw new Forbidden("This connection cannot access that module");
    if (mods) { where.push(`module IN (${mods.map(() => "?").join(",")})`); args.push(...mods); }
    const { results } = await ctx.db.prepare(`SELECT * FROM events WHERE ${where.join(" AND ")} ORDER BY date, start_time IS NULL, start_time LIMIT 500`).bind(...args).all<EventRow>();
    return ok({ events: results.map(toEvent), count: results.length });
  });

export const createEvent = (ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<CalEvent>> =>
  guard(async () => {
    const i = v.obj(raw, "event");
    const module = v.moduleId(i.module) ?? defaultModule(ctx.actor);
    assertModule(ctx.actor, module);
    const date = v.date(i.date, "date", false)!;
    const start = v.time(i.startTime, "startTime"), end = v.time(i.endTime, "endTime");
    if (end && !start) throw new v.InvalidInput("endTime needs a startTime");
    if (start && end && end < start) throw new v.InvalidInput("endTime must be after startTime");
    const n = { title: v.text(i.title, "title", { max: 200 })!, description: v.text(i.description, "description", { max: 2000, optional: true, allowNewlines: true }), location: v.text(i.location, "location", { max: 200, optional: true }), externalId: v.text(i.externalId, "externalId", { max: 200, optional: true }), sourceRef: v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }), demo: v.bool(i.demo, "demo") === true };
    return withIdempotency(ctx, "create_event", idempotencyKey, raw, async () => {
      const src = ctx.actor.type === "integration" ? { kind: ctx.actor.channel === "inbox" ? "assistant" : "integration", name: ctx.actor.label, assistant: ctx.actor.assistant ?? null } : { kind: "manual", name: "Orbis", assistant: null };
      if (n.externalId) {
        const dup = await ctx.db.prepare("SELECT * FROM events WHERE source_name = ? AND external_id = ?").bind(src.name, n.externalId).first<EventRow>();
        if (dup) return ok(toEvent(dup), { duplicate: true });
      }
      const id = `evt_${crypto.randomUUID()}`;
      const at = ctx.now().toISOString();
      await write(ctx.db, [
        ctx.db.prepare("INSERT INTO events (id,module,title,description,date,start_time,end_time,location,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id, module, n.title, n.description ?? null, date, start ?? null, end ?? null, n.location ?? null, src.kind, src.name, src.assistant, n.sourceRef ?? null, n.externalId ?? null, n.demo ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label),
        auditStmt(ctx, "event.create", "event", id),
      ]);
      return ok(toEvent((await fetchRow(ctx, id))!));
    });
  });

export const updateEvent = (ctx: Ctx, raw: unknown): Promise<Result<CalEvent>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const row = await fetchRow(ctx, v.text(i.id, "id", { max: 100 })!);
    if (!row) return fail("not_found", "No such event");
    if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Event changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
    const sets: string[] = [];
    const args: unknown[] = [];
    const set = (col: string, value: unknown) => { sets.push(`${col} = ?`); args.push(value ?? null); };
    if ("title" in i) set("title", v.text(i.title, "title", { max: 200 }));
    if ("description" in i) set("description", i.description === null ? null : v.text(i.description, "description", { max: 2000, allowNewlines: true }));
    if ("date" in i) set("date", v.date(i.date, "date", false));
    if ("startTime" in i) set("start_time", v.time(i.startTime, "startTime"));
    if ("endTime" in i) set("end_time", v.time(i.endTime, "endTime"));
    if ("location" in i) set("location", i.location === null ? null : v.text(i.location, "location", { max: 200 }));
    if ("status" in i) set("status", v.oneOf(i.status, "status", ["scheduled", "cancelled"] as const));
    if ("module" in i) { const m = v.moduleId(i.module)!; assertModule(ctx.actor, m); set("module", m); }
    if (!sets.length) return fail("invalid_input", "Nothing to update");
    const at = ctx.now().toISOString();
    await write(ctx.db, [ctx.db.prepare(`UPDATE events SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, row.id), auditStmt(ctx, "event.update", "event", row.id)]);
    return ok(toEvent((await fetchRow(ctx, row.id))!));
  });
