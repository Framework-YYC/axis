import { describe, expect, it } from "vitest";
import { HORIZONS, cutPoints, endOfMonth, endOfQuarter, endOfWeek, horizonOf, horizonRange } from "../shared/horizons";
import { nextOccurrence, validateRecurrence } from "../shared/recurrence";
import { goalProgress, goalTerm, numericProgress } from "../shared/goals";
import { dayState, recentDays, streak, type HabitDef, type HabitLog } from "../shared/habits";
import { addDays } from "../shared/rotation";
import { MODULE_IDS, assistantLabel, isModule } from "../shared/modules";

describe("time horizons", () => {
  const today = "2026-11-24"; // Tuesday
  it("computes week, month, quarter and year ends for either week start", () => {
    expect(endOfWeek(today, 1)).toBe("2026-11-29");
    expect(endOfWeek(today, 0)).toBe("2026-11-28");
    expect(endOfMonth(today)).toBe("2026-11-30");
    expect(endOfQuarter(today)).toBe("2026-12-31");
    expect(endOfQuarter("2026-02-10")).toBe("2026-03-31");
    expect(endOfWeek("2026-11-29", 1)).toBe("2026-11-29"); // Sunday is the last day of a Monday-first week
  });
  it("places a due date in exactly one horizon", () => {
    const cases: Array<[string | null, string]> = [
      [null, "someday"], ["2026-11-23", "overdue"], ["2026-11-24", "today"], ["2026-11-25", "tomorrow"], ["2026-11-27", "this_week"],
      ["2026-11-29", "this_week"], ["2026-11-30", "this_month"], ["2026-12-01", "this_quarter"], ["2026-12-31", "this_quarter"], ["2027-01-01", "future"],
    ];
    for (const [d, h] of cases) expect(horizonOf(d, today)).toBe(h);
    // In November the quarter already ends on 31 December, so "this year" is empty. In February it is not:
    expect(horizonOf("2026-03-31", "2026-02-10")).toBe("this_quarter");
    expect(horizonOf("2026-04-01", "2026-02-10")).toBe("this_year");
    expect(horizonOf("2026-12-31", "2026-02-10")).toBe("this_year");
    expect(horizonOf("2027-01-01", "2026-02-10")).toBe("future");
    expect(horizonRange("this_year", "2026-11-24")).toEqual({ empty: true });
  });
  it("is exhaustive and exclusive across every day of two years, for both week starts", () => {
    for (const ws of [0, 1] as const) {
      for (const t of ["2026-02-27", "2026-11-24", "2026-12-31", "2027-01-01", "2028-02-29"]) {
        for (let i = -40; i < 800; i++) {
          const d = addDays(t, i);
          const h = horizonOf(d, t, ws);
          // the range for that horizon must contain the date, and no other horizon's range may
          const hits = HORIZONS.filter((x) => { const r = horizonRange(x, t, ws); if (r.undated || r.empty) return false; return (r.from === undefined || d >= r.from) && (r.to === undefined || d <= r.to); });
          expect(hits, `${t} ws${ws} ${d}`).toEqual([h]);
        }
      }
    }
  });
  it("collapses buckets that cannot contain a date (week ends tomorrow, month ends this week)", () => {
    expect(horizonRange("this_week", "2026-11-29", 1)).toEqual({ empty: true }); // Sunday: tomorrow is next week
    expect(cutPoints("2026-11-28", 1).month).toBe("2026-11-30");
    expect(horizonOf("2026-11-30", "2026-11-29", 1)).toBe("tomorrow");
  });
});

