import { effectiveStage, stageIndex, STAGES, type Stage } from "../../shared/procurement";
import { assertModule, canAccessModule, defaultModule, Forbidden, moduleFilter } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { deliveryDeadline } from "../../shared/taskTypes";
import { eventStmt, fetchRow, PRIORITIES, sourceOf, upsertActionItem } from "./tasks";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

interface Row {
  id: string; module: string; material: string; description: string | null; quantity: number | null; unit: string | null; supplier: string | null; order_ref: string | null; status: string;
  requested_on: string | null; ordered_on: string | null; in_transit_on: string | null; notified_on: string | null; received_on: string | null; expected_date: string | null; expected_time: string | null;
  notification_task_id: string | null; priority: string; notes: string | null; source_kind: string; source_name: string; source_assistant: string | null; source_ref: string | null; external_id: string | null;
  demo: number; archived_at: string | null; created_at: string; updated_at: string; created_by: string; updated_by: string; version: number;
  n_status?: string | null; n_due?: string | null; n_time?: string | null;
}
export interface ProcItem {
  id: string; module: string; material: string; description: string | null; quantity: number | null; unit: string | null; supplier: string | null; orderRef: string | null;
  status: Stage; storedStatus: string; requestedOn: string | null; orderedOn: string | null; inTransitOn: string | null; notifiedOn: string | null; receivedOn: string | null;
  expectedDate: string | null; expectedTime: string | null; notificationTaskId: string | null; notification: { status: string; dueDate: string | null; dueTime: string | null } | null;
  priority: string; notes: string | null; source: { kind: string; name: string; assistant: string | null; ref: string | null }; externalId: string | null; demo: boolean; archivedAt: string | null;
  createdAt: string; updatedAt: string; version: number;
}
const toItem = (r: Row): ProcItem => ({
  id: r.id, module: r.module, material: r.material, description: r.description, quantity: r.quantity, unit: r.unit, supplier: r.supplier, orderRef: r.order_ref,
  status: effectiveStage(r.status, r.n_status === "completed"), storedStatus: r.status, requestedOn: r.requested_on, orderedOn: r.ordered_on, inTransitOn: r.in_transit_on, notifiedOn: r.notified_on, receivedOn: r.received_on,
  expectedDate: r.expected_date, expectedTime: r.expected_time, notificationTaskId: r.notification_task_id, notification: r.notification_task_id && r.n_status ? { status: r.n_status, dueDate: r.n_due ?? null, dueTime: r.n_time ?? null } : null,
  priority: r.priority, notes: r.notes, source: { kind: r.source_kind, name: r.source_name, assistant: r.source_assistant, ref: r.source_ref }, externalId: r.external_id, demo: r.demo === 1, archivedAt: r.archived_at,
  createdAt: r.created_at, updatedAt: r.updated_at, version: r.version,
});
const SELECT = "SELECT p.*, t.status AS n_status, t.due_date AS n_due, t.due_time AS n_time FROM procurement_items p LEFT JOIN tasks t ON t.id = p.notification_task_id";
const dateOf = (ctx: Ctx) => ctx.now().toISOString().slice(0, 10);
const stageCol: Record<string, string> = { requested: "requested_on", ordered: "ordered_on", in_transit: "in_transit_on", notified: "notified_on", received: "received_on" };

const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};
async function fetchItem(ctx: Ctx, id: string): Promise<Row | null> {
  const r = await ctx.db.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first<Row>();
  if (r && !canAccessModule(ctx.actor, r.module)) throw new Forbidden(`This connection cannot access the ${r.module} module`);
  return r;
}

