import { addDays, toDays } from "./rotation";

/** Mutually exclusive time horizons, always computed from the due date and "today" (never stored). */
export const HORIZONS = ["overdue", "today", "tomorrow", "this_week", "this_month", "this_quarter", "this_year", "future", "someday"] as const;
export type Horizon = (typeof HORIZONS)[number];
export const HORIZON_LABELS: Record<Horizon, string> = {
  overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", this_week: "This week", this_month: "This month", this_quarter: "This quarter", this_year: "This year", future: "Future", someday: "Someday / Unscheduled",
};
export const isHorizon = (v: unknown): v is Horizon => typeof v === "string" && (HORIZONS as readonly string[]).includes(v);

/** 0 = Sunday first, 1 = Monday first. */
export type WeekStart = 0 | 1;

const dow = (date: string) => new Date(toDays(date) * 86_400_000).getUTCDay();
const ymd = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function endOfWeek(today: string, weekStart: WeekStart = 1): string {
  const d = dow(today);
  const lastDay = weekStart === 1 ? 0 : 6;
  return addDays(today, (lastDay - d + 7) % 7);
}
export function endOfMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return ymd(y, m, lastOfMonth(y, m));
}
export function endOfQuarter(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const qm = Math.ceil(m / 3) * 3;
  return ymd(y, qm, lastOfMonth(y, qm));
}
export const endOfYear = (today: string) => `${today.slice(0, 4)}-12-31`;

/** The cut points that make the buckets exclusive and exhaustive: each bucket ends where the next begins. */
export function cutPoints(today: string, weekStart: WeekStart = 1) {
  const tomorrow = addDays(today, 1);
  const week = [tomorrow, endOfWeek(today, weekStart)].sort().pop()!;
  const month = [week, endOfMonth(today)].sort().pop()!;
  const quarter = [month, endOfQuarter(today)].sort().pop()!;
  const year = [quarter, endOfYear(today)].sort().pop()!;
  return { today, tomorrow, week, month, quarter, year };
}

export function horizonOf(due: string | null, today: string, weekStart: WeekStart = 1): Horizon {
  if (!due) return "someday";
  const c = cutPoints(today, weekStart);
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due <= c.tomorrow) return "tomorrow";
  if (due <= c.week) return "this_week";
  if (due <= c.month) return "this_month";
  if (due <= c.quarter) return "this_quarter";
  if (due <= c.year) return "this_year";
  return "future";
}

/** Inclusive date range for a horizon, for SQL filtering. `empty` = no date can fall in it today; `undated` = due date IS NULL. */
export function horizonRange(h: Horizon, today: string, weekStart: WeekStart = 1): { from?: string; to?: string; empty?: boolean; undated?: boolean } {
  const c = cutPoints(today, weekStart);
  const range = (from: string, to: string) => (from > to ? { empty: true } : { from, to });
  switch (h) {
    case "overdue": return { to: addDays(today, -1) };
    case "today": return { from: today, to: today };
    case "tomorrow": return { from: c.tomorrow, to: c.tomorrow };
    case "this_week": return range(addDays(c.tomorrow, 1), c.week);
    case "this_month": return range(addDays(c.week, 1), c.month);
    case "this_quarter": return range(addDays(c.month, 1), c.quarter);
    case "this_year": return range(addDays(c.quarter, 1), c.year);
    case "future": return { from: addDays(c.year, 1) };
    case "someday": return { undated: true };
  }
}
