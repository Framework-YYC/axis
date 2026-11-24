import { addDays } from "../../shared/rotation";
import { HORIZONS, horizonOf, horizonRange, isHorizon, type Horizon } from "../../shared/horizons";
import { nextOccurrence, type Recurrence } from "../../shared/recurrence";
import { assertModule, canAccessModule, defaultModule, Forbidden, moduleFilter } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { withIdempotency } from "./idempotency";
import { prefsOf, resolveToday } from "./prefs";
import { requestApproval } from "./approvals";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const STATUSES = ["pending", "in_progress", "waiting", "completed"] as const;
const BULK_APPROVAL_THRESHOLD = 10;
const BULK_MAX = 100;

export interface TaskRow {
  id: string; title: string; description: string | null; notes: string | null; module: string; category_id: string | null; project: string | null;
  priority: string; status: string; due_date: string | null; due_time: string | null; scheduled_date: string | null; recurrence: string | null; recurrence_parent_id: string | null;
  goal_id: string | null; completed_at: string | null; archived_at: string | null; source_kind: string; source_name: string; source_assistant: string | null; source_ref: string | null;
  external_id: string | null; demo: number; created_at: string; updated_at: string; created_by: string; updated_by: string; version: number;
}

export interface Task {
  id: string; title: string; description: string | null; notes: string | null; module: string; category: string | null; project: string | null;
  priority: string; status: string; dueDate: string | null; dueTime: string | null; scheduledDate: string | null; recurrence: Recurrence | null; recurrenceParentId: string | null;
  goalId: string | null; completedAt: string | null; archivedAt: string | null; horizon: Horizon | null;
  source: { kind: string; name: string; assistant: string | null; ref: string | null }; externalId: string | null; demo: boolean;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; version: number;
}

export function toTask(r: TaskRow, horizon: Horizon | null = null): Task {
  let recurrence: Recurrence | null = null;
  if (r.recurrence) { try { recurrence = JSON.parse(r.recurrence); } catch { recurrence = null; } }
  return {
    id: r.id, title: r.title, description: r.description, notes: r.notes, module: r.module, category: r.category_id, project: r.project, priority: r.priority, status: r.status,
    dueDate: r.due_date, dueTime: r.due_time, scheduledDate: r.scheduled_date, recurrence, recurrenceParentId: r.recurrence_parent_id, goalId: r.goal_id,
    completedAt: r.completed_at, archivedAt: r.archived_at, horizon,
    source: { kind: r.source_kind, name: r.source_name, assistant: r.source_assistant, ref: r.source_ref }, externalId: r.external_id, demo: r.demo === 1,
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, updatedBy: r.updated_by, version: r.version,
  };
}

const PRIORITY_RANK = "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";
const ORDER = `ORDER BY due_date IS NULL, due_date, due_time IS NULL, due_time, ${PRIORITY_RANK}, created_at`;

async function fetchRow(ctx: Ctx, id: string): Promise<TaskRow | null> {
  const row = await ctx.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();
  if (row && !canAccessModule(ctx.actor, row.module)) throw new Forbidden(`This connection cannot access the ${row.module} module`);
  return row;
}

async function resolveCategory(ctx: Ctx, value: unknown): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const name = v.text(value, "category", { max: 80 })!;
  const row = await ctx.db.prepare("SELECT id FROM categories WHERE archived = 0 AND (id = ?1 OR lower(name) = lower(?1))").bind(name).first<{ id: string }>();
  if (!row) throw new v.InvalidInput(`unknown category "${name}"`);
  return row.id;
}

async function checkGoal(ctx: Ctx, goalId: string | null | undefined, module: string): Promise<void> {
  if (!goalId) return;
  const g = await ctx.db.prepare("SELECT module FROM goals WHERE id = ?").bind(goalId).first<{ module: string }>();
  if (!g) throw new v.InvalidInput("goalId does not match a goal");
  if (ctx.actor.modules && g.module !== module) throw new Forbidden("A task can only be linked to a goal in its own module");
}

function eventStmt(ctx: Ctx, taskId: string, event: string, changed: string[]) {
  return ctx.db
    .prepare("INSERT INTO task_events (task_id, at, event, actor_type, actor_label, channel, changed) VALUES (?,?,?,?,?,?,?)")
    .bind(taskId, ctx.now().toISOString(), event, ctx.actor.type, ctx.actor.label, ctx.actor.channel, JSON.stringify(changed));
}

