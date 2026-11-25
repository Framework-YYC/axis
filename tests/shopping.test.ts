import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { processInbox } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { loadDemoShopping } from "../worker/services/demoShopping";
import { ownerActor, type Ctx } from "../worker/services/types";
import { normalizeJob, normalizeTitle, orderItems, parseQuantity, restorable, sameItem } from "../shared/shopping";

let NOW = new Date("2026-11-25T14:00:00.000Z");
let db: D1Database, raw: ReturnType<typeof makeDb>["raw"], owner: Ctx, work: Ctx;
const ctxFor = (actor: Ctx["actor"]): Ctx => ({ db, actor, requestId: "t", now: () => NOW });
const run = (c: Ctx, op: string, input: unknown = {}) => runOperation(c, op, input) as Promise<any>;
const count = (sql = "SELECT COUNT(*) n FROM shopping_items") => (raw.prepare(sql).get() as { n: number }).n;
beforeEach(() => { NOW = new Date("2026-11-25T14:00:00.000Z"); const m = makeDb(); db = m.db; raw = m.raw; owner = ctxFor(ownerActor("web")); work = ctxFor(assistantActor("progressive")); });

describe("shared shopping helpers", () => {
  it("normalises titles and jobs", () => {
    expect(normalizeTitle("  Cable  ties, 300 mm. ")).toBe("cable ties 300 mm"); expect(normalizeJob(" 928 ")).toBe("928"); expect(normalizeJob("  ")).toBeNull();
    expect(sameItem({ title: "Cable ties", job: "928" }, { title: "cable   TIES.", job: null })).toBe(true);
    expect(sameItem({ title: "Cable ties", job: "928" }, { title: "Cable ties", job: "1011" })).toBe(false);
    expect(sameItem({ title: "Tape", job: null }, { title: "Cable ties", job: null })).toBe(false);
  });
  it("parses quantities but never guesses", () => {
    expect(parseQuantity("2")).toEqual({ quantity: 2, unit: null }); expect(parseQuantity("10 m")).toEqual({ quantity: 10, unit: "m" }); expect(parseQuantity("2,5 kg")).toEqual({ quantity: 2.5, unit: "kg" });
    expect(parseQuantity("a box")).toEqual({ quantity: null, unit: null }); expect(parseQuantity(null)).toEqual({ quantity: null, unit: null }); expect(parseQuantity("")).toEqual({ quantity: null, unit: null });
  });
  it("orders open items first in the order added, then checked (latest first); cleared items are not part of the list; restore window is 7 days", () => {
    const it = (id: string, status: "open" | "checked", createdAt: string, checkedAt: string | null = null, clearedAt: string | null = null) => ({ id, title: id, quantity: null, job: null, status, createdAt, checkedAt, clearedAt });
    const items = [it("c", "open", "2026-11-25T03"), it("a", "open", "2026-11-25T01"), it("x", "checked", "2026-11-25T00", "2026-11-25T05"), it("y", "checked", "2026-11-25T00", "2026-11-25T09"), it("gone", "open", "2026-11-25T00", null, "2026-11-25T10")];
    const o = orderItems(items); expect(o.open.map((i) => i.id)).toEqual(["a", "c"]); expect(o.checked.map((i) => i.id)).toEqual(["y", "x"]);
    expect(restorable([it("old", "checked", "x", null, "2026-11-10T00:00:00Z"), it("new", "checked", "x", null, "2026-11-24T00:00:00Z")], "2026-11-25T14:00:00Z").map((i) => i.id)).toEqual(["new"]);
  });
});

