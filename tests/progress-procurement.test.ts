import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { processInbox } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { ownerActor, type Ctx } from "../worker/services/types";
import { periodDates, progressOf, cyclesBetween, lastDayOfCycle } from "../shared/progress";
import { effectiveStage, outstandingAction } from "../shared/procurement";

let NOW = new Date("2026-11-24T18:00:00.000Z");
let db: D1Database, raw: ReturnType<typeof makeDb>["raw"], owner: Ctx, work: Ctx;
const ctxFor = (actor: Ctx["actor"]): Ctx => ({ db, actor, requestId: "t", now: () => NOW });
const run = (c: Ctx, op: string, input: unknown = {}) => runOperation(c, op, input) as Promise<any>;
beforeEach(() => { NOW = new Date("2026-11-24T18:00:00.000Z"); const m = makeDb(); db = m.db; raw = m.raw; owner = ctxFor(ownerActor("web")); work = ctxFor(assistantActor("progressive")); });
const sunday = { freq: "weekly" as const, interval: 1, byWeekday: [0] };

describe("reporting periods come from the calendar, never a fixed four weeks", () => {
  it("counts the Sundays in each month", () => {
    expect(periodDates(sunday, "2026-11")).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(periodDates(sunday, "2026-12").length).toBe(4);
    expect(periodDates(sunday, "2027-01").length).toBe(5);
    expect(periodDates(sunday, "2027-02").length).toBe(4);
    expect(lastDayOfCycle("2028-02")).toBe("2028-02-29");
    expect(cyclesBetween("2026-10", "2027-01")).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
  });
  it("progress is parts done over the real number of parts", () => {
    const parts = [...periodDates(sunday, "2026-11").map((_, i) => ({ kind: "period" as const, done: i < 2 })), { kind: "step" as const, done: false }, { kind: "step" as const, done: false }];
    expect(progressOf(parts)).toMatchObject({ periodsDone: 2, periodsTotal: 5, stepsTotal: 2, percent: 29, complete: false });
  });
});

describe("progress tracks derived from tasks", () => {
  async function setup() { const r = await run(owner, "setup_work_recurring", { today: "2026-11-24" }); expect(r.ok).toBe(true); return r.data; }
  const reef = async (today = "2026-11-24") => (await run(owner, "get_progress", { today, track: "reef-kpi" })).data.tracks[0];
  it("setup creates the REEF and RIPET tracks and links the weekly and monthly tasks, idempotently", async () => {
    const d = await setup(); expect(d.tracks).toEqual([{ key: "reef-kpi", linked: 2 }, { key: "ripet-kpi", linked: 2 }]);
    const again = await run(owner, "setup_work_recurring", { today: "2026-11-24" }); expect(again.data.created).toBe(0); expect(again.data.tracks.every((t: any) => t.linked === 0)).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) n FROM progress_tracks").get()).toMatchObject({ n: 2 });
    const t = (await run(owner, "get_progress", { today: "2026-11-24" })).data.tracks; expect(t.map((x: any) => x.key).sort()).toEqual(["reef-kpi", "ripet-kpi"]); // separate tracking
  });
  it("November has five reporting periods and two final steps; the Nov 29 period is linked to its task", async () => {
    await setup(); const t = await reef(); const nov = t.cycles[0];
    expect(nov.cycle).toBe("2026-11"); expect(nov.parts.filter((p: any) => p.kind === "period").length).toBe(5); expect(nov.parts.filter((p: any) => p.kind === "step").map((p: any) => p.key)).toEqual(["verify", "submit"]);
    expect(nov.parts.find((p: any) => p.key === "2026-11-29").taskId).toBeTruthy(); expect(nov.parts.find((p: any) => p.key === "2026-11-22").taskId).toBeNull();
    expect(nov.parts.find((p: any) => p.key === "2026-11-22").state).toBe("overdue"); expect(nov.progress.percent).toBe(0);
  });
  it("completing the weekly task completes its period; the next occurrence maps to the next period (and December has four)", async () => {
    await setup(); const nov = (await reef()).cycles[0]; const id = nov.parts.find((p: any) => p.key === "2026-11-29").taskId;
    await run(owner, "complete_task", { id, today: "2026-11-29" });
    const after = (await reef("2026-11-30")).cycles; const n = after.find((c: any) => c.cycle === "2026-11");
    expect(n.parts.find((p: any) => p.key === "2026-11-29")).toMatchObject({ done: true, viaTask: true }); expect(n.progress.periodsDone).toBe(1);
    const dec = (await reef("2026-12-01")).cycles[0]; expect(dec.parts.filter((p: any) => p.kind === "period").length).toBe(4); expect(dec.parts.find((p: any) => p.key === "2026-12-06").taskId).toBeTruthy();
    await run(owner, "reopen_task", { id }); expect((await reef("2026-11-30")).cycles.find((c: any) => c.cycle === "2026-11").progress.periodsDone).toBe(0); // reopening takes it back
  });
  it("historical periods are completed here; verification and submission follow the periods", async () => {
    await setup(); const c = (p: string) => run(owner, "complete_part", { track: "reef-kpi", cycle: "2026-11", part: p, today: "2026-11-29" });
    expect((await c("verify")).ok).toBe(false); // periods not done yet
    for (const d of ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"]) expect((await c(d)).ok).toBe(true);
    expect((await c("submit")).ok).toBe(false); // verification first
    expect((await c("verify")).ok).toBe(false); // the Nov 29 period is still open
    const sunId = (await reef("2026-11-29")).cycles[0].parts.find((p: any) => p.key === "2026-11-29").taskId;
    expect((await run(owner, "complete_part", { track: "reef-kpi", cycle: "2026-11", part: "2026-11-29", today: "2026-11-29" })).ok).toBe(true); // via the linked task
    expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(sunId)).toMatchObject({ status: "completed" });
    expect((await c("verify")).ok).toBe(true);
    const sub = await c("submit"); expect(sub.ok).toBe(true); expect(sub.data.progress).toMatchObject({ percent: 100, complete: true, periodsDone: 5 });
    expect((await c("submit")).duplicate).toBe(true);
    expect((await run(owner, "reopen_part", { track: "reef-kpi", cycle: "2026-11", part: "2026-11-01", today: "2026-11-29" })).data.progress.periodsDone).toBe(4);
    expect(raw.prepare("SELECT COUNT(*) n FROM deliverables").get()).toMatchObject({ n: 1 }); // materialised once, only when needed
    const history = (await reef("2026-12-10")).cycles; expect(history.map((x: any) => x.cycle)).toEqual(["2026-12", "2026-11"]); // historical cycles stay visible
  });
  it("REEF and RIPET are tracked separately", async () => {
    await setup(); await run(owner, "complete_part", { track: "reef-kpi", cycle: "2026-11", part: "2026-11-01", today: "2026-11-24" });
    const all = (await run(owner, "get_progress", { today: "2026-11-24" })).data.tracks; const p = (k: string) => all.find((x: any) => x.key === k).cycles[0].progress.periodsDone;
    expect(p("reef-kpi")).toBe(1); expect(p("ripet-kpi")).toBe(0);
  });
  it("assistants only read progress in their module, and cannot create tracks", async () => {
    await setup(); expect((await run(work, "get_progress", { today: "2026-11-24" })).data.tracks.length).toBe(2); expect((await run(ctxFor(assistantActor("health")), "get_progress", { today: "2026-11-24" })).data.tracks.length).toBe(0);
    expect((await run(work, "create_track", { key: "x-kpi", title: "X", periodRule: sunday })).ok).toBe(false);
  });
});

