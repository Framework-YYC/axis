import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULE, GRACE_MS, nextScheduledDay, parseSchedule, planSchedule, validateSchedule, zonedInstant, type LogRow, type PlanInput, type ScheduleConfig } from "../shared/timeSchedule";
import { DEFAULT_ROTATION, rotationStatus } from "../shared/rotation";

const TZ = "America/Edmonton";
const cfg: ScheduleConfig = { ...DEFAULT_SCHEDULE, timezone: TZ };
const onRot = (d: string) => rotationStatus(d, DEFAULT_ROTATION).phase === "on";
const at = (date: string, hhmm: string, sec = 0) => zonedInstant(date, hhmm, TZ) + sec * 1000;
const base = (nowMs: number, over: Partial<PlanInput> = {}): PlanInput => ({ nowMs, cfg, onRotation: onRot, log: [], open: null, anyEntryAfter: () => false, jobUsable: true, ...over });
const kinds = (p: ReturnType<typeof planSchedule>) => p.map((x) => `${x.date} ${x.action} ${x.kind}${x.outcome === "punched" ? "" : ":" + x.outcome}`);

describe("configuration", () => {
  it("does nothing until the worksite time zone is chosen, or when disabled", () => {
    expect(planSchedule({ ...base(at("2026-11-25", "06:00")), cfg: { ...cfg, timezone: null } })).toEqual([]);
    expect(planSchedule({ ...base(at("2026-11-25", "06:00")), cfg: { ...cfg, enabled: false } })).toEqual([]);
  });
  it("validates times and zones; unreadable stored values fall back to inert defaults", () => {
    expect(validateSchedule({ timezone: TZ, startTime: "06:00", endTime: "17:30" }).timezone).toBe(TZ);
    expect(() => validateSchedule({ timezone: "Mars/Olympus" })).toThrow(/time zone/);
    expect(() => validateSchedule({ startTime: "17:30", endTime: "06:00" })).toThrow(/after/);
    expect(() => validateSchedule({ startTime: "6:00" })).toThrow(/HH:MM/);
    expect(parseSchedule("{not json")).toEqual(DEFAULT_SCHEDULE); expect(parseSchedule(null).timezone).toBeNull();
  });
  it("converts worksite wall-clock time to the right instant, across daylight saving", () => {
    expect(new Date(zonedInstant("2026-11-25", "06:00", "America/New_York")).toISOString()).toBe("2026-11-25T11:00:00.000Z"); // EST
    expect(new Date(zonedInstant("2026-07-01", "06:00", "America/New_York")).toISOString()).toBe("2026-07-01T10:00:00.000Z"); // EDT
    expect(new Date(zonedInstant("2026-11-01", "06:00", "America/New_York")).toISOString()).toBe("2026-11-01T11:00:00.000Z"); // after the fall-back at 02:00
    expect(new Date(zonedInstant("2026-03-08", "06:00", "America/New_York")).toISOString()).toBe("2026-03-08T10:00:00.000Z"); // after the spring-forward
    expect(zonedInstant("2026-11-25", "06:00", "America/Vancouver")).not.toBe(zonedInstant("2026-11-25", "06:00", "America/New_York")); // the worksite zone, not a device zone, decides
  });
});

describe("clock-in at the start time (Wed 25 Nov 2026 is day 7 of the on-rotation block)", () => {
  it("boundaries: nothing at 05:59:59, a punch at 06:00:00 stamped 06:00, still a punch at 06:14:59, missed (never backfilled) from 06:15:01", () => {
    expect(planSchedule(base(at("2026-11-25", "05:59", 59)))).toEqual([]);
    const p = planSchedule(base(at("2026-11-25", "06:00", 0)));
    expect(kinds(p)).toEqual(["2026-11-25 in punch_in"]); expect(p[0].atMs).toBe(at("2026-11-25", "06:00"));
    const late = planSchedule(base(at("2026-11-25", "06:00") + GRACE_MS - 1000)); expect(late[0].kind).toBe("punch_in"); expect(late[0].atMs).toBe(at("2026-11-25", "06:00")); // stamped at its scheduled time, not at the run time
    expect(kinds(planSchedule(base(at("2026-11-25", "06:00") + GRACE_MS + 1000)))).toEqual(["2026-11-25 in log:missed"]);
    expect(kinds(planSchedule(base(at("2026-11-25", "09:00"))))).toEqual(["2026-11-25 in log:missed"]); // opened late (e.g. staging without a cron): no backfill
  });
  it("is idempotent: once recorded, the same minute plans nothing", () => {
    const log: LogRow[] = [{ date: "2026-11-25", action: "in", outcome: "punched" }];
    expect(planSchedule(base(at("2026-11-25", "06:01"), { log, open: { id: "x", startMs: at("2026-11-25", "06:00") } }))).toEqual([]);
  });
  it("never overwrites or overlaps a manual punch: a running entry or any later entry means skip", () => {
    expect(kinds(planSchedule(base(at("2026-11-25", "06:00", 5), { open: { id: "m", startMs: at("2026-11-25", "05:55") } })))).toEqual(["2026-11-25 in log:skipped"]);
    expect(kinds(planSchedule(base(at("2026-11-25", "06:00", 5), { anyEntryAfter: (ms) => ms < at("2026-11-25", "06:30") })))).toEqual(["2026-11-25 in log:skipped"]);
    expect(kinds(planSchedule(base(at("2026-11-25", "06:00", 5), { jobUsable: false })))).toEqual(["2026-11-25 in log:skipped"]);
  });
  it("respects the owner's skip for the day", () => {
    expect(planSchedule(base(at("2026-11-25", "06:02"), { log: [{ date: "2026-11-25", action: "in", outcome: "skipped" }] }))).toEqual([]);
  });
});

