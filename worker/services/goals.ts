import { GOAL_TERMS, goalProgress, goalTerm, type GoalTerm } from "../../shared/goals";
import { assertModule, canAccessModule, defaultModule, Forbidden, moduleFilter } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { withIdempotency } from "./idempotency";
import { requestApproval } from "./approvals";
import { resolveToday } from "./prefs";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

const STATUSES = ["active", "paused", "achieved", "abandoned"] as const;
const KINDS = ["numeric", "qualitative"] as const;

interface GoalRow {
  id: string; module: string; title: string; description: string | null; kind: string; term: string | null; target_date: string | null; start_value: number | null;
  target_value: number | null; current_value: number | null; unit: string | null; manual_progress: number | null; status: string; source_kind: string; source_name: string;
  source_assistant: string | null; source_ref: string | null; external_id: string | null; demo: number; archived_at: string | null; created_at: string; updated_at: string;
  completed_at: string | null; created_by: string; updated_by: string; version: number;
}
interface MilestoneRow { id: string; goal_id: string; title: string; target_date: string | null; target_value: number | null; done_at: string | null; sort_order: number }

export interface Milestone { id: string; title: string; targetDate: string | null; targetValue: number | null; done: boolean; doneAt: string | null }
export interface Goal {
  id: string; module: string; title: string; description: string | null; kind: string; term: GoalTerm | null; termSource: "set" | "target_date" | "none";
  targetDate: string | null; startValue: number | null; targetValue: number | null; currentValue: number | null; unit: string | null; progress: number;
  status: string; milestones: Milestone[]; source: { kind: string; name: string; assistant: string | null; ref: string | null }; externalId: string | null; demo: boolean;
  archivedAt: string | null; createdAt: string; updatedAt: string; completedAt: string | null; createdBy: string; updatedBy: string; version: number;
}

function toGoal(r: GoalRow, ms: MilestoneRow[], today: string): Goal {
  const milestones = ms.map((m) => ({ id: m.id, title: m.title, targetDate: m.target_date, targetValue: m.target_value, done: !!m.done_at, doneAt: m.done_at }));
  const derived = goalTerm(r.target_date, today);
  return {
    id: r.id, module: r.module, title: r.title, description: r.description, kind: r.kind,
    term: (r.term as GoalTerm | null) ?? derived, termSource: r.term ? "set" : derived ? "target_date" : "none",
    targetDate: r.target_date, startValue: r.start_value, targetValue: r.target_value, currentValue: r.current_value, unit: r.unit,
    progress: goalProgress({ kind: r.kind as "numeric" | "qualitative", startValue: r.start_value, targetValue: r.target_value, currentValue: r.current_value, manualProgress: r.manual_progress, milestones }),
    status: r.status, milestones, source: { kind: r.source_kind, name: r.source_name, assistant: r.source_assistant, ref: r.source_ref }, externalId: r.external_id, demo: r.demo === 1,
    archivedAt: r.archived_at, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at, createdBy: r.created_by, updatedBy: r.updated_by, version: r.version,
  };
}

const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};

async function load(ctx: Ctx, ids: string[], today: string): Promise<Goal[]> {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const { results: rows } = await ctx.db.prepare(`SELECT * FROM goals WHERE id IN (${ph})`).bind(...ids).all<GoalRow>();
  const { results: ms } = await ctx.db.prepare(`SELECT * FROM goal_milestones WHERE goal_id IN (${ph}) ORDER BY sort_order, created_at`).bind(...ids).all<MilestoneRow>();
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is GoalRow => !!r && canAccessModule(ctx.actor, r.module)).map((r) => toGoal(r, ms.filter((m) => m.goal_id === r.id), today));
}

export const getGoal = (ctx: Ctx, raw: unknown): Promise<Result<Goal>> =>
  guard(async () => {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
    const row = await ctx.db.prepare("SELECT module FROM goals WHERE id = ?").bind(id).first<{ module: string }>();
    if (!row) return fail("not_found", "No such goal");
    assertModule(ctx.actor, row.module);
    return ok((await load(ctx, [id], today))[0]);
  });

