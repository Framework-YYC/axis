import { normalizeJob, normalizeTitle, parseQuantity, RESTORE_WINDOW_DAYS, sameItem } from "../../shared/shopping";
import { assertModule, Forbidden } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { createProcurement } from "./procurement";
import { sourceOf } from "./tasks";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

/** The shopping list belongs to Work (Datum's module). Every operation refuses any other module. */
const MODULE = "progressive";

interface Row {
  id: string; module: string; title: string; quantity: string | null; job: string | null; status: "open" | "checked"; checked_at: string | null; notes: string | null; procurement_id: string | null; cleared_at: string | null;
  source_kind: string; source_name: string; source_assistant: string | null; source_ref: string | null; external_id: string | null; demo: number; created_at: string; updated_at: string; created_by: string; updated_by: string; version: number;
}
export interface ShoppingItem {
  id: string; title: string; quantity: string | null; job: string | null; status: "open" | "checked"; checkedAt: string | null; notes: string | null; procurementId: string | null; clearedAt: string | null;
  source: { kind: string; name: string; assistant: string | null; ref: string | null }; externalId: string | null; demo: boolean; createdAt: string; updatedAt: string; version: number;
}
const toItem = (r: Row): ShoppingItem => ({ id: r.id, title: r.title, quantity: r.quantity, job: r.job, status: r.status, checkedAt: r.checked_at, notes: r.notes, procurementId: r.procurement_id, clearedAt: r.cleared_at, source: { kind: r.source_kind, name: r.source_name, assistant: r.source_assistant, ref: r.source_ref }, externalId: r.external_id, demo: r.demo === 1, createdAt: r.created_at, updatedAt: r.updated_at, version: r.version });

const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};
const fetchRow = (ctx: Ctx, id: string) => ctx.db.prepare("SELECT * FROM shopping_items WHERE id = ?").bind(id).first<Row>();
const fresh = async (ctx: Ctx, id: string) => toItem((await fetchRow(ctx, id))!);
const isOwner = (ctx: Ctx) => ctx.actor.type === "user";

interface Fields { title?: string; quantity?: string | null; job?: string | null; notes?: string | null; checked?: boolean; cleared?: boolean; sourceRef?: string }
function parseFields(i: Record<string, unknown>): Fields {
  const f: Fields = {};
  const has = (n: string) => i[n] !== undefined;
  const t = has("item") ? v.text(i.item, "item", { max: 200 }) : has("title") ? v.text(i.title, "title", { max: 200 }) : undefined;
  if (t !== undefined) f.title = t;
  if (has("quantity")) f.quantity = i.quantity === null || i.quantity === "" ? null : v.text(typeof i.quantity === "number" ? String(i.quantity) : i.quantity, "quantity", { max: 40 })!;
  if (has("job")) f.job = i.job === null || i.job === "" ? null : normalizeJob(v.text(typeof i.job === "number" ? String(i.job) : i.job, "job", { max: 40 }));
  if (has("notes")) f.notes = i.notes === null ? null : v.text(i.notes, "notes", { max: 1000, allowNewlines: true })!;
  const c = v.bool(i.checked, "checked"); if (c !== undefined) f.checked = c;
  const cl = v.bool(i.cleared, "cleared"); if (cl !== undefined) f.cleared = cl;
  const sr = v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }); if (sr) f.sourceRef = sr;
  return f;
}

export const listShopping = (ctx: Ctx, _raw?: unknown): Promise<Result<{ items: ShoppingItem[]; count: number }>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const cutoff = new Date(ctx.now().getTime() - RESTORE_WINDOW_DAYS * 86_400_000).toISOString();
  const { results } = await ctx.db.prepare("SELECT * FROM shopping_items WHERE module = ? AND (cleared_at IS NULL OR cleared_at >= ?) ORDER BY created_at, id").bind(MODULE, cutoff).all<Row>();
  const items = results.map(toItem);
  return ok({ items, count: items.filter((i) => !i.clearedAt).length });
});

type Outcome = "created" | "updated" | "unchanged" | "restored";
interface Core { item: ShoppingItem; outcome: Outcome }

/**
 * The one write path for adding or reconciling an item (owner and Datum). Identity: the assistant's stable `key`; otherwise an existing OPEN item with the same
 * normalised title (and the same job unless one side has none) is updated instead of a second row being added. A cleared item that is added again by key is restored.
 */
