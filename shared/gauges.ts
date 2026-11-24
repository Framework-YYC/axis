import { addDays } from "./rotation";

/** Geometry for the instrument-style visualizations. Pure, so every scale is defined and tested. Angles are degrees, 0 = 3 o'clock, clockwise. */
export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [round(cx + r * Math.cos(a)), round(cy + r * Math.sin(a))];
};
const round = (n: number) => Math.round(n * 100) / 100;

/** SVG path for an annular sector between radii r0 and r1, from a0 to a1 degrees (clockwise). */
export function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1), [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** A circular gauge: a full ring where `pct` percent is filled from 12 o'clock clockwise, and the rest is the hatched remainder. */
export function completionArcs(pct: number): { filled: [number, number] | null; rest: [number, number] | null; full: boolean; empty: boolean } {
  const p = Math.max(0, Math.min(100, pct));
  const start = -90;
  const end = start + (p / 100) * 360;
  if (p <= 0) return { filled: null, rest: [start, start + 360], full: false, empty: true };
  if (p >= 100) return { filled: [start, start + 360], rest: null, full: true, empty: false };
  return { filled: [start, end], rest: [end, start + 360], full: false, empty: false };
}

/** A pie wedge from the centre out to radius r, from a0 to a1 degrees clockwise. A full circle is two halves. */
export function pieSector(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (Math.abs(a1 - a0) >= 359.99) { const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a0 + 180); return `M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1} A${r} ${r} 0 1 1 ${x0} ${y0} Z`; }
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

/** Split bar: widths are each part's share of the total. Zero total yields no parts (an empty track, never fake progress). A non-zero part is never thinner than `minPct`. */
export function splitParts(values: readonly number[], minPct = 6): number[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const widths = raw.map((w, i) => (values[i] > 0 ? Math.max(minPct, w) : 0));
  const sum = widths.reduce((a, b) => a + b, 0);
  return sum > 100 ? widths.map((w) => (w / sum) * 100) : widths;
}

/** A full circle is not drawable as one arc, so a 360-degree sector is split into two halves. */
export const ringSector = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string =>
  Math.abs(a1 - a0) >= 359.99 ? `${sectorPath(cx, cy, r0, r1, a0, a0 + 180)} ${sectorPath(cx, cy, r0, r1, a0 + 180, a0 + 360)}` : sectorPath(cx, cy, r0, r1, a0, a1);

/** Radial tick marks around a circle. `filled` ticks (from 12 o'clock, clockwise) are flagged as complete. */
export function radialTicks(count: number, pct: number, cx: number, cy: number, r0: number, r1: number): Array<{ x1: number; y1: number; x2: number; y2: number; on: boolean }> {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * count);
  return Array.from({ length: count }, (_, i) => {
    const deg = -90 + (i * 360) / count;
    const [x1, y1] = polar(cx, cy, r0, deg), [x2, y2] = polar(cx, cy, r1, deg);
    return { x1, y1, x2, y2, on: i < filled };
  });
}

/** Evenly spaced dots on a circle (the dotted outer circumference). */
export const dotRing = (count: number, cx: number, cy: number, r: number): Array<[number, number]> =>
  Array.from({ length: count }, (_, i) => polar(cx, cy, r, -90 + (i * 360) / count));

/**
 * Semicircular "fan" gauge. Each of the `values.length` segments is one unit (a day); its radial length is the value
 * relative to the largest value in the set. The scale is therefore: full length = the busiest segment. Zero is a stub, never a fill.
 */
export interface FanSegment { index: number; value: number; frac: number; a0: number; a1: number; r1: number; path: string; track: string }
export function fanSegments(values: readonly number[], cx: number, cy: number, r0: number, rMax: number, gap = 3): FanSegment[] {
  const n = values.length;
  const max = Math.max(0, ...values);
  const span = 180 / n;
  return values.map((value, index) => {
    const a0 = 180 + index * span + gap / 2, a1 = 180 + (index + 1) * span - gap / 2;
    const frac = max === 0 ? 0 : value / max;
    const r1 = value === 0 ? r0 + 2 : r0 + (rMax - r0) * (0.18 + 0.82 * frac);
    return { index, value, frac, a0, a1, r1, path: sectorPath(cx, cy, r0, r1, a0, a1), track: sectorPath(cx, cy, r0, rMax, a0, a1) };
  });
}

/** Segmented progress: how many of `segments` are filled for value/total. Total 0 means nothing is filled (no fake progress). */
export function segmentsFilled(value: number, total: number, segments: number): number {
  if (total <= 0 || value <= 0) return 0;
  return Math.min(segments, Math.max(1, Math.round((value / total) * segments)));
}

export type ActivityPeriod = "this_week" | "last_week" | "last_7";
export const ACTIVITY_PERIODS: ReadonlyArray<{ id: ActivityPeriod; label: string }> = [
  { id: "this_week", label: "This week" }, { id: "last_week", label: "Last week" }, { id: "last_7", label: "Last 7 days" },
];
/** The local calendar day of an ISO timestamp, in the viewer's time zone (so an evening completion is not counted as tomorrow). */
export const localDay = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const DOW = (date: string) => new Date(`${date}T12:00:00`).getDay();
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ActivityBar { date: string; label: string; count: number; isToday: boolean; future: boolean }
/** Seven bars of "tasks completed per day" for the chosen period. Completed tasks only; archived are ignored. */
export function activityBars(tasks: ReadonlyArray<{ status: string; completedAt: string | null; archivedAt: string | null }>, period: ActivityPeriod, today: string, weekStart: 0 | 1): ActivityBar[] {
  const startThisWeek = addDays(today, -((DOW(today) - weekStart + 7) % 7));
  const first = period === "this_week" ? startThisWeek : period === "last_week" ? addDays(startThisWeek, -7) : addDays(today, -6);
  const done = new Map<string, number>();
  for (const t of tasks) if (t.status === "completed" && !t.archivedAt && t.completedAt) { const d = localDay(t.completedAt); done.set(d, (done.get(d) ?? 0) + 1); }
  return Array.from({ length: 7 }, (_, i) => { const date = addDays(first, i); return { date, label: DAY_SHORT[DOW(date)], count: done.get(date) ?? 0, isToday: date === today, future: date > today }; });
}
export const periodRange = (bars: readonly ActivityBar[]): string => `${bars[0].date}..${bars[bars.length - 1].date}`;