function sourceOf(ctx: Ctx) {
  // The origin comes from the authenticated actor, never from request content.
  return ctx.actor.type === "integration" ? { kind: ctx.actor.channel === "inbox" ? "assistant" : "integration", name: ctx.actor.label, assistant: ctx.actor.assistant ?? null } : { kind: "manual", name: "Axis", assistant: null };
}

// ---------- create ----------

interface NewTask {
  title: string; description?: string; notes?: string; module: string; category: string | null; project?: string; priority: string; status: string;
  dueDate?: string; dueTime?: string; scheduledDate?: string; recurrence: Recurrence | null; externalId?: string; sourceRef?: string; goalId?: string; demo: boolean;
}

async function parseNew(ctx: Ctx, raw: unknown): Promise<NewTask> {
  const i = v.obj(raw, "task");
  const status = v.oneOf(i.status, "status", STATUSES, "pending")!;
  if (status === "completed") throw new v.InvalidInput("create the task first, then complete it with complete_task");
  const module = v.moduleId(i.module) ?? defaultModule(ctx.actor);
  assertModule(ctx.actor, module);
  const n: NewTask = {
    title: v.text(i.title, "title", { max: 300 })!,
    description: v.text(i.description, "description", { max: 5000, optional: true, allowNewlines: true }),
    notes: v.text(i.notes, "notes", { max: 5000, optional: true, allowNewlines: true }),
    module,
    category: (await resolveCategory(ctx, i.category)) ?? null,
    project: v.text(i.project, "project", { max: 120, optional: true }),
    priority: v.oneOf(i.priority, "priority", PRIORITIES, "medium")!,
    status,
    dueDate: v.date(i.dueDate, "dueDate"),
    dueTime: v.time(i.dueTime, "dueTime"),
    scheduledDate: v.date(i.scheduledDate, "scheduledDate"),
    recurrence: v.recurrence(i.recurrence) ?? null,
    externalId: v.text(i.externalId, "externalId", { max: 200, optional: true }),
    sourceRef: v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }),
    goalId: v.text(i.goalId, "goalId", { max: 100, optional: true }),
    demo: v.bool(i.demo, "demo") === true,
  };
  if (n.dueTime && !n.dueDate) throw new v.InvalidInput("dueTime needs a dueDate");
  if (n.recurrence && !n.dueDate) throw new v.InvalidInput("a recurring task needs a dueDate for its first occurrence");
  await checkGoal(ctx, n.goalId, n.module);
  return n;
}

function insertStmt(ctx: Ctx, id: string, n: NewTask, parent: string | null, src: ReturnType<typeof sourceOf>, at: string) {
  return ctx.db
    .prepare(
      "INSERT INTO tasks (id,title,description,notes,module,category_id,project,priority,status,due_date,due_time,scheduled_date,recurrence,recurrence_parent_id,goal_id,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(id, n.title, n.description ?? null, n.notes ?? null, n.module, n.category, n.project ?? null, n.priority, n.status, n.dueDate ?? null, n.dueTime ?? null, n.scheduledDate ?? null,
      n.recurrence ? JSON.stringify(n.recurrence) : null, parent, n.goalId ?? null, src.kind, src.name, src.assistant, n.sourceRef ?? null, n.externalId ?? null, n.demo ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label);
}

async function insertTask(ctx: Ctx, n: NewTask): Promise<Result<Task>> {
  const src = sourceOf(ctx);
  // Duplicate prevention: the sender's own id is authoritative; otherwise integrations may not re-add an identical open task in the same module.
  if (n.externalId) {
    const dup = await ctx.db.prepare("SELECT * FROM tasks WHERE source_name = ? AND external_id = ?").bind(src.name, n.externalId).first<TaskRow>();
    if (dup) return ok(toTask(dup), { duplicate: true });
  } else if (ctx.actor.type === "integration") {
    const dup = await ctx.db
      .prepare("SELECT * FROM tasks WHERE module = ? AND lower(title) = lower(?) AND COALESCE(due_date,'') = ? AND status != 'completed' AND archived_at IS NULL")
      .bind(n.module, n.title, n.dueDate ?? "")
      .first<TaskRow>();
    if (dup) return ok(toTask(dup), { duplicate: true });
  }
  const id = `tsk_${crypto.randomUUID()}`;
  const at = ctx.now().toISOString();
  await write(ctx.db, [insertStmt(ctx, id, n, n.recurrence ? id : null, src, at), eventStmt(ctx, id, "created", []), auditStmt(ctx, "task.create", "task", id)]);
  return ok(toTask((await fetchRow(ctx, id))!));
}

