/**
 * Time Clock logic: pure and tested. Punches are stored as intervals (start, end; end is null while running) in UTC.
 * Nothing is deducted or ended automatically: hours are exactly the time between the owner's punches. Breaks are their own intervals.
 */
export interface TimeJob { id: string; name: string; number: string | null; active: boolean; sortOrder: number }
export interface TimeEntry { id: string; kind: "job" | "break"; jobId: string | null; /** For a break: the job that Resume returns to. */ resumeJobId: string | null; startAt: string; endAt: string | null; note: string | null; edited: boolean }

export const jobLabel = (j: Pick<TimeJob, "name" | "number"> | null | undefined): string => (j ? (j.number ? `${j.name} — ${j.number}` : j.name) : "No job");

// ---- time zones (Intl only, no libraries) ----
const fmt = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = fmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); fmt.set(tz, f); }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(ms)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}
/** Minutes the zone is ahead of UTC at an instant. */
export function offsetMinutes(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60_000;
}
/** The calendar day ("YYYY-MM-DD") an instant falls on in the zone. */
export function dayOf(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
/** The instant a calendar day starts in the zone (handles daylight saving). */
export function startOfDay(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMinutes(guess, tz) * 60_000;
  t = guess - offsetMinutes(t, tz) * 60_000;
  return t;
}
export const nextDay = (date: string): string => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + 1)).toISOString().slice(0, 10);

// ---- totals ----
export interface DayTotal { date: string; byJob: Record<string, number>; workMs: number; breakMs: number; firstStart: number | null; lastEnd: number | null; running: boolean }
const empty = (date: string): DayTotal => ({ date, byJob: {}, workMs: 0, breakMs: 0, firstStart: null, lastEnd: null, running: false });

/** Hours per local day. A running entry counts up to `nowMs`; an entry that crosses midnight is split at midnight. */
export function dayTotals(entries: readonly TimeEntry[], from: string, to: string, nowMs: number, tz: string): DayTotal[] {
  const days: DayTotal[] = [];
  for (let d = from; d <= to; d = nextDay(d)) days.push(empty(d));
  const index = new Map(days.map((d, i) => [d.date, i]));
  for (const e of entries) {
    const s = Date.parse(e.startAt), end = e.endAt ? Date.parse(e.endAt) : nowMs;
    if (!(end > s)) continue;
    for (let d = dayOf(s, tz); ; d = nextDay(d)) {
      const lo = Math.max(s, startOfDay(d, tz)), hi = Math.min(end, startOfDay(nextDay(d), tz));
      if (hi <= lo) { if (startOfDay(d, tz) >= end) break; continue; }
      const i = index.get(d);
      if (i !== undefined) {
        const t = days[i];
        if (e.kind === "break") t.breakMs += hi - lo;
        else { t.workMs += hi - lo; const k = e.jobId ?? "none"; t.byJob[k] = (t.byJob[k] ?? 0) + (hi - lo); }
        t.firstStart = t.firstStart === null ? lo : Math.min(t.firstStart, lo);
        t.lastEnd = t.lastEnd === null ? hi : Math.max(t.lastEnd, hi);
        if (!e.endAt && hi === end) t.running = true;
      }
      if (startOfDay(nextDay(d), tz) >= end) break;
    }
  }
  return days;
}

export interface WeekTotal { from: string; to: string; days: DayTotal[]; byJob: Record<string, number>; workMs: number; breakMs: number }
export function weekTotals(entries: readonly TimeEntry[], weekStart: string, nowMs: number, tz: string): WeekTotal {
  let to = weekStart; for (let i = 0; i < 6; i++) to = nextDay(to);
  const days = dayTotals(entries, weekStart, to, nowMs, tz);
  const byJob: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.byJob)) byJob[k] = (byJob[k] ?? 0) + v;
  return { from: weekStart, to, days, byJob, workMs: days.reduce((a, d) => a + d.workMs, 0), breakMs: days.reduce((a, d) => a + d.breakMs, 0) };
}
/** The first day of the week containing `date` (0 = Sunday week start, 1 = Monday). */
export function weekStartOf(date: string, weekStart: 0 | 1): string {
  const dow = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay();
  const back = (dow - weekStart + 7) % 7;
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) - back)).toISOString().slice(0, 10);
}

/** "7:05" for 7 hours 5 minutes. */
export function fmtHM(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
/** "H:MM:SS", for the running clock. */
export function fmtHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
/** Decimal hours to two places, e.g. 7.08. */
export const fmtDecimal = (ms: number): string => (Math.max(0, ms) / 3_600_000).toFixed(2);

// ---- the rules that keep the history clean ----
export const MAX_SKEW_MS = 120_000;
export interface Span { id: string; startAt: string; endAt: string | null }
/** The first entry whose interval overlaps [start, end) (an open entry extends to infinity). Touching intervals do not overlap. */
export function findOverlap(spans: readonly Span[], start: number, end: number | null, ignoreId?: string): Span | null {
  const e = end ?? Infinity;
  for (const s of spans) {
    if (s.id === ignoreId) continue;
    const a = Date.parse(s.startAt), b = s.endAt ? Date.parse(s.endAt) : Infinity;
    if (start < b && a < e) return s;
  }
  return null;
}
export type PunchAction = "job" | "break" | "resume" | "end";
export interface PunchPlan {
  /** Nothing to do: the request repeats the current state (a double tap, a retry). */
  noop?: string;
  error?: string;
  /** Close the running entry at the punch time. */
  closeOpen?: boolean;
  /** Start a new entry. */
  start?: { kind: "job" | "break"; jobId: string | null; resumeJobId: string | null };
}
/** Decides what a punch does given the running entry. Pure: the service applies it atomically. */
export function planPunch(open: Pick<TimeEntry, "kind" | "jobId" | "resumeJobId"> | null, action: PunchAction, jobId: string | null): PunchPlan {
  if (action === "job") {
    if (!jobId) return { error: "Choose a job." };
    if (open?.kind === "job" && open.jobId === jobId) return { noop: "Already on this job." };
    return { closeOpen: !!open, start: { kind: "job", jobId, resumeJobId: null } };
  }
  if (action === "break") {
    if (!open) return { error: "Start a job first: there is no shift running." };
    if (open.kind === "break") return { noop: "Already on a break." };
    return { closeOpen: true, start: { kind: "break", jobId: null, resumeJobId: open.jobId } };
  }
  if (action === "resume") {
    if (open?.kind !== "break") return open ? { error: "You are not on a break." } : { noop: "Nothing to resume: no shift is running." };
    if (!open.resumeJobId) return { error: "Choose a job to go back to." };
    return { closeOpen: true, start: { kind: "job", jobId: open.resumeJobId, resumeJobId: null } };
  }
  if (!open) return { noop: "The shift is already ended." };
  return { closeOpen: true };
}

// ---- editing helpers: the app edits in the owner's local time and stores UTC ----
/** "2026-11-25T06:05" in the zone, for a datetime-local input. */
export function toLocalInput(iso: string, tz: string): string {
  const ms = Date.parse(iso), day = dayOf(ms, tz), min = Math.floor((ms - startOfDay(day, tz)) / 60_000);
  return `${day}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
/** The UTC instant for a local "YYYY-MM-DDTHH:MM" in the zone, or null when it is not a valid time. */
export function fromLocalInput(value: string, tz: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? new Date(startOfDay(m[1], tz) + (Number(m[2]) * 60 + Number(m[3])) * 60_000).toISOString() : null;
}
/** "06:05" in the zone. */
export const clockTime = (iso: string, tz: string): string => toLocalInput(iso, tz).slice(11);