describe("recurrence", () => {
  it("validates rules", () => {
    expect(validateRecurrence({ freq: "weekly", byWeekday: [3, 1, 1] })).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 3] });
    for (const bad of [null, [], { freq: "hourly" }, { freq: "daily", interval: 0 }, { freq: "weekly", byWeekday: [7] }, { freq: "monthly", byMonthDay: 32 }, { freq: "daily", until: "soon" }]) expect(() => validateRecurrence(bad)).toThrow();
  });
  it("daily and interval series never land in the past and are deterministic", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-11-20", "2026-11-24")).toBe("2026-11-25");
    expect(nextOccurrence({ freq: "daily", interval: 3 }, "2026-11-20", "2026-11-20")).toBe("2026-11-23");
    expect(nextOccurrence({ freq: "daily", interval: 3 }, "2026-11-20", "2026-11-24")).toBe("2026-11-26"); // keeps the 3-day rhythm: 23, 26
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-11-20", "2026-11-20")).toBe(nextOccurrence({ freq: "daily", interval: 1 }, "2026-11-20", "2026-11-20"));
  });
  it("weekly by weekday and every second week", () => {
    expect(nextOccurrence({ freq: "weekly", interval: 1, byWeekday: [1, 4] }, "2026-11-23", "2026-11-23")).toBe("2026-11-26"); // Mon then Thu
    expect(nextOccurrence({ freq: "weekly", interval: 1, byWeekday: [1] }, "2026-11-23", "2026-11-25")).toBe("2026-11-30");
    expect(nextOccurrence({ freq: "weekly", interval: 2 }, "2026-11-23", "2026-11-23")).toBe("2026-12-07");
  });
  it("monthly clamps short months; yearly handles leap days; until ends the series", () => {
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence({ freq: "monthly", interval: 1, byMonthDay: 31 }, "2026-02-28", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence({ freq: "yearly", interval: 1 }, "2028-02-29", "2028-02-29")).toBe("2029-02-28");
    expect(nextOccurrence({ freq: "daily", interval: 1, until: "2026-11-25" }, "2026-11-25", "2026-11-25")).toBeNull();
  });
});

describe("goals", () => {
  it("classifies by the default planning horizons", () => {
    const t = "2026-11-24";
    expect(goalTerm(null, t)).toBeNull();
    expect(goalTerm("2027-02-01", t)).toBe("short"); // 69 days
    expect(goalTerm("2027-02-22", t)).toBe("medium"); // 90 days
    expect(goalTerm("2027-11-24", t)).toBe("medium"); // 365 days
    expect(goalTerm("2027-11-25", t)).toBe("long");
  });
  it("measures progress up and down, and for qualitative goals", () => {
    expect(numericProgress(0, 20000, 5000)).toBe(25);
    expect(numericProgress(82, 78, 80)).toBe(50);
    expect(numericProgress(82, 78, 85)).toBe(0);
    expect(numericProgress(10, 10, 10)).toBe(100);
    const q = { kind: "qualitative" as const, startValue: null, targetValue: null, currentValue: null, manualProgress: 40 };
    expect(goalProgress({ ...q, milestones: [] })).toBe(40);
    expect(goalProgress({ ...q, milestones: [{ done: true }, { done: false }, { done: false }, { done: true }] })).toBe(50);
    expect(goalProgress({ kind: "numeric", startValue: 0, targetValue: 10, currentValue: 7, manualProgress: null, milestones: [] })).toBe(70);
  });
});

