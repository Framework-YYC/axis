import { recentDays, streak, dayState, periodState, type DayState, type HabitDef, type HabitLog, type RotationMode } from "../../shared/habits";
import { addDays } from "../../shared/rotation";
import { assertModule, canAccessModule, defaultModule, Forbidden, moduleFilter } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { withIdempotency } from "./idempotency";
import { prefsOf, resolveToday } from "./prefs";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

const PERIODS = ["day", "week", "month"] as const;
const MODES = ["any", "on", "off", "split"] as const;
const STATUSES = ["active", "paused", "archived"] as const;

interface HabitRow {
  id: string; module: string; title: string; description: string | null; period: string; target_count: number; target_value: number | null; unit: string | null;
  days_of_week: string | null; rotation_mode: string; off_target_count: number | null; off_target_value: number | null; off_days_of_week: string | null; start_date: string;
  goal_id: string | null; status: string; source_kind: string; source_name: string; source_assistant: string | null; source_ref: string | null; external_id: string | null;
  demo: number; created_at: string; updated_at: string; created_by: string; updated_by: string; version: number;
}

export interface Habit {
  id: string; module: string; title: string; description: string | null; period: string; targetCount: number; targetValue: number | null; unit: string | null;
  daysOfWeek: number[] | null; rotationMode: string; offTargetCount: number | null; offTargetValue: number | null; offDaysOfWeek: number[] | null; startDate: string; goalId: string | null;
  status: string; today: DayState; streak: { current: number; best: number }; recent: DayState[];
  source: { kind: string; name: string; assistant: string | null; ref: string | null }; externalId: string | null; demo: boolean; createdAt: string; updatedAt: string; version: number;
}

const parseDays = (s: string | null): number[] | null => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
const defOf = (r: HabitRow): HabitDef => ({ period: r.period as HabitDef["period"], targetCount: r.target_count, targetValue: r.target_value, daysOfWeek: parseDays(r.days_of_week), rotationMode: r.rotation_mode as RotationMode, offTargetCount: r.off_target_count, offTargetValue: r.off_target_value, offDaysOfWeek: parseDays(r.off_days_of_week), startDate: r.start_date });

const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};

async function load(ctx: Ctx, rows: HabitRow[], today: string): Promise<Habit[]> {
  const prefs = await prefsOf(ctx);
  const ids = rows.map((r) => r.id);
  const logs = new Map<string, HabitLog[]>();
  if (ids.length) {
    const { results } = await ctx.db.prepare(`SELECT habit_id, date, SUM(value) AS value FROM habit_logs WHERE habit_id IN (${ids.map(() => "?").join(",")}) GROUP BY habit_id, date`).bind(...ids).all<{ habit_id: string; date: string; value: number }>();
    for (const l of results) (logs.get(l.habit_id) ?? logs.set(l.habit_id, []).get(l.habit_id)!).push({ date: l.date, value: l.value });
  }
  return rows.filter((r) => canAccessModule(ctx.actor, r.module)).map((r) => {
    const d = defOf(r), l = logs.get(r.id) ?? [];
    const state = d.period === "day" ? dayState(d, today, l, prefs.rotation) : periodState(d, today, l);
    return {
      id: r.id, module: r.module, title: r.title, description: r.description, period: r.period, targetCount: r.target_count, targetValue: r.target_value, unit: r.unit,
      daysOfWeek: d.daysOfWeek, rotationMode: r.rotation_mode, offTargetCount: r.off_target_count, offTargetValue: r.off_target_value, offDaysOfWeek: d.offDaysOfWeek, startDate: r.start_date, goalId: r.goal_id,
      status: r.status, today: state, streak: streak(d, l, today, prefs.rotation), recent: recentDays(d, l, today, prefs.rotation, 14),
      source: { kind: r.source_kind, name: r.source_name, assistant: r.source_assistant, ref: r.source_ref }, externalId: r.external_id, demo: r.demo === 1, createdAt: r.created_at, updatedAt: r.updated_at, version: r.version,
    };
  });
}

const one = async (ctx: Ctx, id: string): Promise<HabitRow | null> => {
  const row = await ctx.db.prepare("SELECT * FROM habits WHERE id = ?").bind(id).first<HabitRow>();
  if (row) assertModule(ctx.actor, row.module);
  return row;
};

