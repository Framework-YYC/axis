import type { Recurrence } from "./recurrence";

/** The Work module's standing responsibilities. Rotation awareness is per task and editable in the task. */
export interface WorkRecurring { title: string; priority: "high" | "medium"; rule: Recurrence; /** A completed occurrence to record first (the next one follows from it). */ lastDone?: string; note?: string }

const W = (days: number[], rotation: boolean, interval = 1): Recurrence => ({ freq: "weekly", interval, byWeekday: days, ...(rotation ? { rotation: "on" as const } : {}) });

export const WORK_RECURRING: WorkRecurring[] = [
  { title: "Send daily headcount", priority: "high", rule: W([0, 1, 2, 3, 4, 5, 6], true), note: "Every day, seven days a week, while on rotation." },
  { title: "Distribute REEF EHS meeting minutes", priority: "medium", rule: W([1], true) },
  { title: "Submit top 3 safety observations", priority: "high", rule: W([4], true) },
  { title: "Invite REEF EHS to safety meeting and site walk-down", priority: "medium", rule: W([6], true) },
  { title: "Prepare next week's toolbox talks", priority: "medium", rule: W([0], true) },
  { title: "Update Progress Meeting minutes", priority: "medium", rule: W([2], false, 2), lastDone: "2026-11-24", note: "Every second Tuesday." },
  { title: "Complete weekly REEF KPIs", priority: "high", rule: W([0], false), note: "Provisional deadline: Sunday." },
  { title: "Complete weekly RIPET KPIs", priority: "high", rule: W([0], false), note: "Provisional deadline: Sunday." },
  { title: "Finalise monthly REEF KPIs", priority: "high", rule: { freq: "monthly", interval: 1, byMonthDay: 31 } },
  { title: "Finalise monthly RIPET KPIs", priority: "high", rule: { freq: "monthly", interval: 1, byMonthDay: 31 } },
];

const STOP = new Set(["the", "a", "an", "to", "for", "of", "and", "next", "complete", "send", "submit", "update", "prepare", "finalise", "finalize", "distribute"]);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
/** Two titles are the same responsibility when they share the same meaningful words (order and filler verbs ignored). */
export function sameResponsibility(a: string, b: string): boolean {
  const x = new Set(words(a)), y = new Set(words(b));
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.8 && shared / Math.max(x.size, y.size) >= 0.6;
}