describe("habits", () => {
  const rot = { anchorDate: "2026-11-16", onDays: 14, offDays: 7 };
  const base: HabitDef = { period: "day", targetCount: 1, targetValue: null, daysOfWeek: null, rotationMode: "any", offTargetCount: null, offTargetValue: null, offDaysOfWeek: null, startDate: "2026-11-01" };
  const log = (...dates: string[]): HabitLog[] => dates.map((date) => ({ date, value: 1 }));
  it("counts a streak of completed days, tolerating an unfinished today", () => {
    expect(streak(base, log("2026-11-21", "2026-11-22", "2026-11-23"), "2026-11-24", rot)).toEqual({ current: 3, best: 3 });
    expect(streak(base, log("2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"), "2026-11-24", rot)).toEqual({ current: 4, best: 4 });
    expect(streak(base, log("2026-11-10", "2026-11-11", "2026-11-12", "2026-11-23"), "2026-11-24", rot)).toEqual({ current: 1, best: 3 });
  });
  it("quantitative habits compare the day's total with the target", () => {
    const water: HabitDef = { ...base, targetValue: 2500 };
    const l: HabitLog[] = [{ date: "2026-11-24", value: 1200 }, { date: "2026-11-24", value: 1300 }];
    expect(dayState(water, "2026-11-24", l, rot)).toMatchObject({ value: 2500, target: 2500, done: true });
    expect(dayState(water, "2026-11-24", l.slice(0, 1), rot).done).toBe(false);
  });
  it("on-rotation and off-rotation routines apply on the right days and skip the others without breaking the streak", () => {
    const gym: HabitDef = { ...base, rotationMode: "off", startDate: "2026-11-16" };
    // 2026-11-30 .. 2026-12-06 are off days under this rotation
    expect(dayState(gym, "2026-11-24", [], rot).applies).toBe(false);
    expect(dayState(gym, "2026-11-30", [], rot).applies).toBe(true);
    expect(streak(gym, log("2026-11-30", "2026-12-01"), "2026-12-01", rot).current).toBe(2);
    const split: HabitDef = { ...base, rotationMode: "split", targetCount: 1, offTargetCount: 3, startDate: "2026-11-16" };
    expect(dayState(split, "2026-11-24", [], rot).target).toBe(1);
    expect(dayState(split, "2026-12-01", [], rot).target).toBe(3);
    const workdays: HabitDef = { ...base, rotationMode: "on", startDate: "2026-11-16" };
    expect(dayState(workdays, "2026-12-01", [], rot).applies).toBe(false);
  });
  it("weekly habits count completed weeks", () => {
    const wk: HabitDef = { ...base, period: "week", targetCount: 3, startDate: "2026-11-02" };
    const l = log("2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-16", "2026-11-17");
    expect(streak(wk, l, "2026-11-18", rot).best).toBe(2);
    expect(recentDays(base, [], "2026-11-24", rot, 14)).toHaveLength(14);
  });
});

describe("modules", () => {
  it("has the five assistant modules and labels the acting assistant", () => {
    expect(MODULE_IDS).toEqual(["daily", "health", "financial", "framework", "progressive"]);
    expect(isModule("health")).toBe(true);
    expect(isModule("nexus")).toBe(false);
    expect(assistantLabel("financial")).toBe("ChatGPT: Financial assistant");
  });
});

import { barHeights, dateStrip, focusStats, ringArc, weekBars } from "../shared/overview";
describe("mobile overview maths", () => {
  const T = "2026-11-24";
  const t = (status: string, dueDate: string | null, completedAt: string | null = null, archivedAt: string | null = null) => ({ status, dueDate, completedAt, archivedAt });
  it("focus: remaining counts due today and overdue; completed counts today only; archived ignored", () => {
    const f = focusStats([t("pending", T), t("pending", "2026-11-22"), t("in_progress", T), t("pending", "2026-11-25"), t("pending", null), t("completed", T, "2026-11-24T12:00:00"), t("completed", T, "2026-11-23T12:00:00"), t("pending", T, null, "2026-11-20")], T);
    expect(f).toEqual({ remaining: 3, completed: 1, overdue: 1, pct: 25 });
    expect(focusStats([], T)).toEqual({ remaining: 0, completed: 0, overdue: 0, pct: 0 });
    expect(focusStats([t("completed", T, "2026-11-24T12:00:00")], T).pct).toBe(100);
  });
  it("ring arc clamps and adds up to the circumference", () => {
    const a = ringArc(25, 40); expect(a.dash + a.gap).toBeCloseTo(a.circumference); expect(a.dash).toBeCloseTo(a.circumference / 4);
    expect(ringArc(150, 10).gap).toBeCloseTo(0); expect(ringArc(-5, 10).dash).toBe(0);
  });
  it("week bars count open tasks per day and bar heights never collapse", () => {
    const bars = weekBars([t("pending", T), t("pending", T), t("pending", "2026-11-26"), t("completed", "2026-11-25", "2026-11-25T12:00:00")], T, 4);
    expect(bars.map((b) => b.count)).toEqual([2, 0, 1, 0]);
    const h = barHeights(bars.map((b) => b.count)); expect(h[0]).toBe(100); expect(h[1]).toBe(12); expect(h[2]).toBeGreaterThan(h[1]);
    expect(barHeights([0, 0])).toEqual([12, 12]);
  });
  it("date strip starts two days back and includes today", () => {
    const s = dateStrip(T); expect(s[0]).toBe("2026-11-22"); expect(s[2]).toBe(T); expect(s).toHaveLength(15);
  });
});

