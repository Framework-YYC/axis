import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { maintenance } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { runTimeSchedule } from "../worker/services/timeSchedule";
import { ownerActor, type Ctx } from "../worker/services/types";
import { zonedInstant } from "../shared/timeSchedule";

const TZ = "America/Edmonton";
let db: D1Database, raw: ReturnType<typeof makeDb>["raw"];
let nowMs = 0;
const at = (date: string, hhmm: string, sec = 0) => zonedInstant(date, hhmm, TZ) + sec * 1000;
const owner = (): Ctx => ({ db, actor: ownerActor("web"), requestId: "t", now: () => new Date(nowMs) });
const run = (op: string, input: unknown = {}, c: Ctx = owner()) => runOperation(c, op, input) as Promise<any>;
const tick = (ms: number) => { nowMs = ms; return runTimeSchedule(db, new Date(ms)); };
const rows = () => raw.prepare("SELECT * FROM time_entries WHERE deleted_at IS NULL ORDER BY start_at").all() as any[];
const logs = () => raw.prepare("SELECT local_date, action, outcome FROM time_schedule_log ORDER BY id").all() as any[];
const iso = (ms: number) => new Date(ms).toISOString();
const configure = (over: Record<string, unknown> = {}) => run("timeclock_save_schedule", { timezone: TZ, startTime: "06:00", endTime: "17:30", jobId: "tjob_reef", enabled: true, ...over });
beforeEach(() => { const m = makeDb(); db = m.db; raw = m.raw; nowMs = at("2026-11-24", "12:00"); });

describe("configuration", () => {
  it("does nothing until the worksite time zone is set, and the device zone never counts", async () => {
    expect((await tick(at("2026-11-25", "06:00", 5))).applied).toBe(0); expect(rows()).toHaveLength(0); expect(logs()).toHaveLength(0);
    const v = (await run("get_timeclock", { today: "2026-11-25" })).data.schedule; expect(v.config.timezone).toBeNull(); expect(v.today).toBeNull();
  });
  it("validates, requires an active job, and is owner-only", async () => {
    expect((await configure({ timezone: "Mars/Olympus" })).ok).toBe(false);
    expect((await configure({ startTime: "17:30", endTime: "06:00" })).ok).toBe(false);
    await run("timeclock_save_job", { id: "tjob_reef", active: false });
    expect((await configure()).ok).toBe(false); await run("timeclock_save_job", { id: "tjob_reef", active: true });
    expect((await configure()).ok).toBe(true);
    const asst = { db, actor: assistantActor("progressive"), requestId: "t", now: () => new Date(nowMs) } as Ctx;
    expect((await run("timeclock_save_schedule", { timezone: TZ }, asst)).ok).toBe(false); expect((await run("timeclock_schedule_action", { action: "overtime" }, asst)).ok).toBe(false);
  });
});

describe("automatic clock-in", () => {
  beforeEach(async () => { await configure(); });
  it("punches into REEF at exactly 06:00 worksite time on an on-rotation day, labelled scheduled, once", async () => {
    await tick(at("2026-11-25", "05:59", 59)); expect(rows()).toHaveLength(0);
    expect((await tick(at("2026-11-25", "06:00", 20))).applied).toBe(1);
    const [e] = rows(); expect(e).toMatchObject({ kind: "job", job_id: "tjob_reef", source: "scheduled", end_at: null, start_at: iso(at("2026-11-25", "06:00")) });
    await tick(at("2026-11-25", "06:01")); await tick(at("2026-11-25", "06:02")); expect(rows()).toHaveLength(1); expect(logs()).toEqual([{ local_date: "2026-11-25", action: "in", outcome: "punched" }]);
    const view = (await run("get_timeclock", { today: "2026-11-25" })).data; expect(view.open.source).toBe("scheduled"); expect(view.schedule.today).toMatchObject({ onRotation: true, inOutcome: "punched" });
  });
  it("the app's poll and the maintenance tick both run the schedule", async () => {
    nowMs = at("2026-11-25", "06:00", 30);
    await run("get_timeclock", { today: "2026-11-25" }); expect(rows()).toHaveLength(1);
    const m = makeDb(); db = m.db; raw = m.raw; await configure(); await maintenance(db, new Date(at("2026-11-25", "06:00", 30))); expect(rows()).toHaveLength(1);
  });
  it("is never backfilled: a late run (Orbis not running, e.g. staging without a Cron Trigger) records a miss", async () => {
    await tick(at("2026-11-25", "09:00")); expect(rows()).toHaveLength(0); expect(logs()).toEqual([{ local_date: "2026-11-25", action: "in", outcome: "missed" }]);
    await tick(at("2026-11-25", "09:01")); expect(rows()).toHaveLength(0);
  });
  it("creates no punches on off-rotation days (fly home Dec 3 to Dec 9) and resumes Dec 10", async () => {
    for (const d of ["2026-12-03", "2026-12-05", "2026-12-09"]) { await tick(at(d, "06:00", 10)); await tick(at(d, "17:30", 10)); }
    expect(rows()).toHaveLength(0); expect(logs()).toHaveLength(0);
    await tick(at("2026-12-10", "06:00", 10)); expect(rows()).toHaveLength(1);
  });
  it("never overwrites or overlaps a manual punch", async () => {
    nowMs = at("2026-11-25", "05:50"); await run("timeclock_punch", { action: "job", jobId: "tjob_ripet", at: iso(nowMs), punchId: "m1" });
    await tick(at("2026-11-25", "06:00", 10));
    expect(rows()).toHaveLength(1); expect(rows()[0]).toMatchObject({ job_id: "tjob_ripet", source: "manual" }); expect(logs()).toEqual([{ local_date: "2026-11-25", action: "in", outcome: "skipped" }]);
    expect(raw.prepare("SELECT COUNT(*) n FROM time_entries WHERE end_at IS NULL").get()).toMatchObject({ n: 1 });
  });
  it("respects Skip today, and a deleted automatic punch is not recreated", async () => {
    nowMs = at("2026-11-25", "05:00"); expect((await run("timeclock_schedule_action", { action: "skip_in" })).ok).toBe(true);
    await tick(at("2026-11-25", "06:00", 10)); expect(rows()).toHaveLength(0);
    nowMs = at("2026-11-26", "05:00");
    await tick(at("2026-11-26", "06:00", 10)); const [e] = rows(); expect(e.source).toBe("scheduled");
    nowMs = at("2026-11-26", "06:05"); await run("timeclock_delete_entry", { id: e.id });
    await tick(at("2026-11-26", "06:06")); await tick(at("2026-11-26", "06:10")); expect(rows()).toHaveLength(0);
  });
  it("a different zone changes the instant (the worksite zone, not the device)", async () => {
    await configure({ timezone: "America/Toronto" }); await tick(at("2026-11-25", "06:00", 10)); expect(rows()).toHaveLength(0); // 06:00 in Edmonton is 08:00 in Toronto: already past the grace there
    expect(logs()).toEqual([{ local_date: "2026-11-25", action: "in", outcome: "missed" }]);
  });
});