export const listProcurement = (ctx: Ctx, raw: unknown): Promise<Result<{ items: ProcItem[]; count: number }>> => guard(async () => {
  const i = v.obj(raw ?? {}, "input");
  const where: string[] = []; const args: unknown[] = [];
  const mods = moduleFilter(ctx.actor); const asked = i.module === undefined ? null : [v.moduleId(i.module)!];
  const use = asked ? (mods ? asked.filter((m) => mods.includes(m)) : asked) : mods;
  if (use) { where.push(use.length ? `p.module IN (${use.map(() => "?").join(",")})` : "0 = 1"); args.push(...use); }
  const statuses = v.stringList(i.status, "status", STAGES);
  if (statuses?.length) { where.push(`p.status IN (${statuses.map(() => "?").join(",")})`); args.push(...statuses); }
  if (v.bool(i.includeReceived, "includeReceived") === false) where.push("p.status != 'received'");
  if (v.bool(i.includeArchived, "includeArchived") !== true) where.push("p.archived_at IS NULL");
  const limit = v.int(i.limit, "limit", { min: 1, max: 500, fallback: 200 });
  const { results } = await ctx.db.prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.expected_date IS NULL, p.expected_date, p.created_at LIMIT ?`).bind(...args, limit).all<Row>();
  const items = results.map(toItem);
  return ok({ items, count: items.length });
});

interface Fields {
  material?: string; description?: string | null; quantity?: number | null; unit?: string | null; supplier?: string | null; orderRef?: string | null; status?: Stage;
  expectedDate?: string | null; expectedTime?: string | null; priority?: string; notes?: string | null; sourceRef?: string;
}
function parseFields(i: Record<string, unknown>, requireMaterial: boolean): Fields {
  const f: Fields = {};
  const has = (n: string) => i[n] !== undefined;
  const nullable = (name: string, max: number) => (has(name) ? (i[name] === null ? null : v.text(i[name], name, { max, allowNewlines: name === "notes" || name === "description" })!) : undefined);
  const m = i.material === undefined ? (i.title === undefined ? undefined : v.text(i.title, "material", { max: 200 })) : v.text(i.material, "material", { max: 200 });
  if (m === undefined && requireMaterial) throw new v.InvalidInput("material is required");
  if (m !== undefined) f.material = m;
  f.description = nullable("description", 2000); f.supplier = nullable("supplier", 200); f.orderRef = nullable("orderRef", 100); f.unit = nullable("unit", 30); f.notes = nullable("notes", 2000);
  if (has("quantity")) { if (i.quantity === null) f.quantity = null; else { if (typeof i.quantity !== "number" || !(i.quantity >= 0) || i.quantity > 1e9) throw new v.InvalidInput("quantity must be a number"); f.quantity = i.quantity; } }
  const st = v.oneOf(i.status, "status", STAGES); if (st) f.status = st;
  if (has("expectedDate")) f.expectedDate = i.expectedDate === null ? null : v.date(i.expectedDate, "expectedDate") ?? null;
  if (has("expectedTime")) f.expectedTime = i.expectedTime === null ? null : v.time(i.expectedTime, "expectedTime") ?? null;
  if (f.expectedTime && !(f.expectedDate ?? true)) throw new v.InvalidInput("expectedTime needs an expectedDate");
  const pr = v.oneOf(i.priority, "priority", PRIORITIES); if (pr) f.priority = pr;
  const sr = v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }); if (sr) f.sourceRef = sr;
  return f;
}

const prettyDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Moves an existing notification task with its item (whoever created it): new arrival -> new deadline, cancellation -> hidden. A completed task is never touched. */
async function updateNotificationTask(ctx: Ctx, taskId: string, row: Row, cancel: boolean): Promise<void> {
  const t = await fetchRow(ctx, taskId);
  if (!t || t.status === "completed" || t.archived_at) return;
  const at = ctx.now().toISOString();
  if (cancel) {
    await write(ctx.db, [ctx.db.prepare("UPDATE tasks SET archived_at=?, updated_at=?, updated_by=?, version=version+1 WHERE id=?").bind(at, at, ctx.actor.label, t.id), eventStmt(ctx, t.id, "archived", ["cancelled"]), auditStmt(ctx, "task.cancel", "task", t.id)]);
    return;
  }
  if (!row.expected_date) return;
  const dl = deliveryDeadline(row.expected_date, row.expected_time)!;
  const want: Record<string, unknown> = { title: `Notify REEF: ${row.material} arriving ${prettyDay(row.expected_date)}`, due_date: dl.dueDate, due_time: dl.dueTime, related_date: row.expected_date, related_time: row.expected_time ?? null, supplier: row.supplier ?? t.supplier };
  const sets: string[] = [], args: unknown[] = [], changed: string[] = [];
  for (const [col, val] of Object.entries(want)) if (val !== ((t as unknown as Record<string, unknown>)[col] ?? null)) { sets.push(`${col} = ?`); args.push(val); changed.push(col); }
  if (!changed.length) return;
  await write(ctx.db, [ctx.db.prepare(`UPDATE tasks SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, t.id), eventStmt(ctx, t.id, "updated", changed), auditStmt(ctx, "task.update", "task", t.id)]);
}

