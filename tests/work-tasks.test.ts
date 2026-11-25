import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { processInbox } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { ownerActor, type Ctx } from "../worker/services/types";
import { describeRecurrence, nextOccurrence, validateRecurrence } from "../shared/recurrence";
import { deliveryDeadline, effectiveType } from "../shared/taskTypes";
import { DEFAULT_ROTATION } from "../shared/rotation";

const NOW = new Date("2026-11-24T18:00:00.000Z"); // Tuesday
let db: D1Database;
let raw: ReturnType<typeof makeDb>["raw"];
let owner: Ctx, work: Ctx;
const ctxFor = (actor: Ctx["actor"]): Ctx => ({ db, actor, requestId: "t", now: () => NOW });
const run = (c: Ctx, op: string, input: unknown = {}, key?: string) => runOperation(c, op, input, key) as Promise<any>;
beforeEach(() => { const m = makeDb(); db = m.db; raw = m.raw; owner = ctxFor(ownerActor("web")); work = ctxFor(assistantActor("progressive")); });

describe("rotation-aware recurrence", () => {
  const thu = { freq: "weekly" as const, interval: 1, byWeekday: [4], rotation: "on" as const };
  it("keeps the rule's weekday but skips the off-rotation week (2 on, 1 off)", () => {
    expect(nextOccurrence(thu, "2026-11-26", "2026-11-26", DEFAULT_ROTATION)).toBe("2026-12-10"); // Dec 3 falls in the week off
    expect(nextOccurrence({ ...thu, rotation: undefined }, "2026-11-26", "2026-11-26", DEFAULT_ROTATION)).toBe("2026-12-03"); // not rotation-aware: unchanged
    expect(nextOccurrence(thu, "2026-12-10", "2026-12-10", DEFAULT_ROTATION)).toBe("2026-12-17");
  });
  it("is only rotation-aware when configured and ignores the rotation otherwise", () => {
    expect(nextOccurrence(thu, "2026-11-19", "2026-11-19")).toBe("2026-11-26"); // no rotation config supplied
    expect(validateRecurrence({ freq: "daily", rotation: "on" }).rotation).toBe("on");
    expect(() => validateRecurrence({ freq: "daily", rotation: "off" })).toThrow();
  });
  it("Progress Meeting minutes completed on Tue 24 Nov 2026 are next due Tue 8 Dec 2026", () => {
    expect(nextOccurrence({ freq: "weekly", interval: 2, byWeekday: [2] }, "2026-11-24", "2026-11-24", DEFAULT_ROTATION)).toBe("2026-12-08");
  });
  it("month-end rules land on the last day of each month", () => {
    const r = { freq: "monthly" as const, interval: 1, byMonthDay: 31 };
    expect(nextOccurrence(r, "2026-11-30", "2026-11-30")).toBe("2026-12-31");
    expect(nextOccurrence(r, "2026-12-31", "2026-12-31")).toBe("2027-01-31");
    expect(nextOccurrence(r, "2027-01-31", "2027-01-31")).toBe("2027-02-28");
  });
  it("completing a recurring task creates exactly one next occurrence, honouring the rotation, and keeps history", async () => {
    const t = await run(owner, "create_task", { title: "Submit top 3 safety observations", module: "progressive", dueDate: "2026-11-26", recurrence: { freq: "weekly", interval: 1, byWeekday: [4], rotation: "on" } });
    expect(t.data.type).toBe("recurring");
    const done = await run(owner, "complete_task", { id: t.data.id, today: "2026-11-26" });
    expect(done.data.next.dueDate).toBe("2026-12-10");
    const again = await run(owner, "complete_task", { id: t.data.id, today: "2026-11-26" });
    expect(again.duplicate).toBe(true);
    const all = await run(owner, "list_tasks", { module: "progressive", type: "recurring", includeArchived: false, limit: 50 });
    expect(all.data.tasks.filter((x: any) => x.title.startsWith("Submit top 3")).length).toBe(2); // one done (history), one open
  });
});

