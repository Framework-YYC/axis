import { addDays, rotationStatus, toDays, type RotationConfig } from "./rotation";

export type HabitPeriod = "day" | "week" | "month";
export type RotationMode = "any" | "on" | "off" | "split";

/**
 * A habit is not a stream of tasks. It has a target per period and a log of what happened.
 * - Count habits: each log is worth `value` (default 1); the target is `targetCount` per period.
 * - Quantitative habits (`targetValue` set): logs carry a measurement; the period total is compared with `targetValue`.
 * - Rotation modes apply to daily habits: `on` only on work-rotation days, `off` only on days off, `split` uses the off_* targets on days off, `any` ignores rotation.
 */
export interface HabitDef {
  period: HabitPeriod;
  targetCount: number;
  targetValue: number | null;
  daysOfWeek: number[] | null;
  rotationMode: RotationMode;
  offTargetCount: number | null;
  offTargetValue: number | null;
  offDaysOfWeek: number[] | null;
  startDate: string;
}
export interface HabitLog { date: string; value: number }

export interface DayState { date: string; applies: boolean; target: number; value: number; done: boolean }

const dowOf = (d: string) => new Date(toDays(d) * 86_400_000).getUTCDay();

function dayRule(h: HabitDef, date: string, rot: RotationConfig | null): { applies: boolean; count: number; value: number | null } {
  if (date < h.startDate) return { applies: false, count: h.targetCount, value: h.targetValue };
  const phase = rot && h.rotationMode !== "any" ? rotationStatus(date, rot).phase : "on";
  if (h.rotationMode === "on" && phase !== "on") return { applies: false, count: h.targetCount, value: h.targetValue };
  if (h.rotationMode === "off" && phase !== "off") return { applies: false, count: h.targetCount, value: h.targetValue };
  const off = h.rotationMode === "split" && phase === "off";
  const days = off ? (h.offDaysOfWeek ?? h.daysOfWeek) : h.daysOfWeek;
  if (days && days.length > 0 && !days.includes(dowOf(date))) return { applies: false, count: h.targetCount, value: h.targetValue };
  return off ? { applies: true, count: h.offTargetCount ?? h.targetCount, value: h.offTargetValue ?? h.targetValue } : { applies: true, count: h.targetCount, value: h.targetValue };
}

const sum = (logs: readonly HabitLog[], from: string, to: string) => logs.filter((l) => l.date >= from && l.date <= to).reduce((a, l) => a + l.value, 0);

/** State of one day for a daily habit. */
export function dayState(h: HabitDef, date: string, logs: readonly HabitLog[], rot: RotationConfig | null): DayState {
  const r = dayRule(h, date, rot);
  const value = sum(logs, date, date);
  const target = r.value ?? r.count;
  return { date, applies: r.applies, target, value, done: r.applies && value >= target };
}

/** Monday-first week start and month start of a date. */
export const weekStartOf = (d: string) => addDays(d, -((dowOf(d) + 6) % 7));
export const monthStartOf = (d: string) => `${d.slice(0, 7)}-01`;
function periodBounds(h: HabitDef, d: string): [string, string] {
  if (h.period === "week") { const s = weekStartOf(d); return [s, addDays(s, 6)]; }
  const s = monthStartOf(d); const [y, m] = s.split("-").map(Number);
  return [s, `${s.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`];
}

/** Period state for weekly or monthly habits (rotation is ignored there). */
export function periodState(h: HabitDef, date: string, logs: readonly HabitLog[]): DayState {
  const [from, to] = periodBounds(h, date);
  const target = h.targetValue ?? h.targetCount;
  const value = sum(logs, from, to);
  return { date: from, applies: to >= h.startDate, target, value, done: value >= target };
}

export interface Streak { current: number; best: number }

/**
 * Consecutive completed periods. Days a daily habit does not apply to (rotation, weekdays) are skipped, neither counted nor breaking the streak.
 * The current period only counts once it is complete; being unfinished today does not break an existing streak.
 */
export function streak(h: HabitDef, logs: readonly HabitLog[], today: string, rot: RotationConfig | null): Streak {
  const states: DayState[] = [];
  if (h.period === "day") {
    for (let d = h.startDate; d <= today; d = addDays(d, 1)) { const s = dayState(h, d, logs, rot); if (s.applies) states.push(s); }
  } else {
    let d = h.startDate;
    const seen = new Set<string>();
    for (; d <= today; d = addDays(d, 1)) { const s = periodState(h, d, logs); if (!seen.has(s.date)) { seen.add(s.date); states.push(s); } }
  }
  let best = 0, run = 0;
  for (const s of states) { run = s.done ? run + 1 : 0; if (run > best) best = run; }
  let current = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    const isCurrent = i === states.length - 1 && (h.period === "day" ? states[i].date === today : states[i].date >= periodBounds(h, today)[0]);
    if (states[i].done) current++;
    else if (isCurrent) continue;
    else break;
  }
  return { current, best: Math.max(best, current) };
}

/** Last `days` days (oldest first) for the small history bars. Non-applicable days are returned with applies=false. */
export function recentDays(h: HabitDef, logs: readonly HabitLog[], today: string, rot: RotationConfig | null, days = 14): DayState[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    if (h.period === "day") return dayState(h, d, logs, rot);
    const s = periodState(h, d, logs);
    return { ...s, date: d, applies: d >= h.startDate, value: sum(logs, d, d) };
  });
}