describe("rotation: no automatic punches on off-rotation days", () => {
  it("rotation boundaries: on Dec 2 (day 14), off Dec 3 (fly home) to Dec 9, on again Dec 10", () => {
    expect(kinds(planSchedule(base(at("2026-12-02", "06:00"))))).toEqual(["2026-12-02 in punch_in"]);
    for (const d of ["2026-12-03", "2026-12-06", "2026-12-09"]) expect(planSchedule(base(at(d, "06:00")))).toEqual([]);
    expect(kinds(planSchedule(base(at("2026-12-10", "06:00"))))).toEqual(["2026-12-10 in punch_in"]);
    expect(kinds(planSchedule(base(at("2026-11-18", "06:00"))))).toEqual([]); // the day before the block starts (still off)
    expect(kinds(planSchedule(base(at("2026-11-19", "06:00"))))).toEqual(["2026-11-19 in punch_in"]);
  });
  it("an off-rotation day never ends a manual entry either", () => {
    expect(planSchedule(base(at("2026-12-04", "17:30"), { open: { id: "m", startMs: at("2026-12-04", "08:00") } }))).toEqual([]);
  });
  it("the next scheduled day skips the week off", () => { expect(nextScheduledDay("2026-12-03", onRot)).toBe("2026-12-10"); expect(nextScheduledDay("2026-11-25", onRot)).toBe("2026-11-25"); });
});

describe("clock-out at the end time", () => {
  const run = { id: "e1", startMs: at("2026-11-25", "06:00") };
  it("boundaries: nothing at 17:29:59, the running job or break ends at 17:30:00 exactly", () => {
    expect(planSchedule(base(at("2026-11-25", "17:29", 59), { open: run, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }] }))).toEqual([]);
    const p = planSchedule(base(at("2026-11-25", "17:30"), { open: run, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }] }));
    expect(kinds(p)).toEqual(["2026-11-25 out punch_out"]); expect(p[0].atMs).toBe(at("2026-11-25", "17:30")); expect(p[0].entryId).toBe("e1");
  });
  it("a late run still ends it at 17:30, never later, and only once", () => {
    const p = planSchedule(base(at("2026-11-25", "20:10"), { open: run, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }] }));
    expect(p.find((x) => x.action === "out")!.atMs).toBe(at("2026-11-25", "17:30"));
    expect(planSchedule(base(at("2026-11-25", "20:11"), { open: null, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }, { date: "2026-11-25", action: "out", outcome: "punched" }] }))).toEqual([]);
  });
  it("preserves early clock-outs (nothing to end) and records why", () => {
    expect(kinds(planSchedule(base(at("2026-11-25", "17:30"), { open: null, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }] })))).toEqual(["2026-11-25 out log:none"]);
  });
  it("supports overtime: an owner marker, or a manual punch after 17:30, stops the automatic clock-out", () => {
    expect(planSchedule(base(at("2026-11-25", "18:00"), { open: run, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }, { date: "2026-11-25", action: "out", outcome: "overtime" }] }))).toEqual([]);
    expect(kinds(planSchedule(base(at("2026-11-25", "19:00"), { open: { id: "o", startMs: at("2026-11-25", "17:45") }, log: [{ date: "2026-11-25", action: "in", outcome: "punched" }] })))).toEqual(["2026-11-25 out log:skipped"]);
  });
  it("ends a job left running from yesterday's shift at yesterday's end time, but never a much older one", () => {
    const p = planSchedule(base(at("2026-11-26", "08:00"), { open: { id: "y", startMs: at("2026-11-25", "06:00") } }));
    expect(p.filter((x) => x.kind === "punch_out").map((x) => x.date)).toEqual(["2026-11-25"]);
    expect(planSchedule(base(at("2026-11-27", "08:00"), { open: { id: "z", startMs: at("2026-11-24", "06:00") } })).some((x) => x.kind === "punch_out")).toBe(false);
  });
  it("a configurable window works (e.g. 05:30 to 16:00)", () => {
    expect(kinds(planSchedule({ ...base(at("2026-11-25", "05:30")), cfg: { ...cfg, startTime: "05:30", endTime: "16:00" } }))).toEqual(["2026-11-25 in punch_in"]);
  });
});