describe("automatic clock-out and overtime", () => {
  beforeEach(async () => { await configure(); await tick(at("2026-11-25", "06:00", 5)); });
  it("ends the running job at exactly 17:30 and labels it scheduled", async () => {
    await tick(at("2026-11-25", "17:29", 59)); expect(rows()[0].end_at).toBeNull();
    expect((await tick(at("2026-11-25", "17:30", 5))).applied).toBe(1);
    expect(rows()[0]).toMatchObject({ end_at: iso(at("2026-11-25", "17:30")), end_source: "scheduled" }); expect(rows()).toHaveLength(1);
    await tick(at("2026-11-25", "17:31")); expect(rows()).toHaveLength(1); expect(logs().map((l) => `${l.action}:${l.outcome}`)).toEqual(["in:punched", "out:punched"]);
  });
  it("preserves manual job switches and breaks, and ends an active break at 17:30", async () => {
    nowMs = at("2026-11-25", "09:30"); await run("timeclock_punch", { action: "job", jobId: "tjob_ripet", at: iso(nowMs), punchId: "a" });
    nowMs = at("2026-11-25", "12:00"); await run("timeclock_punch", { action: "break", at: iso(nowMs), punchId: "b" });
    nowMs = at("2026-11-25", "12:30"); await run("timeclock_punch", { action: "resume", at: iso(nowMs), punchId: "c" });
    nowMs = at("2026-11-25", "17:00"); await run("timeclock_punch", { action: "break", at: iso(nowMs), punchId: "d" });
    await tick(at("2026-11-25", "17:30", 2));
    expect(rows().map((r) => [r.kind, r.job_id ?? r.resume_job_id, r.source, r.end_source])).toEqual([["job", "tjob_reef", "scheduled", null], ["job", "tjob_ripet", "manual", null], ["break", "tjob_ripet", "manual", null], ["job", "tjob_ripet", "manual", null], ["break", "tjob_ripet", "manual", "scheduled"]]);
    expect(rows()[4].end_at).toBe(iso(at("2026-11-25", "17:30")));
  });
  it("keeps an early manual clock-out: nothing is added or extended at 17:30", async () => {
    nowMs = at("2026-11-25", "16:00"); await run("timeclock_punch", { action: "end", at: iso(nowMs) });
    await tick(at("2026-11-25", "17:30", 5)); expect(rows()).toHaveLength(1); expect(rows()[0]).toMatchObject({ end_at: iso(at("2026-11-25", "16:00")), end_source: null });
  });
  it("supports overtime: marking it stops today's automatic clock-out, and working past 17:30 by hand is respected", async () => {
    nowMs = at("2026-11-25", "16:00"); expect((await run("timeclock_schedule_action", { action: "overtime" })).ok).toBe(true);
    expect((await run("timeclock_schedule_action", { action: "overtime" })).ok).toBe(false); // once
    await tick(at("2026-11-25", "17:30", 5)); await tick(at("2026-11-25", "19:00")); expect(rows()[0].end_at).toBeNull();
    nowMs = at("2026-11-25", "19:30"); await run("timeclock_punch", { action: "end", at: iso(nowMs) }); expect(rows()[0].end_at).toBe(iso(nowMs)); // the owner ends it
  });
  it("a manual punch after 17:30 after the automatic clock-out is its own entry; the gap is not counted", async () => {
    await tick(at("2026-11-25", "17:30", 5));
    nowMs = at("2026-11-25", "18:15"); await run("timeclock_punch", { action: "job", jobId: "tjob_ripet", at: iso(nowMs), punchId: "ot" });
    await tick(at("2026-11-25", "18:20")); expect(rows()).toHaveLength(2); expect(rows()[1]).toMatchObject({ source: "manual", end_at: null });
    expect((await run("timeclock_schedule_action", { action: "overtime" })).ok).toBe(false); // the clock-out already happened
  });
  it("a late run still ends the job at 17:30 (never later), so hours are not inflated", async () => {
    await tick(at("2026-11-25", "21:10")); expect(rows()[0].end_at).toBe(iso(at("2026-11-25", "17:30")));
  });
  it("a job left running from yesterday's shift is ended at yesterday's clock-out time", async () => {
    await tick(at("2026-11-26", "08:00")); expect(rows()[0]).toMatchObject({ end_at: iso(at("2026-11-25", "17:30")), end_source: "scheduled" });
  });
  it("corrections are allowed: an automatic entry can be edited like any other", async () => {
    await tick(at("2026-11-25", "17:30", 5)); const [e] = rows();
    nowMs = at("2026-11-25", "18:30");
    const r = await run("timeclock_edit_entry", { id: e.id, endAt: iso(at("2026-11-25", "18:15")) });
    expect(r.ok).toBe(true); expect(rows()[0]).toMatchObject({ end_at: iso(at("2026-11-25", "18:15")), edited: 1, source: "scheduled" });
  });
});

