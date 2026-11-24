/** Configurable work rotation (default 14 days on, 7 days off). Dates are plain "YYYY-MM-DD" strings, so no timezone drift. */
export interface RotationConfig {
  /** First day of any "on" block. */
  anchorDate: string;
  onDays: number;
  offDays: number;
}

export interface RotationStatus {
  phase: "on" | "off";
  /** 1-based day within the current phase. */
  dayInPhase: number;
  phaseLength: number;
  daysRemaining: number;
  nextChange: string;
}

export const DEFAULT_ROTATION: RotationConfig = { anchorDate: "2026-11-16", onDays: 14, offDays: 7 };

const DAY = 86_400_000;
export function toDays(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
}
export function addDays(date: string, n: number): string {
  return new Date((toDays(date) + n) * DAY).toISOString().slice(0, 10);
}

export function rotationStatus(date: string, cfg: RotationConfig = DEFAULT_ROTATION): RotationStatus {
  if (!(cfg.onDays > 0) || !(cfg.offDays >= 0) || !Number.isInteger(cfg.onDays + cfg.offDays)) {
    throw new RangeError("Invalid rotation");
  }
  const cycle = cfg.onDays + cfg.offDays;
  const offset = (((toDays(date) - toDays(cfg.anchorDate)) % cycle) + cycle) % cycle;
  const on = offset < cfg.onDays;
  const dayInPhase = on ? offset + 1 : offset - cfg.onDays + 1;
  const phaseLength = on ? cfg.onDays : cfg.offDays;
  const daysRemaining = phaseLength - dayInPhase;
  return { phase: on ? "on" : "off", dayInPhase, phaseLength, daysRemaining, nextChange: addDays(date, daysRemaining + 1) };
}