export const listHabits = (ctx: Ctx, raw: unknown): Promise<Result<{ habits: Habit[]; count: number; today: string }>> =>
  guard(async () => {
    const i = v.obj(raw ?? {}, "input");
    const today = await resolveToday(ctx, i, v);
    const where: string[] = [];
    const args: unknown[] = [];
    const allowed = moduleFilter(ctx.actor);
    const asked = i.module === undefined ? null : [v.moduleId(i.module)!];
    const mods = asked ? (allowed ? asked.filter((m) => allowed.includes(m)) : asked) : allowed;
    if (asked && allowed && mods && mods.length === 0) throw new Forbidden("This connection cannot access that module");
    if (mods) { where.push(`module IN (${mods.map(() => "?").join(",")})`); args.push(...mods); }
    const statuses = v.stringList(i.status, "status", STATUSES);
    where.push(statuses?.length ? `status IN (${statuses.map(() => "?").join(",")})` : "status != 'archived'");
    if (statuses?.length) args.push(...statuses);
    const { results } = await ctx.db.prepare(`SELECT * FROM habits WHERE ${where.join(" AND ")} ORDER BY module, created_at LIMIT 200`).bind(...args).all<HabitRow>();
    const habits = await load(ctx, results, today);
    return ok({ habits, count: habits.length, today });
  });

export const getHabit = (ctx: Ctx, raw: unknown): Promise<Result<Habit>> =>
  guard(async () => {
    const row = await one(ctx, v.text(v.obj(raw, "input").id, "id", { max: 100 })!);
    if (!row) return fail("not_found", "No such habit");
    return ok((await load(ctx, [row], await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v)))[0]);
  });

export const createHabit = (ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<Habit>> =>
  guard(async () => {
    const i = v.obj(raw, "habit");
    const module = v.moduleId(i.module) ?? defaultModule(ctx.actor);
    assertModule(ctx.actor, module);
    const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
    const n = {
      title: v.text(i.title, "title", { max: 200 })!, description: v.text(i.description, "description", { max: 2000, optional: true, allowNewlines: true }),
      period: v.oneOf(i.period, "period", PERIODS, "day")!, targetCount: v.int(i.targetCount, "targetCount", { min: 1, max: 1000, fallback: 1 }),
      targetValue: v.num(i.targetValue, "targetValue", { min: 0 }), unit: v.text(i.unit, "unit", { max: 30, optional: true }),
      days: v.weekdays(i.daysOfWeek, "daysOfWeek") ?? null, mode: v.oneOf(i.rotationMode, "rotationMode", MODES, "any")!,
      offCount: i.offTargetCount === undefined ? null : v.int(i.offTargetCount, "offTargetCount", { min: 1, max: 1000, fallback: 1 }), offValue: v.num(i.offTargetValue, "offTargetValue", { min: 0 }) ?? null,
      offDays: v.weekdays(i.offDaysOfWeek, "offDaysOfWeek") ?? null, start: v.date(i.startDate, "startDate") ?? today, goalId: v.text(i.goalId, "goalId", { max: 100, optional: true }),
      externalId: v.text(i.externalId, "externalId", { max: 200, optional: true }), sourceRef: v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }), demo: v.bool(i.demo, "demo") === true,
    };
    return withIdempotency(ctx, "create_habit", idempotencyKey, raw, async () => {
      const src = ctx.actor.type === "integration" ? { kind: ctx.actor.channel === "inbox" ? "assistant" : "integration", name: ctx.actor.label, assistant: ctx.actor.assistant ?? null } : { kind: "manual", name: "Orbis", assistant: null };
      if (n.externalId) {
        const dup = await ctx.db.prepare("SELECT * FROM habits WHERE source_name = ? AND external_id = ?").bind(src.name, n.externalId).first<HabitRow>();
        if (dup) return ok((await load(ctx, [dup], today))[0], { duplicate: true });
      }
      const id = `hab_${crypto.randomUUID()}`;
      const at = ctx.now().toISOString();
      await write(ctx.db, [
        ctx.db.prepare("INSERT INTO habits (id,module,title,description,period,target_count,target_value,unit,days_of_week,rotation_mode,off_target_count,off_target_value,off_days_of_week,start_date,goal_id,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id, module, n.title, n.description ?? null, n.period, n.targetCount, n.targetValue ?? null, n.unit ?? null, n.days ? JSON.stringify(n.days) : null, n.mode, n.offCount, n.offValue, n.offDays ? JSON.stringify(n.offDays) : null, n.start, n.goalId ?? null, src.kind, src.name, src.assistant, n.sourceRef ?? null, n.externalId ?? null, n.demo ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label),
        auditStmt(ctx, "habit.create", "habit", id),
      ]);
      return ok((await load(ctx, [(await one(ctx, id))!], today))[0]);
    });
  });

