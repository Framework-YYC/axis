import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { ownerActor, type Ctx } from "../worker/services/types";
import { demoTimeEntries } from "../worker/services/timeclock";

let db: D1Database, raw: ReturnType<typeof makeDb>["raw"];
let nowMs = Date.parse("2026-11-25T13:00:00.000Z"); // 06:00 local in Calgary-like UTC-7 offsets is irrelevant: instants are UTC
let owner: Ctx;
const at = (min: number) => new Date(nowMs + min * 60_000).toISOString();
const adv = (min: number) => { nowMs += min * 60_000; };
beforeEach(() => { const m = makeDb(); db = m.db; raw = m.raw; nowMs = Date.parse("2026-11-25T13:00:00.000Z"); owner = { db, actor: ownerActor("web"), requestId: "t", now: () => new Date(nowMs) }; });
const run = (op: string, input: unknown = {}, c: Ctx = owner) => runOperation(c, op, input) as Promise<any>;
const punch = (input: Record<string, unknown>) => run("timeclock_punch", input);
const state = async () => (await run("get_timeclock", { today: "2026-11-25" })).data;
const rows = () => raw.prepare("SELECT * FROM time_entries WHERE deleted_at IS NULL ORDER BY start_at").all() as any[];

describe("jobs", () => {
  it("starts with REEF 928 and RIPET 1011, configurable", async () => {
    const s = await state();
    expect(s.jobs.map((j: any) => [j.name, j.number, j.active])).toEqual([["REEF", "928", true], ["RIPET", "1011", true]]);
    const added = await run("timeclock_save_job", { name: "Camp", number: "77" });
    expect(added.data.jobs.map((j: any) => j.name)).toEqual(["REEF", "RIPET", "Camp"]);
    const renamed = await run("timeclock_save_job", { id: "tjob_reef", name: "REEF Phase 2", number: "929" });
    expect(renamed.data.jobs[0]).toMatchObject({ name: "REEF Phase 2", number: "929" });
    expect((await run("timeclock_save_job", { name: "" })).ok).toBe(false);
  });
  it("an archived job cannot be punched, and a running job cannot be archived", async () => {
    await run("timeclock_save_job", { id: "tjob_ripet", active: false });
    expect((await punch({ action: "job", jobId: "tjob_ripet" })).ok).toBe(false);
    await punch({ action: "job", jobId: "tjob_reef" });
    const r = await run("timeclock_save_job", { id: "tjob_reef", active: false });
    expect(r.ok).toBe(false); expect(r.error.message).toMatch(/running/);
  });
});

