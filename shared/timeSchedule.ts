import { dayOf, nextDay, startOfDay, offsetMinutes } from "./timeclock";

/**
 * The automatic punches: clock in at the start time on scheduled workdays, clock out at the end time. Pure and tested; the server applies the plan.
 * Principles: the worksite's time zone decides what "06:00" means; only on-rotation days are workdays; a manual punch always wins; nothing is
 * backfilled (a clock-in is only made within a short grace of its time); no lunch is ever deducted.
 */
export interface ScheduleConfig { enabled: boolean; /** The worksite zone (IANA). Never the device's. Null until the owner chooses it: nothing runs without it. */ timezone: string | null; startTime: string; endTime: string; jobId: string }
export const DEFAULT_SCHEDULE: ScheduleConfig = { enabled: true, timezone: null, startTime: "06:00", endTime: "17:30", jobId: "tjob_reef" };
/** A clock-in not made within this long after its time is recorded as missed, never backfilled. */
export const GRACE_MS = 15 * 60_000;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function validTimezone(tz: unknown): tz is string { if (typeof tz !== "string" || !tz) return false; try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return true; } catch { return false; } }
/** Throws a readable message when the configuration cannot run. */
export function validateSchedule(raw: unknown): ScheduleConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cfg: ScheduleConfig = {
    enabled: r.enabled === undefined ? DEFAULT_SCHEDULE.enabled : r.enabled === true,
    timezone: r.timezone === null || r.timezone === undefined || r.timezone === "" ? null : (validTimezone(r.timezone) ? r.timezone : (() => { throw new RangeError("That is not a valid time zone."); })()),
    startTime: typeof r.startTime === "string" ? r.startTime : DEFAULT_SCHEDULE.startTime,
    endTime: typeof r.endTime === "string" ? r.endTime : DEFAULT_SCHEDULE.endTime,
    jobId: typeof r.jobId === "string" && r.jobId ? r.jobId : DEFAULT_SCHEDULE.jobId,
  };
  if (!HHMM.test(cfg.startTime) || !HHMM.test(cfg.endTime)) throw new RangeError("Times must be HH:MM, e.g. 06:00.");
  if (minutes(cfg.endTime) <= minutes(cfg.startTime)) throw new RangeError("The clock-out time must be after the clock-in time.");
  return cfg;
}
/** Stored value to configuration; anything unreadable falls back to the defaults (which do nothing until a zone is set). */
export function parseSchedule(stored: string | null | undefined): ScheduleConfig { try { return validateSchedule(JSON.parse(stored ?? "null")); } catch { return { ...DEFAULT_SCHEDULE }; } }

/** The UTC instant of a local wall-clock time on a date in the zone (daylight saving aware). */
export function zonedInstant(date: string, hhmm: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  let t = guess - offsetMinutes(guess, tz) * 60_000;
  t = guess - offsetMinutes(t, tz) * 60_000;
  return t;
}

export type Outcome = "punched" | "skipped" | "missed" | "overtime" | "none";
export interface LogRow { date: string; action: "in" | "out"; outcome: Outcome }
export interface RunningEntry { id: string; startMs: number }
export interface Plan {
  date: string; action: "in" | "out";
  /** punch_in / punch_out change the clock; log only records why nothing was done. */
  kind: "punch_in" | "punch_out" | "log";
  atMs?: number; entryId?: string; outcome: Outcome; reason?: string;
}
export interface PlanInput {
  nowMs: number; cfg: ScheduleConfig;
  /** Whether the rotation has the date as an on day (the corrected rotation). */
  onRotation: (date: string) => boolean;
  log: readonly LogRow[];
  /** The entry running now, if any (manual or scheduled). */
  open: RunningEntry | null;
  /** True when any entry (finished or running) extends past the instant: a manual punch is already on the clock. */
  anyEntryAfter: (ms: number) => boolean;
  /** The configured job can be punched (exists and is active). */
  jobUsable: boolean;
}

/**
 * What the scheduler should do right now. Yesterday is considered only to end a job left running past its clock-out time; clock-ins are only ever for today.
 * Calling it again after applying the plan yields an empty plan (every decision is recorded), which is what makes retries and overlapping runs harmless.
 */
export function planSchedule(i: PlanInput): Plan[] {
  const { cfg, nowMs } = i;
  if (!cfg.enabled || !cfg.timezone) return [];
  const tz = cfg.timezone, today = dayOf(nowMs, tz);
  const seen = (date: string, action: "in" | "out") => i.log.some((l) => l.date === date && l.action === action);
  const plans: Plan[] = [];
  let open = i.open;
  const yesterday = (() => { const [y, m, d] = today.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); })();
  for (const date of [yesterday, today]) {
    if (!i.onRotation(date)) continue; // off rotation: no automatic punches at all
    const startMs = zonedInstant(date, cfg.startTime, tz), endMs = zonedInstant(date, cfg.endTime, tz);
    if (date === today && !seen(date, "in") && nowMs >= startMs) {
      if (nowMs >= endMs || nowMs - startMs > GRACE_MS) plans.push({ date, action: "in", kind: "log", outcome: "missed", reason: "Orbis did not run within 15 minutes of the clock-in time, so nothing was backfilled." });
      else if (open || i.anyEntryAfter(startMs)) plans.push({ date, action: "in", kind: "log", outcome: "skipped", reason: "A manual punch was already on the clock." });
      else if (!i.jobUsable) plans.push({ date, action: "in", kind: "log", outcome: "skipped", reason: "The scheduled job is missing or archived." });
      else { plans.push({ date, action: "in", kind: "punch_in", atMs: startMs, outcome: "punched" }); open = { id: "scheduled-in", startMs }; }
    }
    if (!seen(date, "out") && nowMs >= endMs) {
      if (date !== today && (!open || open.startMs >= endMs)) continue; // yesterday: only ever to end a job left running from that shift
      if (!open) plans.push({ date, action: "out", kind: "log", outcome: "none", reason: "Nothing was running at the clock-out time." });
      else if (open.startMs >= endMs) plans.push({ date, action: "out", kind: "log", outcome: "skipped", reason: "A manual punch started after the clock-out time (overtime)." });
      else if (endMs - open.startMs > 24 * 3_600_000) plans.push({ date, action: "out", kind: "log", outcome: "skipped", reason: "The running punch is from an earlier shift; correct it in the punch history." });
      else { plans.push({ date, action: "out", kind: "punch_out", atMs: endMs, entryId: open.id, outcome: "punched" }); open = null; }
    }
  }
  return plans;
}

/** The next calendar date (from `from`, inclusive) the schedule will run, looking up to a year ahead. */
export function nextScheduledDay(from: string, onRotation: (date: string) => boolean): string | null {
  let d = from;
  for (let i = 0; i < 400; i++, d = nextDay(d)) if (onRotation(d)) return d;
  return null;
}
export { startOfDay };