const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};

export const createTask = (ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<Task>> =>
  guard(async () => {
    const n = await parseNew(ctx, raw);
    return withIdempotency(ctx, "create_task", idempotencyKey, raw, () => insertTask(ctx, n));
  });

export interface BulkItem { index: number; ok: boolean; duplicate?: boolean; task?: Task; error?: string }

export const createTasks = (ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<{ created: number; duplicates: number; failed: number; items: BulkItem[] }>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    if (!Array.isArray(i.tasks) || i.tasks.length === 0) return fail("invalid_input", "tasks must be a non-empty array");
    if (i.tasks.length > BULK_MAX) return fail("invalid_input", `at most ${BULK_MAX} tasks per request`);
    const tasks = i.tasks as unknown[];
    if (tasks.length > BULK_APPROVAL_THRESHOLD && ctx.actor.type === "integration" && !ctx.approved) {
      return requestApproval(ctx, "tasks.create_bulk", `Create ${tasks.length} tasks`, { tasks });
    }
    return withIdempotency(ctx, "create_tasks", idempotencyKey, raw, async () => {
      const items: BulkItem[] = [];
      for (const [index, t] of tasks.entries()) {
        try {
          const r = await insertTask(ctx, await parseNew(ctx, t));
          if (r.ok) items.push({ index, ok: true, duplicate: r.duplicate, task: r.data });
        } catch (e) {
          if (e instanceof Forbidden) items.push({ index, ok: false, error: e.message });
          else if (e instanceof v.InvalidInput) items.push({ index, ok: false, error: e.message });
          else throw e;
        }
      }
      const failed = items.filter((x) => !x.ok).length;
      const duplicates = items.filter((x) => x.duplicate).length;
      return ok({ created: items.length - failed - duplicates, duplicates, failed, items });
    });
  });

// ---------- read ----------

export const getTask = (ctx: Ctx, raw: unknown): Promise<Result<Task>> =>
  guard(async () => {
    const row = await fetchRow(ctx, v.text(v.obj(raw, "input").id, "id", { max: 100 })!);
    if (!row) return fail("not_found", "No such task");
    const p = await prefsOf(ctx);
    const today = await resolveToday(ctx, v.obj(raw, "input"), v);
    return ok(toTask(row, row.status === "completed" ? null : horizonOf(row.due_date, today, p.weekStart)));
  });

export interface ListOptions { statusNot?: string[]; completedOnly?: boolean; overdueOn?: string; today?: string }