describe("task types", () => {
  it("derives the type without rewriting existing rows", () => {
    expect(effectiveType({ recurrence: '{"freq":"daily"}', task_type: null, source_kind: "manual" })).toBe("recurring");
    expect(effectiveType({ recurrence: null, task_type: null, source_kind: "manual" })).toBe("manual");
    expect(effectiveType({ recurrence: null, task_type: null, source_kind: "assistant" })).toBe("action_item");
    expect(effectiveType({ recurrence: null, task_type: "manual", source_kind: "assistant" })).toBe("manual");
  });
  it("lists tasks by type: the owner's tasks are manual, assistant tasks are action items", async () => {
    await run(owner, "create_task", { title: "My own task", module: "progressive" });
    await run(work, "create_task", { title: "From an email", externalId: "w:1" });
    await run(owner, "create_task", { title: "Weekly thing", module: "progressive", dueDate: "2026-11-30", recurrence: { freq: "weekly", interval: 1 } });
    const titles = async (type: string) => (await run(owner, "list_tasks", { type })).data.tasks.map((x: any) => x.title);
    expect(await titles("manual")).toEqual(["My own task"]);
    expect(await titles("action_item")).toEqual(["From an email"]);
    expect(await titles("recurring")).toEqual(["Weekly thing"]);
  });
});

describe("email-derived action items (upsert_action_item)", () => {
  const bolts = { key: "work:email:t100:bolts", title: "Verify availability of 3/4-inch bolts", topic: "materials", sourceRef: "Email: Site Supervisor, 'Anchor bolts', 2026-11-24" };
  it("creates once, never duplicates, and updates the open task with new information", async () => {
    const a = await run(work, "upsert_action_item", bolts);
    expect(a.ok && a.data.outcome).toBe("created");
    expect(a.data).toMatchObject({ type: "action_item", topic: "materials", module: "progressive", source: { ref: bolts.sourceRef } });
    const b = await run(work, "upsert_action_item", bolts);
    expect(b.data.outcome).toBe("unchanged"); expect(b.duplicate).toBe(true);
    const c = await run(work, "upsert_action_item", { ...bolts, dueDate: "2026-11-27", priority: "high" });
    expect(c.data).toMatchObject({ outcome: "updated", dueDate: "2026-11-27", priority: "high", id: a.data.id });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 1 });
  });
  it("adopts an existing open task with the same title instead of duplicating it", async () => {
    await run(work, "create_task", { title: "Verify availability of 3/4-inch bolts" });
    const r = await run(work, "upsert_action_item", bolts);
    expect(r.data.outcome).toBe("updated");
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 1 });
  });
  it("respects completed tasks: nothing is reopened or changed", async () => {
    const a = await run(work, "upsert_action_item", bolts);
    await run(owner, "complete_task", { id: a.data.id, today: "2026-11-24" });
    const r = await run(work, "upsert_action_item", { ...bolts, dueDate: "2026-12-01", title: "Changed title" });
    expect(r.data).toMatchObject({ outcome: "completed_unchanged", status: "completed", title: bolts.title, dueDate: null });
  });
  it("cancelling hides the item (recoverable) and never touches a completed one", async () => {
    const a = await run(work, "upsert_action_item", bolts);
    const c = await run(work, "upsert_action_item", { key: bolts.key, state: "cancelled", sourceRef: "Email: cancelled" });
    expect(c.data.outcome).toBe("cancelled");
    expect((await run(owner, "list_tasks", {})).data.count).toBe(0);
    expect((await run(work, "upsert_action_item", { key: bolts.key, state: "cancelled" })).data.outcome).toBe("already_cancelled");
    expect(raw.prepare("SELECT archived_at FROM tasks WHERE id = ?").get(a.data.id)).not.toMatchObject({ archived_at: null });
    expect((await run(work, "upsert_action_item", { key: "nothing", state: "cancelled" })).ok).toBe(false);
  });
  it("stays inside the assistant's own module", async () => {
    const r = await run(work, "upsert_action_item", { ...bolts, module: "health" });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("forbidden");
  });
  it("applies through the assistant inbox as task.create with a key, and is idempotent there", async () => {
    const ask = (id: string, payload: unknown) => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?,?,?,?)").run(id, "progressive", "task.create", JSON.stringify(payload));
    ask("req-w-00000001", bolts); ask("req-w-00000002", bolts);
    await processInbox(db, { now: NOW });
    const rows = raw.prepare("SELECT id, status, result FROM assistant_inbox ORDER BY id").all() as any[];
    expect(rows.map((r) => r.status)).toEqual(["applied", "duplicate"]);
    expect(JSON.parse(rows[0].result).outcome).toBe("created");
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 1 });
  });
});