describe("punching", () => {
  it("a tap starts the shift; a second job stops the first and starts the next at the same instant", async () => {
    expect((await punch({ action: "job", jobId: "tjob_reef" })).data.open).toMatchObject({ kind: "job", jobId: "tjob_reef" });
    adv(210);
    const r = await punch({ action: "job", jobId: "tjob_ripet" });
    expect(r.data.applied).toBe(true); expect(r.data.open.jobId).toBe("tjob_ripet");
    const [a, b] = rows();
    expect(a.end_at).toBe(b.start_at); expect(a.end_at).toBe(new Date(nowMs).toISOString()); expect(b.end_at).toBeNull();
    expect(rows().filter((x) => x.end_at === null)).toHaveLength(1); // only ever one running
  });
  it("tapping the running job again is a no-op: no duplicate punch", async () => {
    await punch({ action: "job", jobId: "tjob_reef" }); adv(1);
    const again = await punch({ action: "job", jobId: "tjob_reef" });
    expect(again.duplicate).toBe(true); expect(again.data.applied).toBe(false); expect(rows()).toHaveLength(1);
  });
  it("a retried save with the same punch id never creates a second entry", async () => {
    await punch({ action: "job", jobId: "tjob_reef", punchId: "p1" }); adv(5);
    const first = await punch({ action: "job", jobId: "tjob_ripet", punchId: "p2", at: at(0) });
    const retry = await punch({ action: "job", jobId: "tjob_ripet", punchId: "p2", at: at(0) });
    expect(first.data.applied).toBe(true); expect(retry.duplicate).toBe(true); expect(retry.data.message).toMatch(/already saved/); expect(rows()).toHaveLength(2);
  });
  it("a delayed save keeps the time of the tap", async () => {
    await punch({ action: "job", jobId: "tjob_reef" }); adv(30);
    const tapped = at(-5); // tapped five minutes ago while the save failed
    const r = await punch({ action: "job", jobId: "tjob_ripet", at: tapped, punchId: "late" });
    expect(r.ok).toBe(true); expect(rows()[1].start_at).toBe(tapped);
  });
  it("break stops the job, resume returns to it, End Shift stops everything; nothing ends or is deducted on its own", async () => {
    await punch({ action: "job", jobId: "tjob_ripet" }); adv(180);
    expect((await punch({ action: "break" })).data.open).toMatchObject({ kind: "break", resumeJobId: "tjob_ripet" }); adv(30);
    expect((await punch({ action: "break" })).duplicate).toBe(true);
    expect((await punch({ action: "resume" })).data.open).toMatchObject({ kind: "job", jobId: "tjob_ripet" });
    adv(60 * 24 * 3); // three days with Orbis closed: still running, the stored start is what counts
    expect((await state()).open).toMatchObject({ kind: "job", jobId: "tjob_ripet" });
    expect((await punch({ action: "end" })).data.open).toBeNull();
    expect((await punch({ action: "end" })).duplicate).toBe(true);
    expect(rows().map((r) => r.kind)).toEqual(["job", "break", "job"]);
  });
  it("rejects a break with no shift, a resume off-break, and impossible times", async () => {
    expect((await punch({ action: "break" })).ok).toBe(false);
    await punch({ action: "job", jobId: "tjob_reef" });
    expect((await punch({ action: "resume" })).ok).toBe(false);
    expect((await punch({ action: "job", jobId: "tjob_ripet", at: at(10) })).ok).toBe(false); // future
    expect((await punch({ action: "job", jobId: "tjob_ripet", at: at(-60 * 60) })).ok).toBe(false); // more than 48 hours old
    expect((await punch({ action: "job", jobId: "tjob_ripet", at: at(-5) })).ok).toBe(false); // before the running punch started
    expect((await punch({ action: "job", jobId: "nope" })).ok).toBe(false);
  });
  it("at most one running entry even if two devices race (the database refuses a second)", async () => {
    await punch({ action: "job", jobId: "tjob_reef" });
    raw.prepare("UPDATE write_gate SET open = 1").run();
    expect(() => raw.prepare("INSERT INTO time_entries (id, kind, job_id, start_at, created_at, updated_at, created_by, updated_by) VALUES ('x','job','tjob_ripet','2026-11-25T14:00:00.000Z','a','a','a','a')").run()).toThrow(/UNIQUE/);
    raw.prepare("UPDATE write_gate SET open = 0").run();
  });
  it("is owner-only, guarded, and audited", async () => {
    const asst = { db, actor: assistantActor("progressive"), requestId: "t", now: () => new Date(nowMs) } as Ctx;
    expect((await run("get_timeclock", {}, asst)).ok).toBe(false); expect((await run("timeclock_punch", { action: "job", jobId: "tjob_reef" }, asst)).ok).toBe(false);
    expect(() => raw.prepare("INSERT INTO time_entries (id, kind, job_id, start_at, created_at, updated_at, created_by, updated_by) VALUES ('y','job','tjob_reef','2026-11-25T14:00:00.000Z','a','a','a','a')").run()).toThrow(/blocked/);
    await punch({ action: "job", jobId: "tjob_reef" });
    expect(raw.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'timeclock.job'").get()).toMatchObject({ n: 1 });
  });
});

describe("editing the history", () => {
  const seed = async () => { await punch({ action: "job", jobId: "tjob_reef" }); adv(120); await punch({ action: "job", jobId: "tjob_ripet" }); adv(120); await punch({ action: "end" }); return rows(); };
  it("moving a switch time moves both sides, keeps the punched times, and refuses overlaps", async () => {
    const [a, b] = await seed();
    const moved = new Date(Date.parse(b.start_at) + 30 * 60_000).toISOString(); // switch was really 30 minutes later
    const r = await run("timeclock_edit_entry", { id: b.id, startAt: moved });
    expect(r.ok).toBe(true);
    const [a2, b2] = rows();
    expect(a2.end_at).toBe(moved); expect(b2.start_at).toBe(moved); expect(a2.edited).toBe(1); expect(b2.orig_start_at).toBe(b.start_at); expect(a2.orig_end_at).toBe(a.end_at);
    const overlap = await run("timeclock_edit_entry", { id: b.id, startAt: new Date(Date.parse(a.start_at) - 60_000).toISOString() });
    expect(overlap.ok).toBe(false);
  });
  it("changes the job or note, rejects end before start, and keeps the entry in place", async () => {
    const [a] = await seed();
    expect((await run("timeclock_edit_entry", { id: a.id, jobId: "tjob_ripet", note: "Corrected" })).ok).toBe(true);
    expect(rows()[0]).toMatchObject({ job_id: "tjob_ripet", note: "Corrected" });
    expect((await run("timeclock_edit_entry", { id: a.id, endAt: new Date(Date.parse(a.start_at) - 1000).toISOString() })).ok).toBe(false);
  });
  it("adds a missed punch only where nothing overlaps, and deleting the running punch clocks out", async () => {
    await punch({ action: "job", jobId: "tjob_reef" });
    const s = Date.parse(rows()[0].start_at);
    expect((await run("timeclock_add_entry", { jobId: "tjob_ripet", startAt: new Date(s - 3_600_000).toISOString(), endAt: new Date(s - 1_800_000).toISOString() })).ok).toBe(true);
    expect((await run("timeclock_add_entry", { jobId: "tjob_ripet", startAt: new Date(s - 1_900_000).toISOString(), endAt: new Date(s + 60_000).toISOString() })).ok).toBe(false);
    const running = rows().find((r) => r.end_at === null);
    const del = await run("timeclock_delete_entry", { id: running.id });
    expect(del.data.open).toBeNull(); expect(rows()).toHaveLength(1);
  });
  it("synthetic staging punches are idempotent and clearly flagged", async () => {
    expect(await demoTimeEntries(owner, "2026-11-25")).toBe(25); expect(await demoTimeEntries(owner, "2026-11-25")).toBe(0);
    expect(raw.prepare("SELECT COUNT(*) n FROM time_entries WHERE demo = 1 AND note = 'Synthetic'").get()).toMatchObject({ n: 25 });
  });
});