export const listTasks = (ctx: Ctx, raw: unknown, forced: ListOptions = {}): Promise<Result<{ tasks: Task[]; count: number; today: string }>> =>
  guard(async () => {
    const i = v.obj(raw ?? {}, "input");
    const prefs = await prefsOf(ctx);
    const today = forced.today ?? (await resolveToday(ctx, i, v));
    const where: string[] = [];
    const args: unknown[] = [];
    const statuses = v.stringList(i.status, "status", STATUSES);
    if (statuses?.length) { where.push(`status IN (${statuses.map(() => "?").join(",")})`); args.push(...statuses); }
    const priorities = v.stringList(i.priority, "priority", PRIORITIES);
    if (priorities?.length) { where.push(`priority IN (${priorities.map(() => "?").join(",")})`); args.push(...priorities); }
    // Module separation: an assistant only ever sees its own module, whatever it asks for.
    const allowed = moduleFilter(ctx.actor);
    const asked = i.module === undefined ? null : (Array.isArray(i.module) ? i.module : [i.module]).map((m) => v.moduleId(m)!);
    const mods = asked ? (allowed ? asked.filter((m) => allowed.includes(m)) : asked) : allowed;
    if (asked && allowed && mods && mods.length < asked.length) throw new Forbidden("This connection cannot access that module");
    if (mods) { where.push(mods.length ? `module IN (${mods.map(() => "?").join(",")})` : "0 = 1"); args.push(...mods); }
    if (i.category !== undefined) { where.push("category_id = ?"); args.push(await resolveCategory(ctx, i.category)); }
    const goalId = v.text(i.goalId, "goalId", { max: 100, optional: true }); if (goalId) { where.push("goal_id = ?"); args.push(goalId); }
    const from = v.date(i.dueFrom, "dueFrom"); if (from) { where.push("due_date >= ?"); args.push(from); }
    const to = v.date(i.dueTo, "dueTo"); if (to) { where.push("due_date <= ?"); args.push(to); }
    const horizons = (i.horizon === undefined ? [] : Array.isArray(i.horizon) ? i.horizon : [i.horizon]).map((h) => { if (!isHorizon(h)) throw new v.InvalidInput(`horizon must be one of: ${HORIZONS.join(", ")}`); return h; });
    if (horizons.length) {
      const parts: string[] = [];
      for (const h of horizons) {
        const r = horizonRange(h, today, prefs.weekStart);
        if (r.empty) continue;
        if (r.undated) { parts.push("due_date IS NULL"); continue; }
        const c: string[] = [];
        if (r.from) { c.push("due_date >= ?"); args.push(r.from); }
        if (r.to) { c.push("due_date <= ?"); args.push(r.to); }
        parts.push(`(${c.join(" AND ")})`);
      }
      where.push(parts.length ? `(${parts.join(" OR ")})` : "0 = 1");
      if (!statuses?.length) where.push("status != 'completed'"); // horizons describe open work
    }
    const q = v.text(i.q, "q", { max: 100, optional: true });
    if (q) { where.push("(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"); const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`; args.push(like, like, like); }
    if (v.bool(i.includeArchived, "includeArchived") !== true) where.push("archived_at IS NULL");
    if (forced.statusNot?.length) { where.push(`status NOT IN (${forced.statusNot.map(() => "?").join(",")})`); args.push(...forced.statusNot); }
    if (forced.overdueOn) { where.push("due_date < ?"); args.push(forced.overdueOn); }
    const limit = v.int(i.limit, "limit", { min: 1, max: 500, fallback: 100 });
    let order = ORDER;
    if (forced.completedOnly) {
      where.push("status = 'completed'");
      const since = v.date(i.since, "since"); if (since) { where.push("completed_at >= ?"); args.push(`${since}T00:00:00.000Z`); }
      order = "ORDER BY completed_at DESC";
    }
    const sql = `SELECT * FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""} ${order} LIMIT ?`;
    const { results } = await ctx.db.prepare(sql).bind(...args, limit).all<TaskRow>();
    const tasks = results.map((r) => toTask(r, r.status === "completed" ? null : horizonOf(r.due_date, today, prefs.weekStart)));
    return ok({ tasks, count: tasks.length, today });
  });

export const getOverdueTasks = (ctx: Ctx, raw: unknown) =>
  guard(async () => {
    const today = await resolveToday(ctx, v.obj(raw ?? {}, "input"), v);
    return listTasks(ctx, raw, { statusNot: ["completed"], overdueOn: today, today });
  });
export const getCompletedTasks = (ctx: Ctx, raw: unknown) => listTasks(ctx, raw, { completedOnly: true });

/** The outstanding-task briefing: completed and archived tasks are never in it. Optionally limited to one module (assistants are always limited to their own). */
export const getDailySummary = (ctx: Ctx, raw: unknown) =>
  guard(async () => {
    const i = v.obj(raw ?? {}, "input");
    const today = await resolveToday(ctx, i, v);
    const prefs = await prefsOf(ctx);
    const base = { today, limit: 500, includeArchived: false, ...(i.module !== undefined ? { module: i.module } : {}) };
    const open = await listTasks(ctx, { ...base, status: ["pending", "in_progress", "waiting"] }, { today });
    if (!open.ok) return open;
    const all = open.data.tasks;
    const byH = (h: Horizon) => all.filter((t) => horizonOf(t.dueDate, today, prefs.weekStart) === h);
    const counts = Object.fromEntries(HORIZONS.map((h) => [h, byH(h).length])) as Record<Horizon, number>;
    const done = await listTasks(ctx, { ...base, since: addDays(today, -6) }, { today, completedOnly: true });
    const overdue = byH("overdue"), dueToday = byH("today"), tomorrow = byH("tomorrow"), thisWeek = byH("this_week");
    return ok({
      date: today, timezone: prefs.timezone,
      overdue, dueToday, tomorrow, thisWeek,
      inProgress: all.filter((t) => t.status === "in_progress"),
      upcomingWeek: [...tomorrow, ...thisWeek],
      unscheduledInbox: counts.someday,
      counts, openCount: all.length,
      completedRecently: done.ok ? done.data.count : 0,
      outstandingCount: overdue.length + dueToday.length,
      modules: { tasks: "available" },
    });
  });

// ---------- change ----------

export const updateTask = (ctx: Ctx, raw: unknown): Promise<Result<Task>> =>
  guard(async () => {
    const i = v.obj(raw, "input");
    const id = v.text(i.id, "id", { max: 100 })!;
    const row = await fetchRow(ctx, id);
    if (!row) return fail("not_found", "No such task");
    if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Task changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
    const sets: string[] = [];
    const args: unknown[] = [];
    const changed: string[] = [];
    const set = (col: string, field: string, value: unknown) => { sets.push(`${col} = ?`); args.push(value ?? null); changed.push(field); };
    if ("title" in i) set("title", "title", v.text(i.title, "title", { max: 300 }));
    if ("description" in i) set("description", "description", i.description === null ? null : v.text(i.description, "description", { max: 5000, allowNewlines: true }));
    if ("notes" in i) set("notes", "notes", i.notes === null ? null : v.text(i.notes, "notes", { max: 5000, allowNewlines: true }));
    let module = row.module;
    if ("module" in i) { module = v.moduleId(i.module) ?? row.module; assertModule(ctx.actor, module); set("module", "module", module); }
    if ("category" in i) set("category_id", "category", await resolveCategory(ctx, i.category));
    if ("project" in i) set("project", "project", i.project === null ? null : v.text(i.project, "project", { max: 120 }));
    if ("priority" in i) set("priority", "priority", v.oneOf(i.priority, "priority", PRIORITIES));
    if ("status" in i) {
      const s = v.oneOf(i.status, "status", STATUSES);
      if (s === "completed") throw new v.InvalidInput("use complete_task to complete a task");
      if (row.status === "completed") throw new v.InvalidInput("use reopen_task to reopen a completed task");
      set("status", "status", s);
    }
    const dueDate = "dueDate" in i ? v.date(i.dueDate, "dueDate") : undefined;
    if ("dueDate" in i) set("due_date", "dueDate", dueDate);
    if ("dueTime" in i) { const t = v.time(i.dueTime, "dueTime"); if (t && !(("dueDate" in i ? dueDate : row.due_date))) throw new v.InvalidInput("dueTime needs a dueDate"); set("due_time", "dueTime", t); }
    if ("scheduledDate" in i) set("scheduled_date", "scheduledDate", v.date(i.scheduledDate, "scheduledDate"));
    if ("recurrence" in i) {
      const r = v.recurrence(i.recurrence);
      if (r && !(("dueDate" in i ? dueDate : row.due_date))) throw new v.InvalidInput("a recurring task needs a dueDate");
      set("recurrence", "recurrence", r ? JSON.stringify(r) : null);
      if (r && !row.recurrence_parent_id) { sets.push("recurrence_parent_id = ?"); args.push(row.id); }
    }
    if ("goalId" in i) { const g = i.goalId === null ? null : v.text(i.goalId, "goalId", { max: 100 })!; await checkGoal(ctx, g, module); set("goal_id", "goalId", g); }
    if (!sets.length) return fail("invalid_input", "Nothing to update");
    await write(ctx.db, [
      ctx.db.prepare(`UPDATE tasks SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, ctx.now().toISOString(), ctx.actor.label, id),
      eventStmt(ctx, id, "updated", changed),
      auditStmt(ctx, "task.update", "task", id),
    ]);
    return ok(toTask((await fetchRow(ctx, id))!));
  });

