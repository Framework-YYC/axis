import { auditStmt } from "./audit";
import { withIdempotency } from "./idempotency";
import { requestApproval } from "./approvals";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const STATUSES = ["pending", "in_progress", "waiting", "completed"] as const;
const BULK_APPROVAL_THRESHOLD = 10;
const BULK_MAX = 100;

interface Row {
  id: string; title: string; notes: string | null; category_id: string | null; project: string | null;
  priority: string; status: string; due_date: string | null; scheduled_date: string | null;
  completed_at: string | null; archived_at: string | null; source_kind: string; source_name: string; external_id: string | null;
  created_at: string; updated_at: string; created_by: string; updated_by: string; version: number;
}

export interface Task {
  id: string; title: string; notes: string | null; category: string | null; project: string | null;
  priority: string; status: string; dueDate: string | null; scheduledDate: string | null;
  completedAt: string | null; archivedAt: string | null;
  source: { kind: string; name: string }; externalId: string | null;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; version: number;
}

const toTask = (r: Row): Task => ({
  id: r.id, title: r.title, notes: r.notes, category: r.category_id, project: r.project, priority: r.priority, status: r.status,
  dueDate: r.due_date, scheduledDate: r.scheduled_date, completedAt: r.completed_at, archivedAt: r.archived_at,
  source: { kind: r.source_kind, name: r.source_name }, externalId: r.external_id,
  createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by, updatedBy: r.updated_by, version: r.version,
});

const PRIORITY_RANK = "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";
const ORDER = `ORDER BY due_date IS NULL, due_date, ${PRIORITY_RANK}, created_at`;

async function fetchRow(ctx: Ctx, id: string): Promise<Row | null> {
  return ctx.db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Row>();
}

async function resolveCategory(ctx: Ctx, value: unknown): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const name = v.text(value, "category", { max: 80 })!;
  const row = await ctx.db.prepare("SELECT id FROM categories WHERE archived = 0 AND (id = ?1 OR lower(name) = lower(?1))").bind(name).first<{ id: string }>();
  if (!row) throw new v.InvalidInput(`unknown category "${name}"`);
  return row.id;
}

function eventStmt(ctx: Ctx, taskId: string, event: string, changed: string[]) {
  return ctx.db
    .prepare("INSERT INTO task_events (task_id, at, event, actor_type, actor_label, channel, changed) VALUES (?,?,?,?,?,?,?)")
    .bind(taskId, ctx.now().toISOString(), event, ctx.actor.type, ctx.actor.label, ctx.actor.channel, JSON.stringify(changed));
}

/** Resolves "today" without guessing: an explicit date, else the given IANA timezone, else UTC. */
export function resolveToday(ctx: Ctx, input: Record<string, unknown>): string {
  const explicit = v.date(input.today, "today");
  if (explicit) return explicit;
  const tz = typeof input.timezone === "string" ? input.timezone : "UTC";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ctx.now());
  } catch {
    throw new v.InvalidInput("timezone must be a valid IANA timezone");
  }
}

// ---------- create ----------

interface NewTask {
  title: string; notes?: string; category: string | null; project?: string; priority: string; status: string;
  dueDate?: string; scheduledDate?: string; externalId?: string;
}

async function parseNew(ctx: Ctx, raw: unknown): Promise<NewTask> {
  const i = v.obj(raw, "task");
  const status = v.oneOf(i.status, "status", STATUSES, "pending")!;
  if (status === "completed") throw new v.InvalidInput("create the task first, then complete it with complete_task");
  return {
    title: v.text(i.title, "title", { max: 300 })!,
    notes: v.text(i.notes, "notes", { max: 5000, optional: true, allowNewlines: true }),
    category: (await resolveCategory(ctx, i.category)) ?? null,
    project: v.text(i.project, "project", { max: 120, optional: true }),
    priority: v.oneOf(i.priority, "priority", PRIORITIES, "medium")!,
    status,
    dueDate: v.date(i.dueDate, "dueDate"),
    scheduledDate: v.date(i.scheduledDate, "scheduledDate"),
    externalId: v.text(i.externalId, "externalId", { max: 200, optional: true }),
  };
}