import { ENVIRONMENTS, envOfHost, isApprovedUrl, otherEnv, safePath, switchUrl } from "../shared/environments";
describe("environment switching", () => {
  it("knows exactly two approved hosts and loopback; everything else is unknown", () => {
    expect(envOfHost("axis.frameworktools.ca")).toBe("production");
    expect(envOfHost("AXIS-STAGING.frameworktools.ca")).toBe("staging");
    expect(envOfHost("localhost")).toBe("development");
    for (const h of ["evil.example", "axis.frameworktools.ca.evil.example", "frameworktools.ca", "nexus.frameworktools.ca", "axis-staging.frameworktools.ca.", ""]) expect(envOfHost(h)).toBeNull();
    expect(otherEnv("production")).toBe("staging"); expect(otherEnv("staging")).toBe("production");
  });
  it("preserves the page across environments and nothing else", () => {
    expect(switchUrl("staging", { pathname: "/m/health", search: "?tab=habits", hash: "#x" })).toBe("https://axis-staging.frameworktools.ca/m/health?tab=habits#x");
    expect(switchUrl("production", { pathname: "/tasks", search: "?h=overdue" })).toBe("https://axis.frameworktools.ca/tasks?h=overdue");
    expect(switchUrl("production", { pathname: "/" })).toBe("https://axis.frameworktools.ca/");
  });
  it("rejects open-redirect and injection shapes in the path, query and hash", () => {
    for (const p of ["//evil.example/x", "https://evil.example", "/\\evil.example", "evil", "/a\nb", ""]) expect(safePath(p)).toBe("/");
    expect(switchUrl("staging", { pathname: "//evil.example", search: "x=1", hash: "y" })).toBe("https://axis-staging.frameworktools.ca/");
    expect(isApprovedUrl(switchUrl("staging", { pathname: "/\\\\evil.example" }))).toBe(true); // collapses to "/" on the approved host
  });
  it("only the two exact https origins are approved", () => {
    expect(isApprovedUrl(`https://${ENVIRONMENTS.production.host}/x`)).toBe(true);
    for (const u of ["http://axis.frameworktools.ca/", "https://axis.frameworktools.ca:8443/", "https://user@axis.frameworktools.ca/", "https://axis.frameworktools.ca.evil.example/", "javascript:alert(1)", "https://evil.example/"]) expect(isApprovedUrl(u)).toBe(false);
  });
});