describe("failure and retry", () => {
  beforeEach(async () => { await configure(); });
  const flaky = (real: D1Database, failures: number) => { let n = failures; return { prepare: (s: string) => real.prepare(s), batch: async (st: any[]) => { if (n > 0) { n--; throw new Error("D1 unavailable"); } return real.batch(st); } } as unknown as D1Database; };
  it("a failed save changes nothing, is reported, and the next tick retries without duplicating", async () => {
    const real = db; db = flaky(real, 2); // the punch fails once and so does recording the status
    const r1 = await tick(at("2026-11-25", "06:00", 10)); expect(r1.error).toMatch(/will try again/); expect(rows()).toHaveLength(0); expect(logs()).toHaveLength(0);
    db = real;
    const r2 = await tick(at("2026-11-25", "06:01")); expect(r2.applied).toBe(1); expect(rows()).toHaveLength(1); expect(rows()[0].start_at).toBe(iso(at("2026-11-25", "06:00")));
    await tick(at("2026-11-25", "06:02")); expect(rows()).toHaveLength(1);
    expect((await run("get_timeclock", { today: "2026-11-25" })).data.schedule.status).toBeNull();
  });
  it("the failure is visible on the clock while it persists, and is not backfilled once the grace has passed", async () => {
    const real = db; db = { prepare: (s: string) => real.prepare(s), batch: async (st: any[]) => { if (st.some((x: any) => /time_entries|time_schedule_log/.test(String(x.sql ?? x)))) throw new Error("D1 unavailable"); return real.batch(st); } } as unknown as D1Database;
    expect((await tick(at("2026-11-25", "06:00", 10))).error).toBeTruthy();
    const status = await real.prepare("SELECT value FROM settings WHERE key = 'timeclock_schedule_status'").first<{ value: string }>(); expect(JSON.parse(status!.value).message).toMatch(/clock-in/);
    nowMs = at("2026-11-25", "06:05"); expect((await run("get_timeclock", { today: "2026-11-25" })).data.schedule.status.message).toMatch(/clock-in/); // shown on the clock while it persists
    db = real;
    await tick(at("2026-11-25", "06:20")); expect(rows()).toHaveLength(0); expect(logs()).toEqual([{ local_date: "2026-11-25", action: "in", outcome: "missed" }]);
  });
  it("two overlapping runs cannot double-punch (the day's record and the one-running-entry rule)", async () => {
    const t = new Date(at("2026-11-25", "06:00", 10));
    await Promise.all([runTimeSchedule(db, t), runTimeSchedule(db, t)]); expect(rows()).toHaveLength(1); expect(logs().filter((l) => l.action === "in")).toHaveLength(1);
  });
  it("direct writes to the schedule log are blocked", () => {
    expect(() => raw.prepare("INSERT INTO time_schedule_log (local_date, action, outcome, at, created_by) VALUES ('2026-11-25','in','punched','a','a')").run()).toThrow(/blocked/);
  });
});