export const updateHabit = (ctx: Ctx, raw: unknown): Promise<Result<Habit>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const row = await one(ctx, v.text(i.id, "id", { max: 100 })!);
    if (!row) return fail("not_found", "No such habit");
    if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Habit changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
    const sets: string[] = [];
    const args: unknown[] = [];
    const set = (col: string, value: unknown) => { sets.push(`${col} = ?`); args.push(value ?? null); };
    if ("title" in i) set("title", v.text(i.title, "title", { max: 200 }));
    if ("description" in i) set("description", i.description === null ? null : v.text(i.description, "description", { max: 2000, allowNewlines: true }));
    if ("period" in i) set("period", v.oneOf(i.period, "period", PERIODS));
    if ("targetCount" in i) set("target_count", v.int(i.targetCount, "targetCount", { min: 1, max: 1000, fallback: 1 }));
    if ("targetValue" in i) set("target_value", v.num(i.targetValue, "targetValue", { min: 0 }));
    if ("unit" in i) set("unit", i.unit === null ? null : v.text(i.unit, "unit", { max: 30 }));
    if ("daysOfWeek" in i) { const d = v.weekdays(i.daysOfWeek, "daysOfWeek"); set("days_of_week", d ? JSON.stringify(d) : null); }
    if ("rotationMode" in i) set("rotation_mode", v.oneOf(i.rotationMode, "rotationMode", MODES));
    if ("offTargetCount" in i) set("off_target_count", i.offTargetCount === null ? null : v.int(i.offTargetCount, "offTargetCount", { min: 1, max: 1000, fallback: 1 }));
    if ("offTargetValue" in i) set("off_target_value", v.num(i.offTargetValue, "offTargetValue", { min: 0 }));
    if ("offDaysOfWeek" in i) { const d = v.weekdays(i.offDaysOfWeek, "offDaysOfWeek"); set("off_days_of_week", d ? JSON.stringify(d) : null); }
    if ("goalId" in i) set("goal_id", i.goalId === null ? null : v.text(i.goalId, "goalId", { max: 100 }));
    if ("status" in i) set("status", v.oneOf(i.status, "status", STATUSES));
    if (!sets.length) return fail("invalid_input", "Nothing to update");
    const at = ctx.now().toISOString();
    await write(ctx.db, [ctx.db.prepare(`UPDATE habits SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, row.id), auditStmt(ctx, "habit.update", "habit", row.id)]);
    return ok((await load(ctx, [(await one(ctx, row.id))!], await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v)))[0]);
  });

/** Record progress for a day. Counts as one by default; quantitative habits send the measurement. Re-sending the same externalId is a no-op. */
export const logHabit = (ctx: Ctx, raw: unknown): Promise<Result<Habit>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const row = await one(ctx, v.text(i.habitId ?? i.id, "habitId", { max: 100 })!);
    if (!row) return fail("not_found", "No such habit");
    if (row.status === "archived") throw new v.InvalidInput("this habit is archived");
    const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
    const date = v.date(i.date, "date") ?? today;
    if (date > addDays(today, 1)) throw new v.InvalidInput("date cannot be in the future");
    if (date < row.start_date && date < addDays(today, -400)) throw new v.InvalidInput("date is too far in the past");
    const value = v.num(i.value, "value", { min: 0, max: 1_000_000 }) ?? 1;
    const externalId = v.text(i.externalId, "externalId", { max: 200, optional: true });
    if (externalId) {
      const dup = await ctx.db.prepare("SELECT id FROM habit_logs WHERE habit_id = ? AND external_id = ?").bind(row.id, externalId).first();
      if (dup) return ok((await load(ctx, [row], today))[0], { duplicate: true });
    }
    const at = ctx.now().toISOString();
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO habit_logs (id,habit_id,date,value,note,at,actor_label,channel,external_id) VALUES (?,?,?,?,?,?,?,?,?)").bind(`hlg_${crypto.randomUUID()}`, row.id, date, value, v.text(i.note, "note", { max: 300, optional: true }) ?? null, at, ctx.actor.label, ctx.actor.channel, externalId ?? null),
      auditStmt(ctx, "habit.log", "habit", row.id),
    ]);
    return ok((await load(ctx, [row], today))[0]);
  });

export const habitHistory = (ctx: Ctx, raw: unknown) =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const row = await one(ctx, v.text(i.id, "id", { max: 100 })!);
    if (!row) return fail("not_found", "No such habit");
    const { results } = await ctx.db.prepare("SELECT date, value, note, at, actor_label AS actorLabel, channel FROM habit_logs WHERE habit_id = ? ORDER BY date DESC, at DESC LIMIT ?").bind(row.id, v.int(i.limit, "limit", { min: 1, max: 500, fallback: 100 })).all();
    return ok({ logs: results });
  });
