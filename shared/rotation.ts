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

/**
 * Two weeks on, one week off, travelling on Thursdays. The owner's calendar confirms: on Nov 19 to Dec 2 2026 inclusive (day 7 of 14 on Nov 25),
 * fly home Dec 3. The on-block therefore starts on Thursday Nov 19.
 */
export const DEFAULT_ROTATION: RotationConfig = { anchorDate: "2026-11-19", onDays: 14, offDays: 7 };
/** The first version seeded in the database (migration 0001) started the block three days early. A stored value equal to it was never chosen by the owner and is read as the corrected default. */
export const LEGACY_SEED_ROTATION: RotationConfig = { anchorDate: "2026-11-16", onDays: 14, offDays: 7 };
/** The last date confirmed from the owner's calendar. Travel dates after it follow the pattern and are shown as "to confirm", never as calendar events. */
export const ROTATION_CONFIRMED_THROUGH = "2026-12-03";

/** The rotation to use for a stored setting: the corrected default for the legacy seed (or nothing stored), otherwise the stored value as is. */
export function resolveRotation(stored: unknown): RotationConfig {
  const r = stored as Partial<RotationConfig> | null | undefined;
  if (!r || typeof r.anchorDate !== "string" || !(Number(r.onDays) > 0)) return DEFAULT_ROTATION;
  const cfg = { anchorDate: r.anchorDate, onDays: Number(r.onDays), offDays: Number(r.offDays ?? 0) };
  return cfg.anchorDate === LEGACY_SEED_ROTATION.anchorDate && cfg.onDays === LEGACY_SEED_ROTATION.onDays && cfg.offDays === LEGACY_SEED_ROTATION.offDays ? DEFAULT_ROTATION : cfg;
}

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

/** The current on or off block as inclusive dates. */
export function phaseWindow(date: string, cfg: RotationConfig = DEFAULT_ROTATION): { phase: "on" | "off"; start: string; end: string } {
  const st = rotationStatus(date, cfg);
  return { phase: st.phase, start: addDays(date, -(st.dayInPhase - 1)), end: addDays(date, st.daysRemaining) };
}

export interface TravelDay { date: string; kind: "fly_out" | "fly_home"; /** false when the date comes from the pattern and has not been confirmed from the calendar. */ confirmed: boolean; thursday: boolean }
const dowOf = (d: string) => new Date(toDays(d) * DAY).getUTCDay();
/** The next travel days from `date` (inclusive): the first day of each block. Fly home is the first off day, fly out the first on day. */
export function upcomingTravel(date: string, cfg: RotationConfig = DEFAULT_ROTATION, count = 3): TravelDay[] {
  const out: TravelDay[] = [];
  if (cfg.offDays === 0) return out;
  let d = date;
  for (let i = 0; i < count + 2 && out.length < count; i++) {
    const st = rotationStatus(d, cfg);
    const next = st.nextChange;
    out.push({ date: next, kind: st.phase === "on" ? "fly_home" : "fly_out", confirmed: next <= ROTATION_CONFIRMED_THROUGH, thursday: dowOf(next) === 4 });
    d = next;
  }
  return out;
}
