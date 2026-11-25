import { DEFAULT_ROTATION, resolveRotation, type RotationConfig } from "../../shared/rotation";
import type { WeekStart } from "../../shared/horizons";
import type { Ctx } from "./types";

export interface Prefs { timezone: string; weekStart: WeekStart; rotation: RotationConfig }

/** "Today" as a calendar date in an IANA timezone. */
export function todayIn(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return true; } catch { return false; }
}

/** Preferences are read once per request. Timezone 'auto' (never set from a device yet) falls back to UTC on the server. */
export async function prefsOf(ctx: Pick<Ctx, "db" | "prefs">): Promise<Prefs> {
  if (ctx.prefs) return ctx.prefs;
  const { results } = await ctx.db.prepare("SELECT key, value FROM settings WHERE key IN ('timezone', 'week_start', 'work_rotation')").all<{ key: string; value: string }>();
  const m = new Map(results.map((r) => [r.key, r.value]));
  let rotation = DEFAULT_ROTATION;
  try { rotation = resolveRotation(JSON.parse(m.get("work_rotation") ?? "null")); } catch { /* keep default */ }
  const tz = m.get("timezone");
  const prefs: Prefs = { timezone: tz && tz !== "auto" && validTimezone(tz) ? tz : "UTC", weekStart: m.get("week_start") === "sunday" ? 0 : 1, rotation };
  ctx.prefs = prefs;
  return prefs;
}

/** An explicit `today` (the caller's own date, preferred) wins; then an explicit timezone; then the owner's stored timezone. */
export async function resolveToday(ctx: Ctx, input: Record<string, unknown>, v: { date: (x: unknown, n: string) => string | undefined; InvalidInput: new (m: string) => Error }): Promise<string> {
  const explicit = v.date(input.today, "today");
  if (explicit) return explicit;
  const tz = typeof input.timezone === "string" ? input.timezone : (await prefsOf(ctx)).timezone;
  if (!validTimezone(tz)) throw new v.InvalidInput("timezone must be a valid IANA timezone");
  return todayIn(tz, ctx.now());
}