describe("shopping list service", () => {
  const add = (input: Record<string, unknown>, c = owner) => run(c, "create_shopping_item", input);
  it("adds with optional quantity and job; unchecked items persist", async () => {
    const a = await add({ item: "Cable ties 300 mm", quantity: "2 packs", job: "928" }); expect(a.ok).toBe(true); expect(a.data).toMatchObject({ title: "Cable ties 300 mm", quantity: "2 packs", job: "928", status: "open", outcome: "created", source: { kind: "manual" } });
    const b = await add({ item: "Tape" }); expect(b.data).toMatchObject({ quantity: null, job: null });
    expect((await run(owner, "list_shopping")).data.count).toBe(2);
    expect((await add({})).ok).toBe(false); expect((await add({ item: "" })).ok).toBe(false);
  });
  it("check, restore, clear checked and restore cleared", async () => {
    const a = (await add({ item: "Ear plugs" })).data, b = (await add({ item: "Gloves" })).data;
    const c = await run(owner, "check_shopping_item", { id: a.id }); expect(c.data).toMatchObject({ status: "checked", checkedAt: NOW.toISOString() });
    expect((await run(owner, "check_shopping_item", { id: a.id })).duplicate).toBe(true); // already checked: no second history entry
    expect((await run(owner, "update_shopping_item", { id: a.id, checked: false })).data.status).toBe("open"); // restore
    await run(owner, "check_shopping_item", { id: a.id });
    const cl = await run(owner, "clear_shopping_checked"); expect(cl.data.cleared).toBe(1);
    const l = (await run(owner, "list_shopping")).data; expect(l.count).toBe(1); expect(l.items.find((i: any) => i.id === b.id).clearedAt).toBeNull(); // the unchecked item stays for the next trip
    expect((await run(owner, "clear_shopping_checked")).duplicate).toBe(true);
    const r = await run(owner, "restore_shopping_item", { id: a.id }); expect(r.ok).toBe(true); expect(r.data.clearedAt).toBeNull(); expect(r.data.status).toBe("checked");
    await run(owner, "clear_shopping_checked"); NOW = new Date("2026-12-04T14:00:00.000Z");
    expect((await run(owner, "restore_shopping_item", { id: a.id })).error.code).toBe("conflict"); // after 7 days
    expect((await run(owner, "list_shopping")).data.items.some((i: any) => i.id === a.id)).toBe(false);
  });
  it("edits with conflict detection", async () => {
    const a = (await add({ item: "Batteries" })).data;
    const e = await run(owner, "update_shopping_item", { id: a.id, quantity: "4", job: "1011", expectedVersion: a.version }); expect(e.data).toMatchObject({ quantity: "4", job: "1011", version: 2 });
    expect((await run(owner, "update_shopping_item", { id: a.id, quantity: "5", expectedVersion: 1 })).error.code).toBe("conflict");
    expect((await run(owner, "update_shopping_item", { id: "nope", quantity: "5" })).error.code).toBe("not_found");
  });
  it("owner adding an item that is already open updates it instead of duplicating", async () => {
    const a = (await add({ item: "Cable ties", job: "928" })).data;
    const again = await add({ item: "  cable   TIES. ", quantity: "3" }); expect(again.data.id).toBe(a.id); expect(again.data.quantity).toBe("3"); expect(count()).toBe(1);
    const other = await add({ item: "Cable ties", job: "1011" }); expect(other.data.id).not.toBe(a.id); expect(count()).toBe(2); // a different job is a different item
    const same = await add({ item: "Cable ties", job: "1011", quantity: "3" }); expect(same.data.id).toBe(other.data.id);
  });
  it("audits every change in the same batch and blocks direct SQL", async () => {
    const a = (await add({ item: "Tape" })).data; await run(owner, "check_shopping_item", { id: a.id }); await run(owner, "clear_shopping_checked");
    const acts = (raw.prepare("SELECT action FROM audit_log WHERE entity = 'shopping' ORDER BY id").all() as Array<{ action: string }>).map((r) => r.action); expect(acts).toEqual(["shopping.create", "shopping.update", "shopping.clear"]);
    expect(() => raw.exec("INSERT INTO shopping_items (id,title,created_at,updated_at,created_by,updated_by) VALUES ('x','x','a','a','a','a')")).toThrow(/blocked/);
    expect(() => raw.exec("UPDATE shopping_items SET title = 'x'")).toThrow(/blocked/); expect(() => raw.exec("DELETE FROM shopping_items")).toThrow(/blocked/);
  });
});

