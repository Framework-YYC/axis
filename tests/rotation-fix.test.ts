import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { runOperation } from "../worker/services/operations";
import { ensureRotationAligned, realignRotationTasks } from "../worker/services/rotation";
import { prefsOf } from "../worker/services/prefs";
import { ownerActor, type Ctx } from "../worker/services/types";
import { nextOccurrence } from "../shared/recurrence";
import { DEFAULT_ROTATION, LEGACY_SEED_ROTATION, phaseWindow, resolveRotation, rotationStatus, upcomingTravel } from "../shared/rotation";

describe("rotation boundaries (calendar confirmed: on Nov 19 to Dec 2, fly home Dec 3)", () => {
  it("Nov 25 is day 7 of 14 with 7 rotation days remaining", () => {
    expect(rotationStatus("2026-11-25", DEFAULT_ROTATION)).toMatchObject({ phase: "on", dayInPhase: 7, phaseLength: 14, daysRemaining: 7, nextChange: "2026-12-03" });
  });
  it("on Nov 19 to Dec 2 inclusive, off from Dec 3, on again Dec 10 (travel Thursdays)", () => {
    expect(rotationStatus("2026-11-18", DEFAULT_ROTATION)).toMatchObject({ phase: "off", dayInPhase: 7, daysRemaining: 0, nextChange: "2026-11-19" });
    expect(rotationStatus("2026-11-19", DEFAULT_ROTATION)).toMatchObject({ phase: "on", dayInPhase: 1, daysRemaining: 13 });
    expect(rotationStatus("2026-12-02", DEFAULT_ROTATION)).toMatchObject({ phase: "on", dayInPhase: 14, daysRemaining: 0, nextChange: "2026-12-03" });
    expect(rotationStatus("2026-12-03", DEFAULT_ROTATION)).toMatchObject({ phase: "off", dayInPhase: 1, daysRemaining: 6, nextChange: "2026-12-10" });
    expect(rotationStatus("2026-12-09", DEFAULT_ROTATION)).toMatchObject({ phase: "off", dayInPhase: 7, daysRemaining: 0 });
    expect(rotationStatus("2026-12-10", DEFAULT_ROTATION)).toMatchObject({ phase: "on", dayInPhase: 1 });
    expect(phaseWindow("2026-11-25", DEFAULT_ROTATION)).toEqual({ phase: "on", start: "2026-11-19", end: "2026-12-02" });
  });
  it("flags dates beyond the confirmed calendar instead of presenting them as events", () => {
    const t = upcomingTravel("2026-11-25", DEFAULT_ROTATION, 3);
    expect(t).toEqual([
      { date: "2026-12-03", kind: "fly_home", confirmed: true, thursday: true },
      { date: "2026-12-10", kind: "fly_out", confirmed: false, thursday: true },
      { date: "2026-12-24", kind: "fly_home", confirmed: false, thursday: true },
    ]);
    expect(upcomingTravel("2026-11-25", { ...DEFAULT_ROTATION, offDays: 0 })).toEqual([]);
  });
  it("the early seed value is read as the corrected default; an owner's own different value is kept", () => {
    expect(resolveRotation(LEGACY_SEED_ROTATION)).toEqual(DEFAULT_ROTATION);
    expect(resolveRotation(null)).toEqual(DEFAULT_ROTATION);
    expect(resolveRotation({ anchorDate: "2027-01-07", onDays: 14, offDays: 7 })).toEqual({ anchorDate: "2027-01-07", onDays: 14, offDays: 7 });
  });
  it("rotation-dependent rules agree with the same schedule (daily headcount stops Dec 2 and resumes Dec 10)", () => {
    const daily = { freq: "weekly" as const, interval: 1, byWeekday: [0, 1, 2, 3, 4, 5, 6], rotation: "on" as const };
    expect(nextOccurrence(daily, "2026-12-02", "2026-12-02", DEFAULT_ROTATION)).toBe("2026-12-10");
    expect(nextOccurrence(daily, "2026-11-25", "2026-11-25", DEFAULT_ROTATION)).toBe("2026-11-26");
    expect(nextOccurrence({ freq: "weekly", interval: 1, byWeekday: [1], rotation: "on" }, "2026-11-23", "2026-11-23", DEFAULT_ROTATION)).toBe("2026-11-30");
  });
});