export const listGoals = (ctx: Ctx, raw: unknown): Promise<Result<{ goals: Goal[]; count: number }>> =>
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
    if (statuses?.length) { where.push(`status IN (${statuses.map(() => "?").join(",")})`); args.push(...statuses); }
    if (v.bool(i.includeArchived, "includeArchived") !== true) where.push("archived_at IS NULL");
    const { results } = await ctx.db.prepare(`SELECT id FROM goals ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY (target_date IS NULL), target_date, created_at LIMIT 200`).bind(...args).all<{ id: string }>();
    let goals = await load(ctx, results.map((r) => r.id), today);
    const term = v.oneOf(i.term, "term", GOAL_TERMS);
    if (term) goals = goals.filter((g) => g.term === term);
    return ok({ goals, count: goals.length });
  });

interface NewGoal { module: string; title: string; description?: string; kind: string; term?: string; targetDate?: string; startValue?: number; targetValue?: number; currentValue?: number; unit?: string; manualProgress?: number; externalId?: string; sourceRef?: string; demo: boolean; milestones: Array<{ title: string; targetDate?: string; targetValue?: number }> }

function parseNew(ctx: Ctx, raw: unknown): NewGoal {
  const i = v.obj(raw, "goal");
  const module = v.moduleId(i.module) ?? defaultModule(ctx.actor);
  assertModule(ctx.actor, module);
  const targetValue = v.num(i.targetValue, "targetValue");
  const startValue = v.num(i.startValue, "startValue");
  const kind = v.oneOf(i.kind, "kind", KINDS, targetValue !== undefined ? "numeric" : "qualitative")!;
  if (kind === "numeric" && (targetValue === undefined || startValue === undefined)) throw new v.InvalidInput("a numeric goal needs startValue and targetValue");
  const ms = Array.isArray(i.milestones) ? i.milestones : i.milestones === undefined ? [] : (() => { throw new v.InvalidInput("milestones must be an array"); })();
  if (ms.length > 30) throw new v.InvalidInput("at most 30 milestones");
  return {
    module, title: v.text(i.title, "title", { max: 200 })!, description: v.text(i.description, "description", { max: 5000, optional: true, allowNewlines: true }), kind,
    term: v.oneOf(i.term, "term", GOAL_TERMS), targetDate: v.date(i.targetDate, "targetDate"), startValue, targetValue,
    currentValue: v.num(i.currentValue, "currentValue") ?? startValue, unit: v.text(i.unit, "unit", { max: 30, optional: true }), manualProgress: v.num(i.manualProgress, "manualProgress", { min: 0, max: 100 }),
    externalId: v.text(i.externalId, "externalId", { max: 200, optional: true }), sourceRef: v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }), demo: v.bool(i.demo, "demo") === true,
    milestones: ms.map((m, n) => { const o = v.obj(m, `milestones[${n}]`); return { title: v.text(o.title, "milestone title", { max: 200 })!, targetDate: v.date(o.targetDate, "milestone targetDate"), targetValue: v.num(o.targetValue, "milestone targetValue") }; }),
  };
}