describe("Datum (progressive assistant)", () => {
  const up = (input: Record<string, unknown>, c = work) => run(c, "upsert_shopping_item", input);
  it("upserts by stable key without duplicates and records the source", async () => {
    const a = await up({ key: "work:shopping:cable-ties", item: "Cable ties", quantity: "2", sourceRef: "msg-1" }); expect(a.data).toMatchObject({ outcome: "created", externalId: "work:shopping:cable-ties", source: { kind: "assistant", assistant: "progressive" } });
    const same = await up({ key: "work:shopping:cable-ties", item: "Cable ties", quantity: "2", sourceRef: "msg-1" }); expect(same.duplicate).toBe(true); expect(same.data.outcome).toBe("unchanged"); expect(count()).toBe(1);
    const upd = await up({ key: "work:shopping:cable-ties", quantity: "4", job: "928" }); expect(upd.data).toMatchObject({ outcome: "updated", quantity: "4", job: "928" }); expect(count()).toBe(1);
    const chk = await up({ key: "work:shopping:cable-ties", checked: true }); expect(chk.data.status).toBe("checked"); expect(chk.data.quantity).toBe("4"); // missing fields never erase what is known
  });
  it("without a key, an open item with the same name is updated, and a key is adopted onto an item the owner added", async () => {
    await run(owner, "create_shopping_item", { item: "Hi-vis tape" });
    const r = await up({ key: "work:shopping:hi-vis-tape", item: "hi-vis tape", quantity: "6" }); expect(r.data.outcome).toBe("updated"); expect(count()).toBe(1);
    expect(r.data.externalId).toBe("work:shopping:hi-vis-tape");
    const nokey = await up({ item: "HI-VIS TAPE", quantity: "8" }); expect(nokey.data.quantity).toBe("8"); expect(count()).toBe(1);
  });
  it("a cleared item added again by key is restored, not duplicated; a promoted one stays in Procurement", async () => {
    const a = (await up({ key: "k1", item: "Ear plugs", checked: true })).data; await run(owner, "clear_shopping_checked");
    const back = await up({ key: "k1", item: "Ear plugs" }); expect(back.data).toMatchObject({ id: a.id, outcome: "restored", clearedAt: null }); expect(count()).toBe(1);
    expect((await up({ key: "k1", cleared: true })).data.clearedAt).toBe(NOW.toISOString());
    const p = (await up({ key: "k2", item: "Shackles" })).data; await run(owner, "promote_shopping_item", { id: p.id });
    expect((await up({ key: "k2", item: "Shackles", quantity: "9" })).duplicate).toBe(true); expect(count()).toBe(2);
  });
  it("never invents anything, cannot promote, and other assistants are refused", async () => {
    expect((await up({ key: "k3" })).ok).toBe(false); // a new item needs a name
    expect((await run(work, "promote_shopping_item", { id: "x" })).ok).toBe(false);
    for (const m of ["financial", "daily", "health", "framework"] as const) { const r = await up({ key: "kx", item: "Nope" }, ctxFor(assistantActor(m))); expect(r.ok).toBe(false); expect(r.error.code).toBe("forbidden"); }
    expect(count()).toBe(0);
  });
  it("syncs through the inbox: task.create with a key and a shopping block, repeated safely", async () => {
    const ins = (id: string, payload: unknown) => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?, 'progressive', 'task.create', ?)").run(id, JSON.stringify(payload));
    ins("shop-s1-aa", { key: "work:shopping:gloves", sourceRef: "thread-9", shopping: { item: "Gloves", quantity: "3 pairs", job: "1011" } });
    ins("shop-s2-aa", { key: "work:shopping:gloves", sourceRef: "thread-9", shopping: { item: "Gloves", quantity: "3 pairs", job: "1011" } });
    ins("shop-s3-aa", { key: "work:shopping:gloves", shopping: { checked: true } });
    await processInbox(db, { now: NOW });
    const rows = raw.prepare("SELECT id, status FROM assistant_inbox ORDER BY id").all() as Array<{ id: string; status: string }>; expect(rows.map((r) => r.status)).toEqual(["applied", "duplicate", "applied"]); // the identical repeat is recognised
    expect(count()).toBe(1); expect(raw.prepare("SELECT title, quantity, job, status, source_assistant FROM shopping_items").get()).toMatchObject({ title: "Gloves", quantity: "3 pairs", job: "1011", status: "checked", source_assistant: "progressive" });
    expect(count("SELECT COUNT(*) n FROM tasks")).toBe(0); // no task is created for a shopping item
    raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES ('shop-s4-aa', 'daily', 'task.create', ?)").run(JSON.stringify({ key: "k", shopping: { item: "x" } }));
    await processInbox(db, { now: NOW }); expect((raw.prepare("SELECT status FROM assistant_inbox WHERE id = 'shop-s4-aa'").get() as any).status).toBe("rejected"); expect(count()).toBe(1);
  });
});

describe("promote to Procurement", () => {
  it("creates exactly one procurement item, links it, takes the item off the list, and never repeats", async () => {
    const a = (await run(owner, "create_shopping_item", { item: "Cable ties 300 mm", quantity: "10 m", job: "928", notes: "black" })).data;
    const p = await run(owner, "promote_shopping_item", { id: a.id }); expect(p.ok).toBe(true); expect(p.data.item).toMatchObject({ procurementId: expect.stringMatching(/^prc_/), clearedAt: NOW.toISOString() });
    const proc = raw.prepare("SELECT material, quantity, unit, description, status, module, notes FROM procurement_items").all(); expect(proc).toHaveLength(1);
    expect(proc[0]).toMatchObject({ material: "Cable ties 300 mm", quantity: 10, unit: "m", description: "Job 928", status: "requested", module: "progressive", notes: "black" });
    const again = await run(owner, "promote_shopping_item", { id: a.id }); expect(again.duplicate).toBe(true); expect(count("SELECT COUNT(*) n FROM procurement_items")).toBe(1);
    expect((await run(owner, "restore_shopping_item", { id: a.id })).error.code).toBe("conflict");
    expect((await run(owner, "list_shopping")).data.count).toBe(0);
    const t = (await run(owner, "create_shopping_item", { item: "A box of gloves", quantity: "a box" })).data; await run(owner, "promote_shopping_item", { id: t.id });
    expect(raw.prepare("SELECT quantity, notes FROM procurement_items WHERE material = 'A box of gloves'").get()).toMatchObject({ quantity: null, notes: "Quantity: a box" }); // unparsed text is kept, not guessed
  });
});

describe("demo data", () => {
  it("loads six synthetic items idempotently and they are clearly labelled", async () => {
    expect(await loadDemoShopping(owner, "2026-11-25")).toBe(6); expect(await loadDemoShopping(owner, "2026-11-25")).toBe(0);
    const rows = raw.prepare("SELECT title, job, status, demo FROM shopping_items").all() as any[]; expect(rows).toHaveLength(6); expect(rows.every((r) => r.demo === 1 && r.title.includes("(synthetic)"))).toBe(true);
    expect(rows.filter((r) => r.job).map((r) => r.job).sort()).toEqual(["1011", "928"]); expect(rows.filter((r) => r.status === "checked")).toHaveLength(1);
  });
});
