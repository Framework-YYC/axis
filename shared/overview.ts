import { localDay } from "./gauges";
import { addDays } from "./rotation";

/** Presentation maths for the mobile Overview. Pure, so it is tested without a browser. */
export interface FocusTask { status: string; dueDate: string | null; completedAt: string | null; archivedAt: string | null }

export interface Focus { remaining: number; completed: number; overdue: number; pct: number }
/** Today's focus: open work due today or earlier, work completed today, and the share done. */
export function focusStats(tasks: readonly FocusTask[], today: string): Focus {
  let remaining = 0, completed = 0, overdue = 0;
  for (const t of tasks) {
    if (t.archivedAt) continue;
    if (t.status === "completed") { if (t.completedAt && localDay(t.completedAt) === today) completed++; continue; }
    if (t.dueDate && t.dueDate <= today) { remaining++; if (t.dueDate < today) overdue++; }
  }
  const total = remaining + completed;
  return { remaining, completed, overdue, pct: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

/** Stroke geometry for a progress ring. */
export function ringArc(pct: number, radius: number): { circumference: number; dash: number; gap: number } {
  const c = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  return { circumference: c, dash: c * p, gap: c - c * p };
}

/** Open tasks due on each of the next `days` days (today first). */
export function weekBars(tasks: readonly FocusTask[], today: string, days = 7): Array<{ date: string; count: number }> {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return { date, count: tasks.filter((t) => !t.archivedAt && t.status !== "completed" && t.dueDate === date).length };
  });
}

/** Date strip: a few days back, today, and the days ahead. */
export function dateStrip(today: string, back = 2, ahead = 12): string[] {
  return Array.from({ length: back + ahead + 1 }, (_, i) => addDays(today, i - back));
}

/** Percentages for a bar height: tallest = 100, zero stays a stub so the chart never looks empty. */
export function barHeights(counts: readonly number[], min = 12, max = 100): number[] {
  const top = Math.max(1, ...counts);
  return counts.map((c) => (c === 0 ? min : Math.round(min + ((max - min) * c) / top)));
}