export const createGoal = (ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<Goal>> =>
  guard(async () => {
    const n = parseNew(ctx, raw);
    return withIdempotency(ctx, "create_goal", idempotencyKey, raw, async () => {
      const src = ctx.actor.type === "integration" ? { kind: ctx.actor.channel === "inbox" ? "assistant" : "integration", name: ctx.actor.label, assistant: ctx.actor.assistant ?? null } : { kind: "manual", name: "Orbis", assistant: null };
      const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
      if (n.externalId) {
        const dup = await ctx.db.prepare("SELECT id FROM goals WHERE source_name = ? AND external_id = ?").bind(src.name, n.externalId).first<{ id: string }>();
        if (dup) return ok((await load(ctx, [dup.id], today))[0], { duplicate: true });
      }
      const id = `gol_${crypto.randomUUID()}`;
      const at = ctx.now().toISOString();
      const stmts = [
        ctx.db.prepare("INSERT INTO goals (id,module,title,description,kind,term,target_date,start_value,target_value,current_value,unit,manual_progress,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id, n.module, n.title, n.description ?? null, n.kind, n.term ?? null, n.targetDate ?? null, n.startValue ?? null, n.targetValue ?? null, n.currentValue ?? null, n.unit ?? null, n.manualProgress ?? null, src.kind, src.name, src.assistant, n.sourceRef ?? null, n.externalId ?? null, n.demo ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label),
        ...n.milestones.map((m, k) => ctx.db.prepare("INSERT INTO goal_milestones (id,goal_id,title,target_date,target_value,sort_order,created_at) VALUES (?,?,?,?,?,?,?)").bind(`mst_${crypto.randomUUID()}`, id, m.title, m.targetDate ?? null, m.targetValue ?? null, k, at)),
        ctx.db.prepare("INSERT INTO goal_progress (goal_id,at,value,progress,note,actor_label,channel) VALUES (?,?,?,?,?,?,?)").bind(id, at, n.currentValue ?? null, 0, "Goal created", ctx.actor.label, ctx.actor.channel),
        auditStmt(ctx, "goal.create", "goal", id),
      ];
      await write(ctx.db, stmts);
      return ok((await load(ctx, [id], today))[0]);
    });
  });

export const updateGoal = (ctx: Ctx, raw: unknown): Promise<Result<Goal>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const id = v.text(i.id, "id", { max: 100 })!;
    const row = await ctx.db.prepare("SELECT * FROM goals WHERE id = ?").bind(id).first<GoalRow>();
    if (!row) return fail("not_found", "No such goal");
    assertModule(ctx.actor, row.module);
    if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Goal changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
    const sets: string[] = [];
    const args: unknown[] = [];
    const set = (col: string, value: unknown) => { sets.push(`${col} = ?`); args.push(value ?? null); };
    if ("title" in i) set("title", v.text(i.title, "title", { max: 200 }));
    if ("description" in i) set("description", i.description === null ? null : v.text(i.description, "description", { max: 5000, allowNewlines: true }));
    if ("module" in i) { const m = v.moduleId(i.module)!; assertModule(ctx.actor, m); set("module", m); }
    if ("term" in i) set("term", i.term === null ? null : v.oneOf(i.term, "term", GOAL_TERMS));
    if ("targetDate" in i) set("target_date", v.date(i.targetDate, "targetDate"));
    if ("targetValue" in i) set("target_value", v.num(i.targetValue, "targetValue"));
    if ("startValue" in i) set("start_value", v.num(i.startValue, "startValue"));
    if ("unit" in i) set("unit", i.unit === null ? null : v.text(i.unit, "unit", { max: 30 }));
    let done = false;
    if ("status" in i) { const s = v.oneOf(i.status, "status", STATUSES)!; set("status", s); done = s === "achieved"; }
    if (!sets.length) return fail("invalid_input", "Nothing to update");
    const at = ctx.now().toISOString();
    await write(ctx.db, [
      ctx.db.prepare(`UPDATE goals SET ${sets.join(", ")}${done ? ", completed_at = COALESCE(completed_at, ?)" : ""}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, ...(done ? [at] : []), at, ctx.actor.label, id),
      auditStmt(ctx, "goal.update", "goal", id),
    ]);
    return ok((await load(ctx, [id], await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v)))[0]);
  });

/** Record progress. Numeric goals take `value`; qualitative goals take `progress` (0-100) or tick milestones. Every entry is kept in the progress history. */
export const updateGoalProgress = (ctx: Ctx, raw: unknown): Promise<Result<Goal>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const id = v.text(i.id, "id", { max: 100 })!;
    const row = await ctx.db.prepare("SELECT * FROM goals WHERE id = ?").bind(id).first<GoalRow>();
    if (!row) return fail("not_found", "No such goal");
    assertModule(ctx.actor, row.module);
    if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Goal changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
    const value = v.num(i.value, "value");
    const progress = v.num(i.progress, "progress", { min: 0, max: 100 });
    const note = v.text(i.note, "note", { max: 500, optional: true, allowNewlines: true });
    if (value === undefined && progress === undefined) throw new v.InvalidInput("provide value (measurable goals) or progress 0-100 (qualitative goals)");
    if (value !== undefined && row.kind !== "numeric") throw new v.InvalidInput("this goal is qualitative: send progress (0-100) or complete milestones");
    const at = ctx.now().toISOString();
    const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
    const col = value !== undefined ? ["current_value", value] : ["manual_progress", progress];
    await write(ctx.db, [
      ctx.db.prepare(`UPDATE goals SET ${col[0]} = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(col[1], at, ctx.actor.label, id),
      auditStmt(ctx, "goal.progress", "goal", id),
    ]);
    const g = (await load(ctx, [id], today))[0];
    await write(ctx.db, [ctx.db.prepare("INSERT INTO goal_progress (goal_id,at,value,progress,note,actor_label,channel) VALUES (?,?,?,?,?,?,?)").bind(id, at, value ?? null, g.progress, note ?? null, ctx.actor.label, ctx.actor.channel)]);
    return ok(g);
  });

export const addMilestone = (ctx: Ctx, raw: unknown): Promise<Result<Goal>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const goalId = v.text(i.goalId, "goalId", { max: 100 })!;
    const row = await ctx.db.prepare("SELECT module FROM goals WHERE id = ?").bind(goalId).first<{ module: string }>();
    if (!row) return fail("not_found", "No such goal");
    assertModule(ctx.actor, row.module);
    const at = ctx.now().toISOString();
    const n = await ctx.db.prepare("SELECT COUNT(*) AS n FROM goal_milestones WHERE goal_id = ?").bind(goalId).first<{ n: number }>();
    if ((n?.n ?? 0) >= 30) throw new v.InvalidInput("at most 30 milestones");
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO goal_milestones (id,goal_id,title,target_date,target_value,sort_order,created_at) VALUES (?,?,?,?,?,?,?)").bind(`mst_${crypto.randomUUID()}`, goalId, v.text(i.title, "title", { max: 200 })!, v.date(i.targetDate, "targetDate") ?? null, v.num(i.targetValue, "targetValue") ?? null, n?.n ?? 0, at),
      ctx.db.prepare("UPDATE goals SET updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(at, ctx.actor.label, goalId),
      auditStmt(ctx, "goal.milestone_add", "goal", goalId),
    ]);
    return ok((await load(ctx, [goalId], await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v)))[0]);
  });