import { ACTIVITY_PERIODS, activityBars, completionArcs, fanSegments, localDay, pieSector, radialTicks, ringSector, segmentsFilled, splitParts } from "../shared/gauges";
describe("instrument graphics geometry", () => {
  it("completion arcs: empty, partial and full are distinct; rest is hatched, never invented", () => {
    expect(completionArcs(0)).toMatchObject({ filled: null, empty: true });
    expect(completionArcs(25).filled).toEqual([-90, 0]); expect(completionArcs(25).rest).toEqual([0, 270]);
    expect(completionArcs(100)).toMatchObject({ rest: null, full: true }); expect(completionArcs(250).full).toBe(true); expect(completionArcs(-3).empty).toBe(true);
    expect(ringSector(50, 50, 30, 40, -90, 270)).toContain("A40 40"); // a full ring is two half sectors
  });
  it("radial ticks: filled count follows the percentage", () => {
    const t = radialTicks(60, 25, 100, 100, 60, 68); expect(t).toHaveLength(60); expect(t.filter((x) => x.on)).toHaveLength(15);
    expect(radialTicks(60, 0, 0, 0, 1, 2).some((x) => x.on)).toBe(false); expect(radialTicks(60, 100, 0, 0, 1, 2).every((x) => x.on)).toBe(true);
  });
  it("fan gauge: segment length is the day's value relative to the busiest day; zero is a stub", () => {
    const f = fanSegments([0, 2, 4, 0, 1, 0, 3], 100, 100, 40, 90);
    expect(f).toHaveLength(7); expect(f[2].frac).toBe(1); expect(f[1].frac).toBe(0.5); expect(f[0].frac).toBe(0);
    expect(f[2].r1).toBeCloseTo(90); expect(f[0].r1).toBe(42); expect(f[1].r1).toBeLessThan(f[2].r1); expect(f[4].r1).toBeLessThan(f[1].r1);
    expect(f[0].a0).toBeGreaterThanOrEqual(180); expect(f[6].a1).toBeLessThanOrEqual(360);
    const none = fanSegments([0, 0, 0], 0, 0, 10, 20); expect(none.every((s) => s.frac === 0 && s.r1 === 12)).toBe(true); // all zero: all stubs
  });
  it("pie wedges and split bars are data-true", () => {
    expect(pieSector(0, 0, 10, -90, 0)).toMatch(/^M0 0 L/); expect(pieSector(0, 0, 10, -90, 270)).toContain("A10 10"); expect(pieSector(0, 0, 10, -90, 120)).toContain("0 0 1"); expect(pieSector(0, 0, 10, -90, 200)).toContain("0 1 1");
    expect(splitParts([0, 0, 0])).toEqual([0, 0, 0]);
    const p = splitParts([4, 12, 2]); expect(p[0] + p[1] + p[2]).toBeLessThanOrEqual(100.0001); expect(p[1]).toBeGreaterThan(p[0]); expect(p[0]).toBeGreaterThan(p[2]);
    expect(splitParts([0, 20, 0])).toEqual([0, 100, 0]); expect(splitParts([1, 1000, 0])[0]).toBeGreaterThanOrEqual(5); // a real but tiny part stays visible
    expect(splitParts([3, 0, 1]).every((w, i) => ([3, 0, 1][i] > 0) === (w > 0))).toBe(true);
  });
  it("segmented progress never shows progress without data", () => {
    expect(segmentsFilled(0, 0, 12)).toBe(0); expect(segmentsFilled(5, 0, 12)).toBe(0); expect(segmentsFilled(0, 5, 12)).toBe(0);
    expect(segmentsFilled(1, 100, 12)).toBe(1); expect(segmentsFilled(5, 5, 12)).toBe(12); expect(segmentsFilled(9, 5, 12)).toBe(12);
  });
  it("activity bars count completed tasks per local day for the chosen week", () => {
    const T = "2026-11-24"; // Tuesday
    const done = (iso: string) => ({ status: "completed", completedAt: iso, archivedAt: null });
    const tasks = [done("2026-11-24T12:00:00"), done("2026-11-24T13:00:00"), done("2026-11-23T12:00:00"), done("2026-11-17T12:00:00"), { status: "pending", completedAt: null, archivedAt: null }, { status: "completed", completedAt: "2026-11-24T12:00:00", archivedAt: "2026-11-25" }];
    const week = activityBars(tasks, "this_week", T, 1);
    expect(week.map((b) => b.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(week.map((b) => b.count)).toEqual([1, 2, 0, 0, 0, 0, 0]); expect(week[1].isToday).toBe(true); expect(week[2].future).toBe(true);
    expect(activityBars(tasks, "last_week", T, 1).map((b) => b.count)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(activityBars(tasks, "last_7", T, 1)).toHaveLength(7); expect(activityBars(tasks, "last_7", T, 1)[6].date).toBe(T);
    expect(activityBars(tasks, "this_week", T, 0)[0].date).toBe("2026-11-22"); // Sunday start
    expect(ACTIVITY_PERIODS.map((p) => p.id)).toEqual(["this_week", "last_week", "last_7"]);
    expect(localDay("2026-11-24T12:00:00")).toBe("2026-11-24");
  });
});