describe("delivery tracking: notify at least 24 hours before arrival", () => {
  const base = { key: "work:email:t200:reef-delivery-1", title: "Notify REEF: formwork delivery", sourceRef: "Email: Supplier, 'Delivery schedule', 2026-11-24" };
  it("computes the deadline from the arrival and never invents one", () => {
    expect(deliveryDeadline("2026-12-02", "09:30")).toEqual({ dueDate: "2026-12-01", dueTime: "09:30", basis: "arrival_time" });
    expect(deliveryDeadline("2026-12-02")).toEqual({ dueDate: "2026-11-30", dueTime: null, basis: "arrival_date" }); // earliest possible arrival is 00:00 on the day
    expect(deliveryDeadline(undefined)).toBeNull();
    expect(deliveryDeadline(null, "09:00")).toBeNull();
  });
  it("creates a notification task with the deadline, details and source", async () => {
    const r = await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-02", arrivalTime: "09:30", supplier: "Acme Forming" }, description: "Formwork panels, 40 pcs" });
    expect(r.data).toMatchObject({ outcome: "created", topic: "delivery", dueDate: "2026-12-01", dueTime: "09:30", relatedDate: "2026-12-02", relatedTime: "09:30", supplier: "Acme Forming", status: "pending", source: { ref: base.sourceRef } });
  });
  it("reschedules the same task (no duplicate) and moves the deadline", async () => {
    await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-02", arrivalTime: "09:30" } });
    const r = await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-04" } });
    expect(r.data).toMatchObject({ outcome: "updated", relatedDate: "2026-12-04", dueDate: "2026-12-02", dueTime: null });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 1 });
  });
  it("with no arrival date it sets no deadline, then adds it when the date arrives", async () => {
    const a = await run(work, "upsert_action_item", { ...base, delivery: { supplier: "Acme Forming" } });
    expect(a.data).toMatchObject({ outcome: "created", dueDate: null, dueTime: null, relatedDate: null, priority: "high" });
    expect(a.data.notes).toMatch(/not yet confirmed/);
    const b = await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-10" } });
    expect(b.data).toMatchObject({ outcome: "updated", dueDate: "2026-12-08", notes: null });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 1 });
  });
  it("a delivery rescheduled after the notification task was completed asks for a new notification and changes nothing", async () => {
    const a = await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-02" } });
    await run(owner, "complete_task", { id: a.data.id, today: "2026-11-30" });
    const r = await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-09" } });
    expect(r.data).toMatchObject({ outcome: "completed_unchanged", needsNewNotification: true, relatedDate: "2026-12-02" });
  });
  it("a cancelled delivery hides its notification task", async () => {
    await run(work, "upsert_action_item", { ...base, delivery: { arrivalDate: "2026-12-02" } });
    expect((await run(work, "upsert_action_item", { key: base.key, state: "cancelled", sourceRef: "Email: delivery cancelled" })).data.outcome).toBe("cancelled");
    expect((await run(owner, "list_tasks", {})).data.count).toBe(0);
  });
});

