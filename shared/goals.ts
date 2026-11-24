import { toDays } from "./rotation";

export type GoalTerm = "short" | "medium" | "long";
export const GOAL_TERMS: readonly GoalTerm[] = ["short", "medium", "long"];

/** Default planning horizons: short under 90 days, medium 90 days to one year, long over one year. No target date = no automatic term. */
export function goalTerm(targetDate: string | null, today: string): GoalTerm | null {
  if (!targetDate) return null;
  const days = toDays(targetDate) - toDays(today);
  if (days < 90) return "short";
  if (days <= 365) return "medium";
  return "long";
}

/** Progress 0..100 from start to target. Works for goals that go down (82 kg to 78 kg) as well as up. */
export function numericProgress(start: number, target: number, current: number): number {
  if (target === start) return current === target ? 100 : 0;
  const p = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(p * 10) / 10));
}

export interface ProgressInput {
  kind: "numeric" | "qualitative";
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  manualProgress: number | null;
  milestones: ReadonlyArray<{ done: boolean }>;
}
/** Measurable goals use their values; qualitative goals use milestones when present, otherwise a manual percentage. */
export function goalProgress(g: ProgressInput): number {
  if (g.kind === "numeric" && g.startValue !== null && g.targetValue !== null && g.currentValue !== null) return numericProgress(g.startValue, g.targetValue, g.currentValue);
  if (g.milestones.length > 0) return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 1000) / 10;
  return Math.max(0, Math.min(100, g.manualProgress ?? 0));
}