describe("procurement lifecycle and the 24-hour REEF notification", () => {
  const base = { key: "work:procurement:po-7781", material: "Formwork panels", quantity: 40, unit: "pcs", supplier: "Acme Forming", orderRef: "PO-7781", sourceRef: "Email: Supplier, 'Order', 2026-11-24" };
  const up = (c: Ctx, i: object) => run(c, "upsert_procurement", { ...base, ...i });
  const notifTasks = () => raw.prepare("SELECT * FROM tasks WHERE topic = 'delivery' AND archived_at IS NULL").all() as any[];
  it("creates a request without a date and invents no deadline", async () => {
    const r = await up(work, {}); expect(r.ok && r.data.outcome).toBe("created"); expect(r.data).toMatchObject({ status: "requested", quantity: 40, unit: "pcs", supplier: "Acme Forming", orderRef: "PO-7781", module: "progressive" });
    expect(notifTasks().length).toBe(0); expect(outstandingAction(r.data, r.data.status, "2026-11-24")?.text).toBe("Place the order");
  });
  it("advances the stage, creates the notification task with its deadline once the date is known, and never duplicates", async () => {
    await up(work, {}); const r = await up(work, { status: "ordered", expectedDate: "2026-12-02", expectedTime: "09:30" });
    expect(r.data).toMatchObject({ outcome: "updated", status: "ordered", expectedDate: "2026-12-02" }); const n = notifTasks(); expect(n.length).toBe(1);
    expect(n[0]).toMatchObject({ due_date: "2026-12-01", due_time: "09:30", related_date: "2026-12-02", topic: "delivery", supplier: "Acme Forming" });
    expect((await up(work, { status: "ordered", expectedDate: "2026-12-02", expectedTime: "09:30" })).data.outcome).toBe("unchanged");
    expect(notifTasks().length).toBe(1); expect(r.data.notificationTaskId).toBe(n[0].id);
    expect(outstandingAction(r.data, r.data.status, "2026-11-24")?.text).toMatch(/Send REEF notification by 2026-12-01/);
  });
  it("a reschedule moves the same notification task; an earlier stage never overwrites a later one", async () => {
    await up(work, { status: "in_transit", expectedDate: "2026-12-02" }); const r = await up(work, { status: "ordered", expectedDate: "2026-12-05" });
    expect(r.data).toMatchObject({ status: "in_transit", expectedDate: "2026-12-05" }); const n = notifTasks(); expect(n.length).toBe(1); expect(n[0]).toMatchObject({ related_date: "2026-12-05", due_date: "2026-12-03" });
  });
  it("completing the notification task reads as 'notification sent'; received items are left alone", async () => {
    const a = await up(work, { status: "ordered", expectedDate: "2026-12-02" }); await run(owner, "complete_task", { id: a.data.notificationTaskId, today: "2026-12-01" });
    const listed = (await run(owner, "list_procurement", {})).data.items[0]; expect(listed.status).toBe("notified"); expect(effectiveStage("ordered", true)).toBe("notified");
    await up(work, { status: "received" }); const again = await up(work, { status: "ordered", expectedDate: "2026-12-09", quantity: 99 }); expect(again.data).toMatchObject({ outcome: "received_unchanged", quantity: 40, status: "received" });
  });
  it("cancelling hides the item and its notification task", async () => {
    await up(work, { status: "ordered", expectedDate: "2026-12-02" }); expect((await up(work, { state: "cancelled" })).data.outcome).toBe("cancelled");
    expect(notifTasks().length).toBe(0); expect((await run(owner, "list_procurement", {})).data.count).toBe(0); expect((await up(work, { state: "cancelled" })).data.outcome).toBe("already_cancelled");
  });
  it("adopts an item the owner already entered (same order reference) instead of duplicating it, and its notification task", async () => {
    const mine = await run(owner, "create_procurement", { module: "progressive", material: "Formwork panels", orderRef: "PO-7781", supplier: "Acme Forming", status: "ordered", expectedDate: "2026-12-02" }); expect(mine.ok).toBe(true);
    const r = await up(work, { status: "in_transit", expectedDate: "2026-12-03" }); expect(r.data).toMatchObject({ outcome: "updated", id: mine.data.id, status: "in_transit" });
    expect(raw.prepare("SELECT COUNT(*) n FROM procurement_items").get()).toMatchObject({ n: 1 }); expect(notifTasks().length).toBe(1); expect(notifTasks()[0]).toMatchObject({ related_date: "2026-12-03" });
  });
  it("adopts a delivery notification task that already exists for the material instead of creating a second one", async () => {
    const old = await run(work, "upsert_action_item", { key: "work:delivery:earlier", title: "Notify REEF: Formwork panels arriving Wed Dec 2", topic: "delivery", delivery: { arrivalDate: "2026-12-02", supplier: "Acme Forming" } });
    const r = await up(work, { status: "ordered", expectedDate: "2026-12-04" });
    expect(r.data.notificationTaskId).toBe(old.data.id); expect(notifTasks().length).toBe(1); expect(notifTasks()[0]).toMatchObject({ related_date: "2026-12-04", due_date: "2026-12-02" });
  });
  it("applies through the assistant inbox as task.create with a procurement block, idempotently", async () => {
    const ask = (id: string) => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?,?,?,?)").run(id, "progressive", "task.create", JSON.stringify({ key: base.key, sourceRef: base.sourceRef, procurement: { material: base.material, quantity: 40, unit: "pcs", supplier: base.supplier, orderRef: base.orderRef, status: "ordered", expectedDate: "2026-12-02" } }));
    ask("req-p-00000001"); ask("req-p-00000002"); await processInbox(db, { now: NOW });
    const rows = raw.prepare("SELECT status, result FROM assistant_inbox ORDER BY id").all() as any[]; expect(rows.map((r) => r.status)).toEqual(["applied", "duplicate"]); expect(JSON.parse(rows[0].result).outcome).toBe("created");
    expect(raw.prepare("SELECT COUNT(*) n FROM procurement_items").get()).toMatchObject({ n: 1 }); expect(notifTasks().length).toBe(1);
  });
  it("stays inside the assistant's module and validates input", async () => {
    expect((await up(work, { module: "health" })).ok).toBe(false); expect((await up(work, { quantity: -3 })).ok).toBe(false); expect((await run(work, "upsert_procurement", { key: "k2" })).ok).toBe(false);
    expect((await run(ctxFor(assistantActor("health")), "list_procurement", {})).data.count).toBe(0);
  });
  it("is write-guarded like every core table", () => {
    expect(() => raw.exec("INSERT INTO procurement_items (id,module,material,created_at,updated_at,created_by,updated_by) VALUES ('x','progressive','x','a','a','a','a')")).toThrow(/blocked/);
    expect(() => raw.exec("INSERT INTO progress_tracks (key,module,title,period_rule,steps,start_cycle,created_at,updated_at) VALUES ('x','progressive','x','{}','[]','2026-11','a','a')")).toThrow(/blocked/);
  });
});