describe("Work recurring responsibilities setup", () => {
  it("creates the ten responsibilities, with Progress Meeting minutes next due 8 Dec 2026", async () => {
    const dry = await run(owner, "setup_work_recurring", { today: "2026-11-24", dryRun: true });
    expect(dry.data.items.every((x: any) => x.outcome === "would_create")).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 0 }); // a dry run writes nothing
    const r = await run(owner, "setup_work_recurring", { today: "2026-11-24" });
    expect(r.data.created).toBe(10);
    const open = (await run(owner, "list_tasks", { module: "progressive", type: "recurring", status: ["pending"], limit: 50 })).data.tasks as any[];
    const due = Object.fromEntries(open.map((t) => [t.title, t.dueDate]));
    expect(due).toMatchObject({
      "Send daily headcount": "2026-11-24", // every day while on rotation
      "Distribute REEF EHS meeting minutes": "2026-11-30", // Mon 30 Nov is still on rotation (on Nov 19 to Dec 2; the week off starts Dec 3)
      "Submit top 3 safety observations": "2026-11-26",
      "Invite REEF EHS to safety meeting and site walk-down": "2026-11-28",
      "Prepare next week's toolbox talks": "2026-11-29",
      "Update Progress Meeting minutes": "2026-12-08",
      "Complete weekly REEF KPIs": "2026-11-29", "Complete weekly RIPET KPIs": "2026-11-29",
      "Finalise monthly REEF KPIs": "2026-11-30", "Finalise monthly RIPET KPIs": "2026-11-30",
    });
    const done = (await run(owner, "get_completed_tasks", { module: "progressive", since: "2026-11-24" })).data.tasks as any[];
    expect(done.map((t) => t.title)).toEqual(["Update Progress Meeting minutes"]); // today's completion is in its history
    expect(open.find((t) => t.title === "Send daily headcount").recurrence).toMatchObject({ freq: "weekly", byWeekday: [0, 1, 2, 3, 4, 5, 6], rotation: "on" });
    expect(open.find((t) => t.title === "Complete weekly REEF KPIs").recurrence.rotation).toBeUndefined();
  });
  it("never duplicates: running it again, or when similar tasks already exist, creates nothing new", async () => {
    await run(owner, "create_task", { title: "Weekly REEF KPIs", module: "progressive", dueDate: "2026-11-29" }); // an existing, differently worded task
    await run(owner, "create_task", { title: "Update progress meeting minutes", module: "progressive" });
    const a = await run(owner, "setup_work_recurring", { today: "2026-11-24" });
    expect(a.data.created).toBe(8);
    expect(a.data.items.filter((x: any) => x.outcome === "exists").map((x: any) => x.title).sort()).toEqual(["Complete weekly REEF KPIs", "Update Progress Meeting minutes"]);
    const b = await run(owner, "setup_work_recurring", { today: "2026-11-24" });
    expect(b.data.created).toBe(0);
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toMatchObject({ n: 10 }); // the 2 existing tasks plus 8 new series
  });
  it("is owner-only", async () => {
    expect((await run(work, "setup_work_recurring", {})).ok).toBe(false);
  });
});

describe("daily headcount recurs seven days a week while on rotation", () => {
  const rule = { freq: "weekly" as const, interval: 1, byWeekday: [0, 1, 2, 3, 4, 5, 6], rotation: "on" as const };
  it("every day inside an on-rotation block, nothing in the week off", () => {
    expect(nextOccurrence(rule, "2026-11-28", "2026-11-28", DEFAULT_ROTATION)).toBe("2026-11-29"); // Saturday to Sunday, still on rotation
    expect(nextOccurrence(rule, "2026-11-29", "2026-11-29", DEFAULT_ROTATION)).toBe("2026-11-30"); // still on rotation: on Nov 19 to Dec 2
    expect(nextOccurrence(rule, "2026-12-02", "2026-12-02", DEFAULT_ROTATION)).toBe("2026-12-10"); // Dec 3 to Dec 9 is the week off (fly home Dec 3)
    expect(nextOccurrence(rule, "2026-12-10", "2026-12-10", DEFAULT_ROTATION)).toBe("2026-12-11");
    expect(describeRecurrence(rule)).toBe("Every day · on rotation");
  });
});
