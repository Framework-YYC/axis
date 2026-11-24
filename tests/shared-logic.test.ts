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
    const f = focusStats([t("pending", T), t("pending", "2026-11-22"), t("in_progress", T), t("pending", "2026-11-25"), t("pending", null), t("completed", T, "2026-11-24T09:00:00Z"), t("completed", T, "2026-11-23T09:00:00Z"), t("pending", T, null, "2026-11-20")], T);
    expect(f).toEqual({ remaining: 3, completed: 1, overdue: 1, pct: 25 });
    expect(focusStats([], T)).toEqual({ remaining: 0, completed: 0, overdue: 0, pct: 0 });
    expect(focusStats([t("completed", T, "2026-11-24T01:00:00Z")], T).pct).toBe(100);
  });
  it("ring arc clamps and adds up to the circumference", () => {
    const a = ringArc(25, 40); expect(a.dash + a.gap).toBeCloseTo(a.circumference); expect(a.dash).toBeCloseTo(a.circumference / 4);
    expect(ringArc(150, 10).gap).toBeCloseTo(0); expect(ringArc(-5, 10).dash).toBe(0);
  });
  it("week bars count open tasks per day and bar heights never collapse", () => {
    const bars = weekBars([t("pending", T), t("pending", T), t("pending", "2026-11-26"), t("completed", "2026-11-25", "2026-11-25T00:00:00Z")], T, 4);
    expect(bars.map((b) => b.count)).toEqual([2, 0, 1, 0]);
    const h = barHeights(bars.map((b) => b.count)); expect(h[0]).toBe(100); expect(h[1]).toBe(12); expect(h[2]).toBeGreaterThan(h[1]);
    expect(barHeights([0, 0])).toEqual([12, 12]);
  });
  it("date strip starts two days back and includes today", () => {
    const s = dateStrip(T); expect(s[0]).toBe("2026-11-22"); expect(s[2]).toBe(T); expect(s).toHaveLength(15);
  });
});