const NOW = new Date("2026-11-24T18:00:00.000Z");
let db: D1Database, owner: Ctx;
const run = (c: Ctx, op: string, input: unknown = {}) => runOperation(c, op, input) as Promise<any>;
beforeEach(() => { db = makeDb().db; owner = { db, actor: ownerActor("web"), requestId: "t", now: () => NOW }; });

describe("realigning open occurrences (the settings row from the first migration holds the early anchor)", () => {
  // What the schedule produced under the early anchor (on Nov 16-29, off Nov 30-Dec 6, on Dec 7-20).
  const stale = (): Ctx => ({ ...owner, prefs: { timezone: "UTC", weekStart: 1, rotation: LEGACY_SEED_ROTATION } });
  const monday = { freq: "weekly" as const, interval: 1, byWeekday: [1], rotation: "on" as const };
  const mk = async (title: string, due: string, rule: unknown) => (await run(owner, "create_task", { title, module: "progressive", dueDate: due, recurrence: rule })).data;

  it("the effective rotation is the corrected one even though the database still holds the early seed", async () => {
    expect((await prefsOf(owner)).rotation).toEqual(DEFAULT_ROTATION);
    expect((await run(owner, "get_settings")).data.work_rotation).toEqual(DEFAULT_ROTATION);
  });

  it("moves only rotation-dependent open occurrences, keeps history and everything else, and is idempotent", async () => {
    const a = await mk("Distribute REEF EHS meeting minutes", "2026-11-23", monday);
    const doneA = await run(stale(), "complete_task", { id: a.id, today: "2026-11-23" });
    expect(doneA.data.next.dueDate).toBe("2026-12-07"); // pushed past the (old) week off
    const plain = await mk("Update Progress Meeting minutes", "2026-12-08", { freq: "weekly", interval: 2, byWeekday: [2] }); // not rotation-dependent
    const overdue = await mk("Overdue rotation task", "2026-11-20", monday);
    const moved = await realignRotationTasks(db, NOW);
    expect(moved.map((m) => [m.title, m.from, m.to, m.unconfirmed])).toEqual([["Distribute REEF EHS meeting minutes", "2026-12-07", "2026-11-30", false]]);
    const list = (await run(owner, "list_tasks", { module: "progressive", includeArchived: false, limit: 50 })).data.tasks;
    const byId = (id: string) => list.find((t: any) => t.id === id);
    expect(byId(a.id).status).toBe("completed"); expect(byId(a.id).dueDate).toBe("2026-11-23"); // history untouched
    expect(byId(doneA.data.next.id).dueDate).toBe("2026-11-30");
    expect(byId(plain.id).dueDate).toBe("2026-12-08"); // not rotation-dependent: not moved or duplicated
    expect(byId(overdue.id).dueDate).toBe("2026-11-20"); // overdue stays overdue
    expect(list.filter((t: any) => t.title.startsWith("Distribute REEF")).length).toBe(2);
    expect(await realignRotationTasks(db, NOW)).toEqual([]); // second run: nothing
  });

  it("pushes an occurrence off a rotation-off day to the next on date and flags dates beyond the confirmed calendar", async () => {
    const t = await mk("Weekly walk-down", "2026-12-06", { freq: "weekly", interval: 1, byWeekday: [0], rotation: "on" }); // Sunday Dec 6 is in the week off
    const moved = await realignRotationTasks(db, NOW);
    expect(moved).toEqual([{ id: t.id, title: "Weekly walk-down", from: "2026-12-06", to: "2026-12-13", unconfirmed: true }]);
  });

  it("ensureRotationAligned runs once per rotation setting and changing the setting realigns again", async () => {
    await mk("Plain rotation task", "2026-11-26", { freq: "weekly", interval: 1, byWeekday: [4], rotation: "on" });
    expect(await ensureRotationAligned(db, NOW)).toEqual([]); // first time: runs (nothing to move), remembered
    expect(await ensureRotationAligned(db, NOW)).toBeNull(); // same setting: skipped
    const r = await run(owner, "set_setting", { key: "work_rotation", value: { anchorDate: "2026-11-19", onDays: 7, offDays: 7 } });
    expect(r.ok).toBe(true);
    expect(await ensureRotationAligned(db, NOW)).toBeNull(); // already realigned by the setting change itself
  });
});
