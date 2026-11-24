import { addDays, rotationStatus, toDays, type RotationConfig } from "./rotation";

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  /** weekly: days of week 0 = Sunday ... 6 (default: the weekday of the first occurrence). */
  byWeekday?: number[];
  /** monthly: day of month 1-31, clamped to the month's length (default: the first occurrence's day). */
  byMonthDay?: number;
  until?: string;
  /** "on": only occurs while on rotation; an occurrence that would fall in an off-rotation week moves to the next on-rotation date of the same rule. Absent = ignores the rotation. */
  rotation?: "on";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function validateRecurrence(v: unknown): Recurrence {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new RangeError("recurrence must be an object");
  const r = v as Record<string, unknown>;
  if (!["daily", "weekly", "monthly", "yearly"].includes(r.freq as string)) throw new RangeError("recurrence.freq must be daily, weekly, monthly or yearly");
  const interval = r.interval === undefined ? 1 : r.interval;
  if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 1 || interval > 365) throw new RangeError("recurrence.interval must be an integer 1..365");
  const out: Recurrence = { freq: r.freq as Recurrence["freq"], interval };
  if (r.byWeekday !== undefined) {
    if (!Array.isArray(r.byWeekday) || r.byWeekday.length === 0 || r.byWeekday.length > 7 || r.byWeekday.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new RangeError("recurrence.byWeekday must list weekdays 0-6");
    out.byWeekday = [...new Set(r.byWeekday as number[])].sort();
  }
  if (r.byMonthDay !== undefined) {
    if (typeof r.byMonthDay !== "number" || !Number.isInteger(r.byMonthDay) || r.byMonthDay < 1 || r.byMonthDay > 31) throw new RangeError("recurrence.byMonthDay must be 1..31");
    out.byMonthDay = r.byMonthDay;
  }
  if (r.until !== undefined) {
    if (typeof r.until !== "string" || !DATE.test(r.until)) throw new RangeError("recurrence.until must be YYYY-MM-DD");
    out.until = r.until;
  }
  if (r.rotation !== undefined) {
    if (r.rotation !== "on") throw new RangeError('recurrence.rotation must be "on" when set');
    out.rotation = "on";
  }
  return out;
}

const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const ymd = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dowOf = (d: string) => new Date(toDays(d) * 86_400_000).getUTCDay();
/** Monday-based week index, so "every 2 weeks" is stable regardless of locale. */
const weekIndex = (d: string) => Math.floor((toDays(d) - ((dowOf(d) + 6) % 7)) / 7);

/**
 * The first occurrence strictly after BOTH `anchor` (the occurrence just completed) and `notBefore` (usually today),
 * so completing a task late never produces an occurrence in the past, and the same inputs always give the same date
 * (which is what makes duplicate occurrences impossible). Returns null when the series has ended.
 */
export function nextOccurrence(rule: Recurrence, anchor: string, notBefore: string, rotation?: RotationConfig): string | null {
  let from = notBefore;
  for (let i = 0; i < 200; i++) {
    const d = baseOccurrence(rule, anchor, from);
    if (!d || !rule.rotation || !rotation || rotationStatus(d, rotation).phase === "on") return d;
    from = d; // off-rotation: take the following occurrence of the same rule
  }
  return null;
}

function baseOccurrence(rule: Recurrence, anchor: string, notBefore: string): string | null {
  const floor = anchor > notBefore ? anchor : notBefore;
  let next: string | null = null;
  const [ay, am, ad] = parts(anchor);

  if (rule.freq === "daily") {
    const gap = toDays(floor) - toDays(anchor);
    const k = Math.floor(gap / rule.interval) + 1;
    next = addDays(anchor, k * rule.interval);
  } else if (rule.freq === "weekly") {
    const days = rule.byWeekday ?? [dowOf(anchor)];
    const a = weekIndex(anchor);
    let d = addDays(floor, 1);
    for (let i = 0; i < 366 * 8; i++, d = addDays(d, 1)) {
      if (days.includes(dowOf(d)) && (weekIndex(d) - a) % rule.interval === 0) { next = d; break; }
    }
  } else if (rule.freq === "monthly") {
    const day = rule.byMonthDay ?? ad;
    for (let k = 1; k < 12 * 200; k++) {
      const total = am - 1 + k * rule.interval;
      const y = ay + Math.floor(total / 12), m = (total % 12) + 1;
      const d = ymd(y, m, Math.min(day, lastOfMonth(y, m)));
      if (d > floor) { next = d; break; }
    }
  } else {
    for (let k = 1; k < 200; k++) {
      const y = ay + k * rule.interval;
      const d = ymd(y, am, Math.min(ad, lastOfMonth(y, am)));
      if (d > floor) { next = d; break; }
    }
  }
  if (!next) return null;
  if (rule.until && next > rule.until) return null;
  return next;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** A short human description of a rule: "Every working day", "Every 2nd Tuesday", "Last day of the month". */
export function describeRecurrence(r: Recurrence): string {
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]}`;
  const every = r.interval === 1 ? "Every" : `Every ${ord(r.interval)}`;
  let base: string;
  if (r.freq === "daily") base = r.interval === 1 ? "Every day" : `${every} day`;
  else if (r.freq === "weekly") {
    const d = r.byWeekday ?? [];
    if (d.length === 7) base = r.interval === 1 ? "Every day" : `${every} week, every day`;
    else if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) base = r.interval === 1 ? "Every weekday" : `${every} week, weekdays`;
    else if (d.length === 0) base = r.interval === 1 ? "Weekly" : `${every} week`;
    else base = `${every} ${d.map((x) => DAY_NAMES[x]).join(", ")}`;
  } else if (r.freq === "monthly") base = r.byMonthDay === 31 ? "Last day of the month" : r.byMonthDay ? `Monthly on day ${r.byMonthDay}` : r.interval === 1 ? "Monthly" : `${every} month`;
  else base = r.interval === 1 ? "Yearly" : `${every} year`;
  return r.rotation === "on" ? `${base} · on rotation` : base;
}