export const setMilestone = (ctx: Ctx, raw: unknown): Promise<Result<Goal>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const id = v.text(i.id, "id", { max: 100 })!;
    const m = await ctx.db.prepare("SELECT m.goal_id, g.module FROM goal_milestones m JOIN goals g ON g.id = m.goal_id WHERE m.id = ?").bind(id).first<{ goal_id: string; module: string }>();
    if (!m) return fail("not_found", "No such milestone");
    assertModule(ctx.actor, m.module);
    const done = v.bool(i.done, "done");
    if (done === undefined) throw new v.InvalidInput("done must be true or false");
    const at = ctx.now().toISOString();
    await write(ctx.db, [
      ctx.db.prepare("UPDATE goal_milestones SET done_at = ? WHERE id = ?").bind(done ? at : null, id),
      ctx.db.prepare("UPDATE goals SET updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(at, ctx.actor.label, m.goal_id),
      auditStmt(ctx, done ? "goal.milestone_done" : "goal.milestone_reopen", "goal", m.goal_id),
    ]);
    const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
    const g = (await load(ctx, [m.goal_id], today))[0];
    await write(ctx.db, [ctx.db.prepare("INSERT INTO goal_progress (goal_id,at,value,progress,note,actor_label,channel) VALUES (?,?,?,?,?,?,?)").bind(m.goal_id, at, null, g.progress, done ? "Milestone completed" : "Milestone reopened", ctx.actor.label, ctx.actor.channel)]);
    return ok(g);
  });

export const goalHistory = (ctx: Ctx, raw: unknown) =>
  guard(async () => {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const row = await ctx.db.prepare("SELECT module FROM goals WHERE id = ?").bind(id).first<{ module: string }>();
    if (!row) return fail("not_found", "No such goal");
    assertModule(ctx.actor, row.module);
    const { results } = await ctx.db.prepare("SELECT at, value, progress, note, actor_label AS actorLabel, channel FROM goal_progress WHERE goal_id = ? ORDER BY id DESC LIMIT 200").bind(id).all();
    return ok({ history: results });
  });

export const archiveGoal = (ctx: Ctx, raw: unknown): Promise<Result<Goal>> =>
  guard(async () => {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const row = await ctx.db.prepare("SELECT * FROM goals WHERE id = ?").bind(id).first<GoalRow>();
    if (!row) return fail("not_found", "No such goal");
    assertModule(ctx.actor, row.module);
    const today = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
    if (row.archived_at) return ok((await load(ctx, [id], today))[0], { duplicate: true });
    if (ctx.actor.type === "integration" && !ctx.approved) return requestApproval(ctx, "goal.archive", `Archive goal "${row.title.slice(0, 80)}"`, { id });
    const at = ctx.now().toISOString();
    await write(ctx.db, [ctx.db.prepare("UPDATE goals SET archived_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(at, at, ctx.actor.label, id), auditStmt(ctx, "goal.archive", "goal", id)]);
    return ok((await load(ctx, [id], today))[0]);
  });