async function upsertCore(ctx: Ctx, i: Record<string, unknown>, key: string | undefined): Promise<Result<Core>> {
  assertModule(ctx.actor, MODULE);
  const f = parseFields(i);
  const src = sourceOf(ctx); const at = ctx.now().toISOString();
  let row: Row | null = null;
  if (key) row = await ctx.db.prepare("SELECT * FROM shopping_items WHERE source_name = ? AND external_id = ?").bind(src.name, key).first<Row>();
  let adopted = false;
  if (!row && f.title) {
    const open = (await ctx.db.prepare("SELECT * FROM shopping_items WHERE module = ? AND cleared_at IS NULL AND status = 'open' AND (? IS NULL OR external_id IS NULL OR source_name = ?) ORDER BY created_at").bind(MODULE, key ?? null, src.name).all<Row>()).results;
    row = open.find((r) => sameItem({ title: f.title!, job: f.job ?? null }, { title: r.title, job: r.job })) ?? null;
    adopted = !!row && !!key && !row.external_id;
  }
  if (!row) {
    if (!f.title) return fail("invalid_input", "item is required when the item is new");
    const id = `shp_${crypto.randomUUID()}`; const checked = f.checked === true;
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO shopping_items (id,module,title,quantity,job,status,checked_at,notes,cleared_at,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, MODULE, f.title, f.quantity ?? null, f.job ?? null, checked ? "checked" : "open", checked ? at : null, f.notes ?? null, f.cleared ? at : null, src.kind, src.name, src.assistant, f.sourceRef ?? null, key ?? null, v.bool(i.demo, "demo") === true ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label),
      auditStmt(ctx, "shopping.create", "shopping", id),
    ]);
    return ok({ item: await fresh(ctx, id), outcome: "created" as Outcome });
  }
  // Update only what the new information changes; missing information never erases what is known.
  const sets: string[] = [], args: unknown[] = [], changed: string[] = [];
  const set = (col: string, field: string, val: unknown, cur: unknown) => { if (val !== undefined && val !== cur) { sets.push(`${col} = ?`); args.push(val); changed.push(field); } };
  set("title", "title", f.title && normalizeTitle(f.title) !== normalizeTitle(row.title) ? f.title : undefined, row.title);
  set("quantity", "quantity", f.quantity, row.quantity); set("job", "job", f.job, row.job); set("notes", "notes", f.notes, row.notes);
  let restored = false;
  if (row.procurement_id) return ok({ item: toItem(row), outcome: "unchanged" as Outcome }, { duplicate: true }); // sent to Procurement: tracked there, not here
  if (f.checked !== undefined) {
    const to = f.checked ? "checked" : "open";
    if (to !== row.status) { sets.push("status = ?", "checked_at = ?"); args.push(to, f.checked ? at : null); changed.push("checked"); }
  }
  if (row.cleared_at && f.cleared !== true) { sets.push("cleared_at = NULL"); changed.push("restored"); restored = true; } // added again (by key) or asked to be shown: restored, never duplicated
  else if (!row.cleared_at && f.cleared === true) { sets.push("cleared_at = ?"); args.push(at); changed.push("cleared"); }
  if (adopted) { sets.push("external_id = ?", "source_name = ?"); args.push(key, src.name); changed.push("key"); }
  if (f.sourceRef && f.sourceRef !== row.source_ref) { sets.push("source_ref = ?"); args.push(f.sourceRef); changed.push("sourceRef"); }
  if (!changed.length) return ok({ item: toItem(row), outcome: "unchanged" as Outcome }, { duplicate: true });
  await write(ctx.db, [ctx.db.prepare(`UPDATE shopping_items SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, row.id), auditStmt(ctx, "shopping.update", "shopping", row.id)]);
  return ok({ item: await fresh(ctx, row.id), outcome: (restored ? "restored" : "updated") as Outcome });
}

/** Datum's write: "this item is on the list, like this". Identity is the stable `key`. */
export const upsertShopping = (ctx: Ctx, raw: unknown): Promise<Result<ShoppingItem & { outcome: Outcome }>> => guard(async () => {
  const i = v.obj(raw, "input");
  const key = v.text(i.key, "key", { max: 200, optional: true });
  const r = await upsertCore(ctx, i, key);
  if (!r.ok) return r as Result<never>;
  return ok({ ...r.data.item, outcome: r.data.outcome }, r.duplicate ? { duplicate: true } : {});
});

/** The owner adds an item from the app. An item already open with the same name (and job) is updated rather than duplicated. */
export const createShopping = (ctx: Ctx, raw: unknown): Promise<Result<ShoppingItem & { outcome: Outcome }>> => guard(async () => {
  const i = v.obj(raw, "item");
  if (i.title === undefined && i.item === undefined) return fail("invalid_input", "item is required");
  const { checked: _c, cleared: _x, ...rest } = i;
  const r = await upsertCore(ctx, rest, undefined);
  if (!r.ok) return r as Result<never>;
  return ok({ ...r.data.item, outcome: r.data.outcome }, r.duplicate ? { duplicate: true } : {});
});

/** Edit, check or uncheck one item (by id). Pass expectedVersion to detect a conflicting edit. */
export const updateShopping = (ctx: Ctx, raw: unknown): Promise<Result<ShoppingItem>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "input"); const id = v.text(i.id, "id", { max: 100 })!;
  const row = await fetchRow(ctx, id);
  if (!row) return fail("not_found", "No such shopping item");
  if (i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Item changed since version ${String(i.expectedVersion)}; current version is ${row.version}. Read it again and retry.`);
  const f = parseFields(i);
  const at = ctx.now().toISOString();
  const sets: string[] = [], args: unknown[] = [], changed: string[] = [];
  const set = (col: string, field: string, val: unknown, cur: unknown) => { if (val !== undefined && val !== cur) { sets.push(`${col} = ?`); args.push(val); changed.push(field); } };
  set("title", "title", f.title, row.title); set("quantity", "quantity", f.quantity, row.quantity); set("job", "job", f.job, row.job); set("notes", "notes", f.notes, row.notes);
  if (f.checked !== undefined) { const to = f.checked ? "checked" : "open"; if (to !== row.status) { sets.push("status = ?", "checked_at = ?"); args.push(to, f.checked ? at : null); changed.push("checked"); } }
  if (!changed.length) return ok(toItem(row), { duplicate: true });
  await write(ctx.db, [ctx.db.prepare(`UPDATE shopping_items SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, id), auditStmt(ctx, "shopping.update", "shopping", id)]);
  return ok(await fresh(ctx, id));
});

/** Soft-clears every checked item (unchecked items stay for the next trip). Cleared items can be restored for a week. */
export const clearChecked = (ctx: Ctx, _raw?: unknown): Promise<Result<{ cleared: number }>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const at = ctx.now().toISOString();
  const n = (await ctx.db.prepare("SELECT COUNT(*) AS n FROM shopping_items WHERE module = ? AND status = 'checked' AND cleared_at IS NULL").bind(MODULE).first<{ n: number }>())?.n ?? 0;
  if (!n) return ok({ cleared: 0 }, { duplicate: true });
  await write(ctx.db, [ctx.db.prepare("UPDATE shopping_items SET cleared_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE module = ? AND status = 'checked' AND cleared_at IS NULL").bind(at, at, ctx.actor.label, MODULE), auditStmt(ctx, "shopping.clear", "shopping", null)]);
  return ok({ cleared: n });
});

/** Brings one cleared item back (within the restore window). An item sent to Procurement stays there. */
export const restoreShopping = (ctx: Ctx, raw: unknown): Promise<Result<ShoppingItem>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
  const row = await fetchRow(ctx, id);
  if (!row) return fail("not_found", "No such shopping item");
  if (!row.cleared_at) return ok(toItem(row), { duplicate: true });
  if (row.procurement_id) return fail("conflict", "This item was sent to Procurement and is tracked there.");
  if (row.cleared_at < new Date(ctx.now().getTime() - RESTORE_WINDOW_DAYS * 86_400_000).toISOString()) return fail("conflict", `Items can be restored for ${RESTORE_WINDOW_DAYS} days after clearing.`);
  const at = ctx.now().toISOString();
  await write(ctx.db, [ctx.db.prepare("UPDATE shopping_items SET cleared_at = NULL, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(at, ctx.actor.label, id), auditStmt(ctx, "shopping.restore", "shopping", id)]);
  return ok(await fresh(ctx, id));
});

/**
 * Sends one item to Procurement (owner only, never automatic): creates the request through the procurement service, links it and takes the item off the list.
 * Repeating never creates a second procurement item (its identity is derived from this item's id).
 */
export const promoteShopping = (ctx: Ctx, raw: unknown): Promise<Result<{ item: ShoppingItem; procurementId: string }>> => guard(async () => {
  if (!isOwner(ctx)) return fail("forbidden", "Only the owner sends a shopping item to Procurement");
  const id = v.text(v.obj(raw, "input").id, "id", { max: 100 })!;
  const row = await fetchRow(ctx, id);
  if (!row) return fail("not_found", "No such shopping item");
  if (row.procurement_id) return ok({ item: toItem(row), procurementId: row.procurement_id }, { duplicate: true });
  const ext = `shopping:${id}`;
  let procId = (await ctx.db.prepare("SELECT id FROM procurement_items WHERE source_name = ? AND external_id = ?").bind(sourceOf(ctx).name, ext).first<{ id: string }>())?.id ?? null;
  if (!procId) {
    const q = parseQuantity(row.quantity);
    const notes = [row.quantity && q.quantity === null ? `Quantity: ${row.quantity}` : null, row.notes].filter(Boolean).join("\n");
    const made = await createProcurement(ctx, { material: row.title, module: MODULE, externalId: ext, ...(q.quantity !== null ? { quantity: q.quantity } : {}), ...(q.unit ? { unit: q.unit } : {}), ...(row.job ? { description: `Job ${row.job}` } : {}), ...(notes ? { notes } : {}), status: "requested" });
    if (!made.ok) return made as Result<never>;
    procId = made.data.id;
  }
  const at = ctx.now().toISOString();
  await write(ctx.db, [ctx.db.prepare("UPDATE shopping_items SET procurement_id = ?, cleared_at = COALESCE(cleared_at, ?), updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(procId, at, at, ctx.actor.label, id), auditStmt(ctx, "shopping.promote", "shopping", id)]);
  return ok({ item: await fresh(ctx, id), procurementId: procId });
});
