import { rotationStatus, type RotationConfig } from "./rotation";

/** Visual states of one tick in a segmented indicator. */
export type Tick = "on" | "off" | "soft" | "now" | "warn" | "bad";

/** `filled` of `total` ticks on (rounded, clamped). */
export function fillTicks(total: number, value: number, max: number, tone: Tick = "on"): Tick[] {
  const n = max <= 0 ? 0 : Math.max(0, Math.min(total, Math.round((value / max) * total)));
  return Array.from({ length: total }, (_, i) => (i < n ? tone : "off"));
}

/** One tick per day of the whole rotation cycle: elapsed work days on, remaining work days off, rest days soft, today = now. */
export function rotationTicks(date: string, cfg: RotationConfig): Tick[] {
  const s = rotationStatus(date, cfg);
  const cycle = cfg.onDays + cfg.offDays;
  const index = s.phase === "on" ? s.dayInPhase - 1 : cfg.onDays + s.dayInPhase - 1;
  return Array.from({ length: cycle }, (_, i) => {
    if (i === index) return "now";
    if (i < cfg.onDays) return i < index ? "on" : "off";
    return i < index ? "soft" : "off";
  });
}

/** Dots per column for the dot-matrix chart. Zero stays zero; anything else is at least one dot. */
export function dotStacks(values: readonly number[], maxDots: number): number[] {
  const peak = Math.max(1, ...values);
  return values.map((v) => (v <= 0 ? 0 : Math.max(1, Math.round((v / peak) * maxDots))));
}

/** Fractional hour of day, 0..24. */
export const hourFraction = (d: Date) => d.getHours() + d.getMinutes() / 60;
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const clockLabel = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** Smooth path through points (quadratic midpoints), for fine-line graphs. */
export function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q${points[i][0].toFixed(1)},${points[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

/** Scales values to y coordinates (higher value = smaller y) inside [top, bottom]. */
export function scaleY(values: readonly number[], top: number, bottom: number, pad = 0.08): number[] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  return values.map((v) => bottom - ((v - lo) / span) * (bottom - top) * (1 - pad * 2) - (bottom - top) * pad);
}