/** Keeps the 24-hour REEF notification task in step with the item: created when a delivery date is known, moved on a reschedule, hidden with a cancelled item. Never invents a date. */
async function syncNotification(ctx: Ctx, id: string, key: string, cancelled: boolean): Promise<void> {
  const row = await fetchItem(ctx, id);
  if (!row) return;
  if (row.notification_task_id) { await updateNotificationTask(ctx, row.notification_task_id, row, cancelled); return; }
  if (cancelled || !row.expected_date || row.status === "received") return;
  // A delivery notification task that already exists for this material (for example one Datum filed earlier from an email) is adopted, never duplicated.
  const existing = await ctx.db.prepare("SELECT id FROM tasks WHERE module = ? AND topic = 'delivery' AND archived_at IS NULL AND status != 'completed' AND instr(lower(title), lower(?)) > 0 AND id NOT IN (SELECT notification_task_id FROM procurement_items WHERE notification_task_id IS NOT NULL) ORDER BY created_at LIMIT 1").bind(row.module, row.material).first<{ id: string }>();
  if (existing) {
    await write(ctx.db, [ctx.db.prepare("UPDATE procurement_items SET notification_task_id = ? WHERE id = ?").bind(existing.id, id)]);
    await updateNotificationTask(ctx, existing.id, { ...row, notification_task_id: existing.id }, false);
    return;
  }
  const bits = [row.quantity != null ? `${row.quantity}${row.unit ? " " + row.unit : ""}` : null, row.order_ref ? `order ${row.order_ref}` : null].filter(Boolean).join(", ");
  const r = await upsertActionItem(ctx, {
    key, title: `Notify REEF: ${row.material} arriving ${prettyDay(row.expected_date)}`, topic: "delivery",
    delivery: { arrivalDate: row.expected_date, ...(row.expected_time ? { arrivalTime: row.expected_time } : {}), ...(row.supplier ? { supplier: row.supplier } : {}) },
    ...(bits ? { description: bits } : {}), ...(row.source_ref ? { sourceRef: row.source_ref } : {}), module: row.module,
  });
  if (r.ok) await write(ctx.db, [ctx.db.prepare("UPDATE procurement_items SET notification_task_id = ? WHERE id = ?").bind(r.data.id, id)]);
}

const columnsFor = (f: Fields): { sets: string[]; args: unknown[]; changed: string[] } => {
  const sets: string[] = [], args: unknown[] = [], changed: string[] = [];
  const add = (col: string, field: string, val: unknown) => { if (val !== undefined) { sets.push(`${col} = ?`); args.push(val); changed.push(field); } };
  add("material", "material", f.material); add("description", "description", f.description); add("quantity", "quantity", f.quantity); add("unit", "unit", f.unit); add("supplier", "supplier", f.supplier);
  add("order_ref", "orderRef", f.orderRef); add("expected_date", "expectedDate", f.expectedDate); add("expected_time", "expectedTime", f.expectedTime); add("priority", "priority", f.priority); add("notes", "notes", f.notes);
  return { sets, args, changed };
};