function sourceOf(ctx: Ctx) {
  // The originating assistant is the integration's own name, taken from the authenticated token, never from request content.
  return ctx.actor.type === "integration" ? { kind: "integration", name: ctx.actor.label } : { kind: "manual", name: "Axis" };
}

async function insertTask(ctx: Ctx, n: NewTask): Promise<Result<Task>> {
  const src = sourceOf(ctx);
  // Duplicate prevention: the sender's own id is authoritative; otherwise integrations may not re-add an identical open task.
  if (n.externalId) {
    const dup = await ctx.db.prepare("SELECT * FROM tasks WHERE source_name = ? AND external_id = ?").bind(src.name, n.externalId).first<Row>();
    if (dup) return ok(toTask(dup), { duplicate: true });
  } else if (ctx.actor.type === "integration") {
    const dup = await ctx.db
      .prepare("SELECT * FROM tasks WHERE lower(title) = lower(?) AND COALESCE(due_date,'') = ? AND status != 'completed' AND archived_at IS NULL")
      .bind(n.title, n.dueDate ?? "")
      .first<Row>();
    if (dup) return ok(toTask(dup), { duplicate: true });
  }
  const id = `tsk_${crypto.randomUUID()}`;
  const at = ctx.now().toISOString();
  await ctx.db.batch([
    ctx.db
      .prepare("INSERT INTO tasks (id,title,notes,category_id,project,priority,status,due_date,scheduled_date,source_kind,source_name,external_id,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, n.title, n.notes ?? null, n.category, n.project ?? null, n.priority, n.status, n.dueDate ?? null, n.scheduledDate ?? null, src.kind, src.name, n.externalId ?? null, at, at, ctx.actor.label, ctx.actor.label),
    eventStmt(ctx, id, "created", []),
    auditStmt(ctx, "task.create", "task", id),
  ]);
  return ok(toTask((await fetchRow(ctx, id))!));
}

export async function createTask(ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<Task>> {
  try {
    const n = await parseNew(ctx, raw);
    return await withIdempotency(ctx, "create_task", idempotencyKey, raw, () => insertTask(ctx, n));
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

export interface BulkItem { index: number; ok: boolean; duplicate?: boolean; task?: Task; error?: string }

export async function createTasks(ctx: Ctx, raw: unknown, idempotencyKey?: string): Promise<Result<{ created: number; duplicates: number; failed: number; items: BulkItem[] }>> {
  try {
    const i = v.obj(raw, "input");
    if (!Array.isArray(i.tasks) || i.tasks.length === 0) return fail("invalid_input", "tasks must be a non-empty array");
    if (i.tasks.length > BULK_MAX) return fail("invalid_input", `at most ${BULK_MAX} tasks per request`);
    const tasks = i.tasks as unknown[];
    if (tasks.length > BULK_APPROVAL_THRESHOLD && ctx.actor.type === "integration" && !ctx.approved) {
      return requestApproval(ctx, "tasks.create_bulk", `Create ${tasks.length} tasks`, { tasks });
    }
    return await withIdempotency(ctx, "create_tasks", idempotencyKey, raw, async () => {
      const items: BulkItem[] = [];
      for (const [index, t] of tasks.entries()) {
        try {
          const r = await insertTask(ctx, await parseNew(ctx, t));
          if (r.ok) items.push({ index, ok: true, duplicate: r.duplicate, task: r.data });
        } catch (e) {
          if (!(e instanceof v.InvalidInput)) throw e;
          items.push({ index, ok: false, error: e.message });
        }
      }
      const failed = items.filter((x) => !x.ok).length;
      const duplicates = items.filter((x) => x.duplicate).length;
      return ok({ created: items.length - failed - duplicates, duplicates, failed, items });
    });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

// ---------- read ----------

export async function getTask(ctx: Ctx, raw: unknown): Promise<Result<Task>> {
  try {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const row = await fetchRow(ctx, id);
    return row ? ok(toTask(row)) : fail("not_found", "No such task");
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

export async function listTasks(ctx: Ctx, raw: unknown, forced: { statusNot?: string[]; completedOnly?: boolean; overdueOn?: string } = {}): Promise<Result<{ tasks: Task[]; count: number }>> {
  try {
    const i = v.obj(raw ?? {}, "input");
    const where: string[] = [];
    const args: unknown[] = [];
    const statuses = v.stringList(i.status, "status", STATUSES);
    if (statuses?.length) { where.push(`status IN (${statuses.map(() => "?").join(",")})`); args.push(...statuses); }
    const priorities = v.stringList(i.priority, "priority", PRIORITIES);
    if (priorities?.length) { where.push(`priority IN (${priorities.map(() => "?").join(",")})`); args.push(...priorities); }
    if (i.category !== undefined) { where.push("category_id = ?"); args.push(await resolveCategory(ctx, i.category)); }
    const from = v.date(i.dueFrom, "dueFrom"); if (from) { where.push("due_date >= ?"); args.push(from); }
    const to = v.date(i.dueTo, "dueTo"); if (to) { where.push("due_date <= ?"); args.push(to); }
    const q = v.text(i.q, "q", { max: 100, optional: true });
    if (q) { where.push("(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')"); const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`; args.push(like, like); }
    if (v.bool(i.includeArchived, "includeArchived") !== true) where.push("archived_at IS NULL");
    if (forced.statusNot?.length) { where.push(`status NOT IN (${forced.statusNot.map(() => "?").join(",")})`); args.push(...forced.statusNot); }
    if (forced.overdueOn) { where.push("due_date < ?"); args.push(forced.overdueOn); }
    const limit = v.int(i.limit, "limit", { min: 1, max: 200, fallback: 50 });
    let order = ORDER;
    if (forced.completedOnly) {
      where.push("status = 'completed'");
      const since = v.date(i.since, "since"); if (since) { where.push("completed_at >= ?"); args.push(`${since}T00:00:00.000Z`); }
      order = "ORDER BY completed_at DESC";
    }
    const sql = `SELECT * FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""} ${order} LIMIT ?`;
    const { results } = await ctx.db.prepare(sql).bind(...args, limit).all<Row>();
    const tasks = results.map(toTask);
    return ok({ tasks, count: tasks.length });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

export const getOverdueTasks = (ctx: Ctx, raw: unknown) => {
  try {
    return listTasks(ctx, raw, { statusNot: ["completed"], overdueOn: resolveToday(ctx, v.obj(raw ?? {}, "input")) });
  } catch (e) {
    if (e instanceof v.InvalidInput) return Promise.resolve(fail("invalid_input", e.message));
    throw e;
  }
};
export const getCompletedTasks = (ctx: Ctx, raw: unknown) => listTasks(ctx, raw, { completedOnly: true });

/** The outstanding-task briefing: completed and archived tasks are never in it. */
export async function getDailySummary(ctx: Ctx, raw: unknown) {
  try {
    const i = v.obj(raw ?? {}, "input");
    const today = resolveToday(ctx, i);
    const open = "status != 'completed' AND archived_at IS NULL";
    const q = async (cond: string, ...a: unknown[]) => (await ctx.db.prepare(`SELECT * FROM tasks WHERE ${open} AND ${cond} ${ORDER} LIMIT 50`).bind(...a).all<Row>()).results.map(toTask);
    const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const [overdue, dueToday, inProgress, upcoming, inbox] = await Promise.all([
      q("due_date < ?", today), q("due_date = ?", today), q("status = 'in_progress'"),
      q("due_date > ? AND due_date <= ?", today, weekEnd),
      ctx.db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${open} AND due_date IS NULL AND scheduled_date IS NULL`).first<{ n: number }>(),
    ]);
    const completedToday = await ctx.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?").bind(`${today}T00:00:00.000Z`, `${weekEnd}T00:00:00.000Z`).first<{ n: number }>();
    return ok({
      date: today, overdue, dueToday, inProgress, upcomingWeek: upcoming, unscheduledInbox: inbox?.n ?? 0,
      completedRecently: completedToday?.n ?? 0,
      outstandingCount: overdue.length + dueToday.length,
      modules: { tasks: "available", finance: "not_available", health: "not_available", calendar: "not_available" },
    });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

// ---------- change ----------

export async function updateTask(ctx: Ctx, raw: unknown): Promise<Result<Task>> {
  try {
    const i = v.obj(raw, "input");
    const id = v.text(i.id, "id", { max: 100 })!;
    const row = await fetchRow(ctx, id);
    if (!row) return fail("not_found", "No such task");
    if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Task changed since version ${String(i.expectedVersion)}; current version is ${row.version}`);
    const sets: string[] = [];
    const args: unknown[] = [];
    const changed: string[] = [];
    const set = (col: string, field: string, value: unknown) => { sets.push(`${col} = ?`); args.push(value ?? null); changed.push(field); };
    if ("title" in i) set("title", "title", v.text(i.title, "title", { max: 300 }));
    if ("notes" in i) set("notes", "notes", i.notes === null ? null : v.text(i.notes, "notes", { max: 5000, allowNewlines: true }));
    if ("category" in i) set("category_id", "category", await resolveCategory(ctx, i.category));
    if ("project" in i) set("project", "project", i.project === null ? null : v.text(i.project, "project", { max: 120 }));
    if ("priority" in i) set("priority", "priority", v.oneOf(i.priority, "priority", PRIORITIES));
    if ("status" in i) {
      const s = v.oneOf(i.status, "status", STATUSES);
      if (s === "completed") throw new v.InvalidInput("use complete_task to complete a task");
      if (row.status === "completed") throw new v.InvalidInput("use reopen_task to reopen a completed task");
      set("status", "status", s);
    }
    if ("dueDate" in i) set("due_date", "dueDate", v.date(i.dueDate, "dueDate"));
    if ("scheduledDate" in i) set("scheduled_date", "scheduledDate", v.date(i.scheduledDate, "scheduledDate"));
    if (!sets.length) return fail("invalid_input", "Nothing to update");
    await ctx.db.batch([
      ctx.db.prepare(`UPDATE tasks SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, ctx.now().toISOString(), ctx.actor.label, id),
      eventStmt(ctx, id, "updated", changed),
      auditStmt(ctx, "task.update", "task", id),
    ]);
    return ok(toTask((await fetchRow(ctx, id))!));
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

async function transition(ctx: Ctx, raw: unknown, kind: "completed" | "reopened" | "archived"): Promise<Result<Task>> {
  try {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const row = await fetchRow(ctx, id);
    if (!row) return fail("not_found", "No such task");
    const at = ctx.now().toISOString();
    const stmts: D1PreparedStatement[] = [];
    if (kind === "completed") {
      if (row.status === "completed") return ok(toTask(row), { duplicate: true }); // already done: success, no second history entry
      stmts.push(ctx.db.prepare("UPDATE tasks SET status='completed', completed_at=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, at, ctx.actor.label, id));
    } else if (kind === "reopened") {
      if (row.status !== "completed") return ok(toTask(row), { duplicate: true });
      stmts.push(ctx.db.prepare("UPDATE tasks SET status='pending', completed_at=NULL, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, ctx.actor.label, id));
    } else {
      if (row.archived_at) return ok(toTask(row), { duplicate: true });
      if (ctx.actor.type === "integration" && !ctx.approved) {
        return requestApproval(ctx, "task.archive", `Archive task "${row.title.slice(0, 80)}"`, { id });
      }
      stmts.push(ctx.db.prepare("UPDATE tasks SET archived_at=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, at, ctx.actor.label, id));
    }
    stmts.push(eventStmt(ctx, id, kind, []), auditStmt(ctx, `task.${kind === "completed" ? "complete" : kind === "reopened" ? "reopen" : "archive"}`, "task", id));
    await ctx.db.batch(stmts);
    return ok(toTask((await fetchRow(ctx, id))!));
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}
export const completeTask = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "completed");
export const reopenTask = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "reopened");
export const archiveTask = (ctx: Ctx, raw: unknown) => transition(ctx, raw, "archived");

export async function taskHistory(ctx: Ctx, raw: unknown) {
  try {
    const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
    const { results } = await ctx.db.prepare("SELECT at, event, actor_type AS actorType, actor_label AS actorLabel, channel, changed FROM task_events WHERE task_id = ? ORDER BY id").bind(id).all();
    return ok({ events: results });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}