async function transition(ctx: Ctx, raw: unknown, kind: "completed" | "reopened" | "archived"): Promise<Result<Task & { next?: { id: string; dueDate: string } | null }>> {
  return guard(async () => {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const row = await fetchRow(ctx, id);
    if (!row) return fail("not_found", "No such task");
    const at = ctx.now().toISOString();
    const stmts: D1PreparedStatement[] = [];
    let next: { id: string; dueDate: string } | null = null;
    if (kind === "completed") {
      if (row.status === "completed") return ok(toTask(row), { duplicate: true }); // already done: success, no second history entry
      stmts.push(ctx.db.prepare("UPDATE tasks SET status='completed', completed_at=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, at, ctx.actor.label, id));
      stmts.push(eventStmt(ctx, id, "completed", []), auditStmt(ctx, "task.complete", "task", id));
      if (row.recurrence && !row.archived_at) {
        let rule: Recurrence | null = null;
        try { rule = JSON.parse(row.recurrence); } catch { rule = null; }
        const todayLocal = await resolveToday(ctx, (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>, v);
        const date = rule ? nextOccurrence(rule, row.due_date ?? todayLocal, todayLocal) : null;
        if (rule && date) {
          const parent = row.recurrence_parent_id ?? row.id;
          const nid = `tsk_${crypto.randomUUID()}`;
          // INSERT OR IGNORE plus the unique index on (series, due date) makes a duplicate occurrence impossible, even if this runs twice.
          stmts.push(ctx.db.prepare(
            "INSERT OR IGNORE INTO tasks (id,title,description,notes,module,category_id,project,priority,status,due_date,due_time,scheduled_date,recurrence,recurrence_parent_id,goal_id,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) SELECT ?,title,description,notes,module,category_id,project,priority,'pending',?,due_time,NULL,recurrence,?,goal_id,source_kind,source_name,source_assistant,source_ref,NULL,demo,?,?,?,? FROM tasks WHERE id = ?",
          ).bind(nid, date, parent, at, at, ctx.actor.label, ctx.actor.label, id));
          stmts.push(ctx.db.prepare("INSERT INTO task_events (task_id, at, event, actor_type, actor_label, channel, changed) SELECT ?,?,'created',?,?,?,'[\"recurrence\"]' WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ?)").bind(nid, at, ctx.actor.type, ctx.actor.label, ctx.actor.channel, nid));
          next = { id: nid, dueDate: date };
        }
      }
    } else if (kind === "reopened") {
      if (row.status !== "completed") return ok(toTask(row), { duplicate: true });
      stmts.push(ctx.db.prepare("UPDATE tasks SET status='pending', completed_at=NULL, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, ctx.actor.label, id));
      stmts.push(eventStmt(ctx, id, "reopened", []), auditStmt(ctx, "task.reopen", "task", id));
    } else {
      if (row.archived_at) return ok(toTask(row), { duplicate: true });
      if (ctx.actor.type === "integration" && !ctx.approved) return requestApproval(ctx, "task.archive", `Archive task "${row.title.slice(0, 80)}"`, { id });
      stmts.push(ctx.db.prepare("UPDATE tasks SET archived_at=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, at, ctx.actor.label, id));
      stmts.push(eventStmt(ctx, id, "archived", []), auditStmt(ctx, "task.archive", "task", id));
    }
    await write(ctx.db, stmts);
    const fresh = toTask((await fetchRow(ctx, id))!);
    if (next) {
      const made = await ctx.db.prepare("SELECT id FROM tasks WHERE id = ?").bind(next.id).first();
      if (!made) { // the occurrence for that date already existed (created earlier): report that one
        const existing = await ctx.db.prepare("SELECT id, due_date FROM tasks WHERE recurrence_parent_id = ? AND due_date = ?").bind(row.recurrence_parent_id ?? row.id, next.dueDate).first<{ id: string; due_date: string }>();
        next = existing ? { id: existing.id, dueDate: existing.due_date } : null;
      }
    }
    return ok(kind === "completed" ? { ...fresh, next } : fresh);
  });
}
export const completeTask = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "completed");
export const reopenTask = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "reopened");
export const archiveTask = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "archived");

export const taskHistory = (ctx: Ctx, raw: unknown) =>
  guard(async () => {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    if (!(await fetchRow(ctx, id))) return fail("not_found", "No such task");
    const { results } = await ctx.db.prepare("SELECT at, event, actor_type AS actorType, actor_label AS actorLabel, channel, changed FROM task_events WHERE task_id = ? ORDER BY id").bind(id).all();
    return ok({ events: results });
  });