export const createProcurement = (ctx: Ctx, raw: unknown): Promise<Result<ProcItem>> => guard(async () => {
  const i = v.obj(raw, "item");
  const f = parseFields(i, true);
  const module = v.moduleId(i.module) ?? defaultModule(ctx.actor); assertModule(ctx.actor, module);
  const src = sourceOf(ctx); const id = `prc_${crypto.randomUUID()}`; const at = ctx.now().toISOString(); const today = dateOf(ctx);
  const stage = f.status ?? "requested";
  const externalId = v.text(i.externalId, "externalId", { max: 200, optional: true });
  if (externalId && (await ctx.db.prepare("SELECT id FROM procurement_items WHERE source_name = ? AND external_id = ?").bind(src.name, externalId).first())) return fail("conflict", "An item with that externalId already exists");
  const dates: Record<string, string | null> = {}; for (const s of STAGES) dates[s] = stageIndex(s) <= stageIndex(stage) ? today : null;
  await write(ctx.db, [
    ctx.db.prepare("INSERT INTO procurement_items (id,module,material,description,quantity,unit,supplier,order_ref,status,requested_on,ordered_on,in_transit_on,notified_on,received_on,expected_date,expected_time,priority,notes,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, module, f.material, f.description ?? null, f.quantity ?? null, f.unit ?? null, f.supplier ?? null, f.orderRef ?? null, stage, dates.requested, dates.ordered, dates.in_transit, dates.notified, dates.received, f.expectedDate ?? null, f.expectedTime ?? null, f.priority ?? "medium", f.notes ?? null, src.kind, src.name, src.assistant, f.sourceRef ?? null, externalId ?? null, v.bool(i.demo, "demo") === true ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label),
    auditStmt(ctx, "procurement.create", "procurement", id),
  ]);
  await syncNotification(ctx, id, `${externalId ?? id}:notify`, false);
  return ok(toItem((await fetchItem(ctx, id))!));
});

export const updateProcurement = (ctx: Ctx, raw: unknown): Promise<Result<ProcItem>> => guard(async () => {
  const i = v.obj(raw, "input"); const id = v.text(i.id, "id", { max: 100 })!;
  const row = await fetchItem(ctx, id);
  if (!row) return fail("not_found", "No such procurement item");
  if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Item changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
  const f = parseFields(i, false); const { sets, args, changed } = columnsFor(f);
  const today = dateOf(ctx);
  if (f.status && f.status !== row.status) { sets.push("status = ?"); args.push(f.status); changed.push("status"); if (!(row as unknown as Record<string, unknown>)[stageCol[f.status]]) { sets.push(`${stageCol[f.status]} = ?`); args.push(today); } }
  if ("archived" in i && v.bool(i.archived, "archived") !== undefined) { sets.push("archived_at = ?"); args.push(i.archived ? ctx.now().toISOString() : null); changed.push("archived"); }
  if (!sets.length) return fail("invalid_input", "Nothing to update");
  await write(ctx.db, [ctx.db.prepare(`UPDATE procurement_items SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, ctx.now().toISOString(), ctx.actor.label, id), auditStmt(ctx, "procurement.update", "procurement", id)]);
  await syncNotification(ctx, id, `${row.external_id ?? id}:notify`, "archived" in i && !!i.archived);
  return ok(toItem((await fetchItem(ctx, id))!));
});

export type ProcOutcome = "created" | "updated" | "unchanged" | "received_unchanged" | "cancelled" | "already_cancelled";
/**
 * The idempotent write Datum uses for materials and equipment: "this item exists, in this state". The assistant's `key` is the identity (no dates in it),
 * an item already in the system by order reference, or by material and supplier with no key, is adopted rather than duplicated, an earlier stage never
 * overwrites a later one, a received item is left alone, and the REEF notification task follows the delivery date (never an invented one).
 */
export const upsertProcurement = (ctx: Ctx, raw: unknown): Promise<Result<ProcItem & { outcome: ProcOutcome }>> => guard(async () => {
  const i = v.obj(raw, "input");
  const key = v.text(i.key, "key", { max: 200 })!; const src = sourceOf(ctx);
  const state = v.oneOf(i.state, "state", ["open", "cancelled"] as const, "open")!;
  const f = parseFields(i, false);
  const finish = async (id: string, outcome: ProcOutcome, dup = false) => ok({ ...toItem((await fetchItem(ctx, id))!), outcome }, dup ? { duplicate: true } : {});
  let row = await ctx.db.prepare(`${SELECT} WHERE p.source_name = ? AND p.external_id = ?`).bind(src.name, key).first<Row>();
  if (row && !canAccessModule(ctx.actor, row.module)) throw new Forbidden(`This connection cannot access the ${row.module} module`);
  if (!row && state === "cancelled") return fail("not_found", "Nothing to cancel: no procurement item has this key");
  if (!row) { // adopt an existing, unkeyed item instead of duplicating it
    const mod = v.moduleId(i.module) ?? defaultModule(ctx.actor);
    if (f.orderRef) row = await ctx.db.prepare(`${SELECT} WHERE p.module = ? AND p.external_id IS NULL AND p.archived_at IS NULL AND lower(p.order_ref) = lower(?)`).bind(mod, f.orderRef).first<Row>();
    if (!row && f.material) row = await ctx.db.prepare(`${SELECT} WHERE p.module = ? AND p.external_id IS NULL AND p.archived_at IS NULL AND p.status != 'received' AND lower(p.material) = lower(?) AND lower(COALESCE(p.supplier,'')) = lower(?)`).bind(mod, f.material, f.supplier ?? "").first<Row>();
    if (row) { await write(ctx.db, [ctx.db.prepare("UPDATE procurement_items SET external_id = ?, source_name = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(key, src.name, ctx.now().toISOString(), ctx.actor.label, row.id), auditStmt(ctx, "procurement.update", "procurement", row.id)]); row = await fetchItem(ctx, row.id); }
  }
  if (!row) {
    if (!f.material) return fail("invalid_input", "material is required when the item is new");
    const made = await createProcurement(ctx, { ...i, ...f, material: f.material, externalId: key });
    if (!made.ok) return made as Result<never>;
    return ok({ ...made.data, outcome: "created" as const });
  }
  if (state === "cancelled") {
    if (row.status === "received") return finish(row.id, "received_unchanged", true);
    if (row.archived_at) return finish(row.id, "already_cancelled", true);
    await write(ctx.db, [ctx.db.prepare("UPDATE procurement_items SET archived_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(ctx.now().toISOString(), ctx.now().toISOString(), ctx.actor.label, row.id), auditStmt(ctx, "procurement.cancel", "procurement", row.id)]);
    await syncNotification(ctx, row.id, `${key}:notify`, true);
    return finish(row.id, "cancelled");
  }
  if (row.status === "received") return finish(row.id, "received_unchanged", true);
  if (row.archived_at) return finish(row.id, "already_cancelled", true);
  // Update only what the new information changes; an earlier stage never overwrites a later one; missing information never erases what is known.
  const diff: Fields = {};
  const keys: Array<keyof Fields> = ["material", "description", "quantity", "unit", "supplier", "orderRef", "expectedDate", "expectedTime", "priority", "notes"];
  const cur: Record<string, unknown> = { material: row.material, description: row.description, quantity: row.quantity, unit: row.unit, supplier: row.supplier, orderRef: row.order_ref, expectedDate: row.expected_date, expectedTime: row.expected_time, priority: row.priority, notes: row.notes };
  for (const k of keys) { const nv = f[k]; if (nv !== undefined && nv !== null && nv !== cur[k]) (diff as Record<string, unknown>)[k] = nv; }
  if (f.expectedDate && f.expectedDate !== row.expected_date && !f.expectedTime && row.expected_time) diff.expectedTime = null;
  if (f.status && stageIndex(f.status) > stageIndex(row.status)) diff.status = f.status;
  const sourceChanged = f.sourceRef && f.sourceRef !== row.source_ref;
  const { sets, args, changed } = columnsFor(diff); const today = dateOf(ctx);
  if (diff.status) { sets.push("status = ?"); args.push(diff.status); changed.push("status"); if (!(row as unknown as Record<string, unknown>)[stageCol[diff.status]]) { sets.push(`${stageCol[diff.status]} = ?`); args.push(today); } }
  if (sourceChanged) { sets.push("source_ref = ?"); args.push(f.sourceRef); changed.push("sourceRef"); }
  if (!changed.length) { await syncNotification(ctx, row.id, `${key}:notify`, false); return finish(row.id, "unchanged", true); }
  await write(ctx.db, [ctx.db.prepare(`UPDATE procurement_items SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, ctx.now().toISOString(), ctx.actor.label, row.id), auditStmt(ctx, "procurement.update", "procurement", row.id)]);
  await syncNotification(ctx, row.id, `${key}:notify`, false);
  return finish(row.id, "updated");
});
