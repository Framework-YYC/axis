import type { Recurrence } from "./recurrence";
import { addDays, toDays } from "./rotation";

/**
 * Reusable multi-stage deliverables. A track (for example "REEF KPIs") repeats every month (a cycle). Each cycle has reporting periods, dated by a
 * recurrence rule (the actual number in the month, never a fixed four), followed by final steps (verification, submission) due on the last day.
 */
export const cycleOf = (date: string): string => date.slice(0, 7);
export const lastDayOfCycle = (cycle: string): string => { const [y, m] = cycle.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const firstDayOfCycle = (cycle: string): string => `${cycle}-01`;
export const addCycles = (cycle: string, n: number): string => { const [y, m] = cycle.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
export const cyclesBetween = (from: string, to: string): string[] => { const out: string[] = []; for (let c = from; c <= to && out.length < 36; c = addCycles(c, 1)) out.push(c); return out; };
export const cycleLabel = (cycle: string): string => new Date(`${cycle}-15T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const dow = (d: string) => new Date(toDays(d) * 86_400_000).getUTCDay();

/** Every reporting-period deadline inside a month for a daily or weekly rule (interval 1). Nov 2026 with a Sunday rule has five. */
export function periodDates(rule: Recurrence, cycle: string): string[] {
  const out: string[] = []; const end = lastDayOfCycle(cycle);
  for (let d = firstDayOfCycle(cycle); d <= end; d = addDays(d, 1)) {
    if (rule.freq === "daily" || (rule.freq === "weekly" && (rule.byWeekday ?? []).includes(dow(d)))) out.push(d);
  }
  return out;
}
export const periodRuleOk = (r: Recurrence): boolean => (r.freq === "daily" || (r.freq === "weekly" && !!r.byWeekday?.length)) && r.interval === 1;

export interface PartView { id: string; kind: "period" | "step"; key: string; label: string; dueDate: string; done: boolean; doneAt: string | null; viaTask: boolean; state: "done" | "overdue" | "due" | "upcoming" }
export function partState(done: boolean, dueDate: string, today: string): PartView["state"] {
  if (done) return "done";
  if (dueDate < today) return "overdue";
  return dueDate === today ? "due" : "upcoming";
}
export interface Progress { periodsDone: number; periodsTotal: number; stepsDone: number; stepsTotal: number; percent: number; complete: boolean }
/** Progress of one cycle: each period and each final step is one equal part, so the ring reflects the actual number of periods. */
export function progressOf(parts: Array<Pick<PartView, "kind" | "done">>): Progress {
  const periods = parts.filter((p) => p.kind === "period"), steps = parts.filter((p) => p.kind === "step");
  const done = parts.filter((p) => p.done).length;
  return { periodsDone: periods.filter((p) => p.done).length, periodsTotal: periods.length, stepsDone: steps.filter((p) => p.done).length, stepsTotal: steps.length, percent: parts.length ? Math.round((done / parts.length) * 100) : 0, complete: parts.length > 0 && done === parts.length };
}
