import { describe, expect, it } from "vitest";
import { dayOf, dayTotals, fmtDecimal, fmtHM, fmtHMS, findOverlap, jobLabel, offsetMinutes, planPunch, startOfDay, weekStartOf, weekTotals, type TimeEntry } from "../shared/timeclock";

const TZ = "America/New_York"; // EST (UTC-5) in winter, EDT (UTC-4) in summer (a zone with daylight saving, to prove the maths)
const iso = (local: string, off = "-05:00") => new Date(`${local}${off}`).toISOString();
const job = (id: string, jobId: string, a: string, b: string | null): TimeEntry => ({ id, kind: "job", jobId, resumeJobId: null, startAt: iso(a), endAt: b ? iso(b) : null, note: null, edited: false });
const brk = (id: string, resume: string, a: string, b: string | null): TimeEntry => ({ id, kind: "break", jobId: null, resumeJobId: resume, startAt: iso(a), endAt: b ? iso(b) : null, note: null, edited: false });
const NOW = Date.parse(iso("2026-11-25T12:00:00"));

describe("zones", () => {
  it("finds local days and day starts, including daylight saving", () => {
    expect(offsetMinutes(Date.parse("2026-11-25T12:00:00Z"), TZ)).toBe(-300);
    expect(dayOf(Date.parse("2026-11-26T04:30:00Z"), TZ)).toBe("2026-11-25"); // 23:30 the evening before, local
    expect(new Date(startOfDay("2026-11-25", TZ)).toISOString()).toBe("2026-11-25T05:00:00.000Z");
    expect((startOfDay("2026-11-02", TZ) - startOfDay("2026-11-01", TZ)) / 3_600_000).toBe(25); // fall-back day (Nov 1 2026) has 25 hours
  });
  it("weeks start on the chosen day", () => { expect(weekStartOf("2026-11-25", 1)).toBe("2026-11-23"); expect(weekStartOf("2026-11-25", 0)).toBe("2026-11-22"); expect(weekStartOf("2026-11-23", 1)).toBe("2026-11-23"); });
});

describe("totals use the actual punches, nothing deducted", () => {
  // A typical day: 06:00 to 17:30 with REEF/RIPET switches and a lunch break taken by the owner
  const day = [
    job("1", "reef", "2026-11-25T06:00:00", "2026-11-25T09:30:00"),
    job("2", "ripet", "2026-11-25T09:30:00", "2026-11-25T12:00:00"),
    brk("3", "ripet", "2026-11-25T12:00:00", "2026-11-25T12:40:00"),
    job("4", "ripet", "2026-11-25T12:40:00", "2026-11-25T15:00:00"),
    job("5", "reef", "2026-11-25T15:00:00", "2026-11-25T17:30:00"),
  ];
  it("sums by job and total worked, with break time separate", () => {
    const [d] = dayTotals(day, "2026-11-25", "2026-11-25", NOW + 10 * 3_600_000, TZ);
    expect(d.byJob.reef).toBe(6 * 3_600_000); // 3:30 + 2:30
    expect(d.byJob.ripet).toBe((2.5 + 2 + 1 / 3) * 3_600_000); // 2:30 + 2:20
    expect(d.breakMs).toBe(40 * 60_000);
    expect(fmtHM(d.workMs)).toBe("10:50"); // 06:00-17:30 is 11:30; the 0:40 break is not worked time because the owner punched it; no lunch is assumed
    expect(d.firstStart).toBe(Date.parse(iso("2026-11-25T06:00:00"))); expect(d.lastEnd).toBe(Date.parse(iso("2026-11-25T17:30:00"))); expect(d.running).toBe(false);
  });
  it("without a break punch nothing is deducted: 06:00 to 17:30 is 11:30", () => {
    const [d] = dayTotals([job("1", "reef", "2026-11-25T06:00:00", "2026-11-25T17:30:00")], "2026-11-25", "2026-11-25", NOW + 10 * 3_600_000, TZ);
    expect(fmtHM(d.workMs)).toBe("11:30");
  });
  it("a running entry counts up to now and is flagged running", () => {
    const [d] = dayTotals([job("1", "reef", "2026-11-25T06:00:00", null)], "2026-11-25", "2026-11-25", NOW, TZ);
    expect(fmtHM(d.workMs)).toBe("6:00"); expect(d.running).toBe(true);
  });
  it("an entry that crosses midnight is split between the two local days", () => {
    const [a, b] = dayTotals([job("1", "reef", "2026-11-25T22:00:00", "2026-11-26T02:30:00")], "2026-11-25", "2026-11-26", NOW + 86_400_000, TZ);
    expect(fmtHM(a.workMs)).toBe("2:00"); expect(fmtHM(b.workMs)).toBe("2:30");
  });
  it("weekly totals add the days by job", () => {
    const entries = [job("1", "reef", "2026-11-23T06:00:00", "2026-11-23T17:30:00"), job("2", "ripet", "2026-11-24T06:00:00", "2026-11-24T16:00:00"), job("3", "reef", "2026-11-30T06:00:00", "2026-11-30T10:00:00")];
    const w = weekTotals(entries, "2026-11-23", NOW + 10 * 86_400_000, TZ);
    expect(w.days).toHaveLength(7); expect(fmtHM(w.workMs)).toBe("21:30"); expect(w.byJob.reef).toBe(11.5 * 3_600_000); expect(w.byJob.ripet).toBe(10 * 3_600_000);
  });
  it("formats durations", () => { expect(fmtHM(7 * 3_600_000 + 5 * 60_000)).toBe("7:05"); expect(fmtHMS(3_661_000)).toBe("1:01:01"); expect(fmtDecimal(5_400_000)).toBe("1.50"); expect(jobLabel({ name: "REEF", number: "928" })).toBe("REEF — 928"); expect(jobLabel(null)).toBe("No job"); });
});

