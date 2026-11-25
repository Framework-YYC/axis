import type { ModuleId } from "./modules";

/** The records Personal shows: both assistants' modules, never merged in the database. */
export const PERSONAL_SCOPE: readonly ModuleId[] = ["daily", "health"];
export const inPersonal = (m: string): boolean => (PERSONAL_SCOPE as readonly string[]).includes(m);

interface DayLike { date: string; applies: boolean; done: boolean }
/** Per day, how many scheduled habits were done and how many were due, over the last `days` days (oldest first). Only days the habits report; nothing is invented. */
export function habitDays(habits: ReadonlyArray<{ recent: readonly DayLike[] }>, days = 7): Array<{ date: string; done: number; due: number }> {
  const byDate = new Map<string, { done: number; due: number }>();
  for (const h of habits) for (const d of h.recent) { const x = byDate.get(d.date) ?? { done: 0, due: 0 }; if (d.applies) { x.due++; if (d.done) x.done++; } byDate.set(d.date, x); }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-days).map(([date, v]) => ({ date, ...v }));
}
/** Mean progress of active goals as a whole percent, or null when there are none. */
export function averageProgress(goals: ReadonlyArray<{ status: string; progress: number }>): number | null {
  const live = goals.filter((g) => g.status === "active");
  return live.length ? Math.round(live.reduce((a, g) => a + g.progress, 0) / live.length) : null;
}
/** Scheduled events grouped by date, soonest first, within [from, to]. */
export function eventsByDate<T extends { date: string; status: string; startTime: string | null }>(events: readonly T[], from: string, to: string): Array<{ date: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const e of events) if (e.status === "scheduled" && e.date >= from && e.date <= to) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, items]) => ({ date, items: items.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")) }));
}