describe("punch rules", () => {
  const onReef = { kind: "job" as const, jobId: "reef", resumeJobId: null };
  const onBreak = { kind: "break" as const, jobId: null, resumeJobId: "ripet" };
  it("switching jobs stops the previous one and starts the new one; tapping the running job again is a no-op", () => {
    expect(planPunch(onReef, "job", "ripet")).toEqual({ closeOpen: true, start: { kind: "job", jobId: "ripet", resumeJobId: null } });
    expect(planPunch(onReef, "job", "reef")).toEqual({ noop: "Already on this job." });
    expect(planPunch(null, "job", "reef")).toEqual({ closeOpen: false, start: { kind: "job", jobId: "reef", resumeJobId: null } });
    expect(planPunch(onBreak, "job", "reef")).toEqual({ closeOpen: true, start: { kind: "job", jobId: "reef", resumeJobId: null } });
  });
  it("break remembers the job; resume returns to it; double taps are no-ops", () => {
    expect(planPunch(onReef, "break", null)).toEqual({ closeOpen: true, start: { kind: "break", jobId: null, resumeJobId: "reef" } });
    expect(planPunch(onBreak, "break", null).noop).toBeTruthy();
    expect(planPunch(onBreak, "resume", null)).toEqual({ closeOpen: true, start: { kind: "job", jobId: "ripet", resumeJobId: null } });
    expect(planPunch(onReef, "resume", null).error).toBeTruthy(); expect(planPunch(null, "resume", null).noop).toBeTruthy(); expect(planPunch(null, "break", null).error).toBeTruthy();
  });
  it("end shift closes the running entry and never happens by itself", () => {
    expect(planPunch(onReef, "end", null)).toEqual({ closeOpen: true }); expect(planPunch(onBreak, "end", null)).toEqual({ closeOpen: true }); expect(planPunch(null, "end", null).noop).toBeTruthy();
  });
  it("finds overlaps but lets touching punches meet", () => {
    const spans = [{ id: "a", startAt: iso("2026-11-25T06:00:00"), endAt: iso("2026-11-25T09:00:00") }, { id: "b", startAt: iso("2026-11-25T09:00:00"), endAt: null }];
    const t = (s: string) => Date.parse(iso(s));
    expect(findOverlap(spans, t("2026-11-25T05:00:00"), t("2026-11-25T06:00:00"))).toBeNull();
    expect(findOverlap(spans, t("2026-11-25T08:00:00"), t("2026-11-25T08:30:00"))?.id).toBe("a");
    expect(findOverlap(spans, t("2026-11-25T10:00:00"), t("2026-11-25T11:00:00"))?.id).toBe("b"); // an open entry extends forward
    expect(findOverlap(spans, t("2026-11-25T08:00:00"), t("2026-11-25T08:30:00"), "a")).toBeNull();
  });
});

import { clockTime, fromLocalInput, toLocalInput } from "../shared/timeclock";
describe("local editing", () => {
  it("converts between local input values and stored UTC", () => {
    expect(toLocalInput("2026-11-25T11:05:00.000Z", "America/New_York")).toBe("2026-11-25T06:05");
    expect(fromLocalInput("2026-11-25T06:05", "America/New_York")).toBe("2026-11-25T11:05:00.000Z");
    expect(fromLocalInput("2026-11-25T24:00", "America/New_York")).toBeNull(); expect(fromLocalInput("", "UTC")).toBeNull();
    expect(clockTime("2026-07-01T10:30:00.000Z", "America/New_York")).toBe("06:30"); // summer time
  });
});
