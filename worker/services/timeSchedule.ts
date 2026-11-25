import { rotationStatus } from "../../shared/rotation";
import { dayOf, nextDay } from "../../shared/timeclock";
import { DEFAULT_SCHEDULE, nextScheduledDay, parseSchedule, planSchedule, validateSchedule, type LogRow, type Outcome, type Plan, type ScheduleConfig } from "../../shared/timeSchedule";
import { Forbidden } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { prefsOf } from "./prefs";
import { fail, ok, SCOPES, type Ctx, type Result } from "./types";
import * as v from "./validate";

export const SCHEDULE_KEY = "timeclock_schedule";
const STATUS_KEY = "timeclock_schedule_status";
/** Orbis acting on the owner's standing instruction (the schedule they configured). The audit trail says so. */
const systemCtx = (db: D1Database, now: Date): Ctx => ({ db, actor: { type: "user", id: "owner", label: "Orbis (scheduled punch)", scopes: new Set<string>(SCOPES), channel: "web" }, requestId: `time-schedule-${now.getTime()}`, now: () => now });

export async function loadSchedule(db: D1Database): Promise<ScheduleConfig> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(SCHEDULE_KEY).first<{ value: string }>();
  return row ? parseSchedule(row.value) : { ...DEFAULT_SCHEDULE };
}
interface Status { at: string; date: string; action: string; message: string }
const loadStatus = async (db: D1Database): Promise<Status | null> => { const r = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(STATUS_KEY).first<{ value: string }>(); try { return r ? (JSON.parse(r.value) as Status) : null; } catch { return null; } };
const setStatus = (ctx: Ctx, s: Status | null) => s
  ? write(ctx.db, [ctx.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(STATUS_KEY, JSON.stringify(s), ctx.now().toISOString())])
  : write(ctx.db, [ctx.db.prepare("DELETE FROM settings WHERE key = ?").bind(STATUS_KEY)]);

const iso = (ms: number) => new Date(ms).toISOString();

/** Applies one planned step atomically. A failed batch changes nothing, so the next run simply plans it again (a retry cannot double-punch: the day's log row and the open-entry rule forbid it). */
async function apply(ctx: Ctx, p: Plan): Promise<void> {
  const at = ctx.now().toISOString(), by = ctx.actor.label;
  const logRow = (entryId: string | null, reason: string | null) => ctx.db.prepare("INSERT INTO time_schedule_log (local_date, action, outcome, reason, entry_id, at, created_by) VALUES (?,?,?,?,?,?,?)").bind(p.date, p.action, p.outcome, reason, entryId, at, by);
  const logIfChanged = (entryId: string | null) => ctx.db.prepare("INSERT INTO time_schedule_log (local_date, action, outcome, reason, entry_id, at, created_by) SELECT ?,?,?,?,?,?,? WHERE changes() = 1").bind(p.date, p.action, p.outcome, null, entryId, at, by);
  if (p.kind === "log") { await write(ctx.db, [logRow(null, p.reason ?? null)]); return; }
  if (p.kind === "punch_in") {
    const cfg = await loadSchedule(ctx.db), id = `tent_${crypto.randomUUID()}`;
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO time_entries (id, kind, job_id, start_at, end_at, punch_id, source, created_at, updated_at, created_by, updated_by) VALUES (?, 'job', ?, ?, NULL, ?, 'scheduled', ?, ?, ?, ?)").bind(id, cfg.jobId, iso(p.atMs!), `sched:in:${p.date}`, at, at, by, by),
      logIfChanged(id), auditStmt(ctx, "timeclock.scheduled_in", "time_entry", id),
    ]);
    return;
  }
  // punch_out: end the running entry at the clock-out time, only if it is still running and started before it.
  await write(ctx.db, [
    ctx.db.prepare("UPDATE time_entries SET end_at = ?, end_source = 'scheduled', updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND end_at IS NULL AND deleted_at IS NULL AND start_at < ?").bind(iso(p.atMs!), at, by, p.entryId, iso(p.atMs!)),
    logIfChanged(p.entryId ?? null), auditStmt(ctx, "timeclock.scheduled_out", "time_entry", p.entryId ?? null),
  ]);
}

export interface RunResult { applied: number; error?: string }
/**
 * The schedule's tick: runs every minute from the Cron Trigger (production) and whenever the owner opens or polls the app (staging has no Cron Trigger).
 * Safe to call as often as you like: every decision is recorded once per day and action. A failure is remembered (and shown on the clock) and retried on the next tick.
 */
export async function runTimeSchedule(db: D1Database, now = new Date()): Promise<RunResult> {
  const ctx = systemCtx(db, now);
  const cfg = await loadSchedule(db);
  if (!cfg.enabled || !cfg.timezone) return { applied: 0 };
  const tz = cfg.timezone, nowMs = now.getTime();
  const today = dayOf(nowMs, tz);
  const rotation = (await prefsOf(ctx)).rotation;
  const [logs, open, latest, job] = await Promise.all([
    db.prepare("SELECT local_date AS date, action, outcome FROM time_schedule_log WHERE local_date >= ?").bind(dayOf(nowMs - 3 * 86_400_000, tz)).all<LogRow>(),
    db.prepare("SELECT id, start_at FROM time_entries WHERE end_at IS NULL AND deleted_at IS NULL").first<{ id: string; start_at: string }>(),
    db.prepare("SELECT MAX(COALESCE(end_at, '9999-12-31T00:00:00.000Z')) AS m FROM time_entries WHERE deleted_at IS NULL").first<{ m: string | null }>(),
    db.prepare("SELECT active FROM time_jobs WHERE id = ?").bind(cfg.jobId).first<{ active: number }>(),
  ]);
  const plans = planSchedule({ nowMs, cfg, onRotation: (d) => rotationStatus(d, rotation).phase === "on", log: logs.results, open: open ? { id: open.id, startMs: Date.parse(open.start_at) } : null, anyEntryAfter: (ms) => !!latest?.m && latest.m > iso(ms), jobUsable: !!job?.active });
  let applied = 0;
  for (const p of plans) {
    try { await apply(ctx, p); if (p.kind !== "log") applied++; }
    catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) continue; // someone (a manual punch, another run) got there first: next tick re-plans from the new state
      const message = p.kind === "punch_in" ? "The scheduled clock-in could not be saved. Orbis will try again." : "The scheduled clock-out could not be saved. Orbis will try again.";
      await setStatus(ctx, { at: now.toISOString(), date: p.date, action: p.action, message }).catch(() => undefined);
      return { applied, error: message };
    }
  }
  if (await loadStatus(db)) await setStatus(ctx, null).catch(() => undefined);
  void today;
  return { applied };
}

export interface ScheduleView { config: ScheduleConfig; /** Today at the worksite. */ today: { date: string; onRotation: boolean; inOutcome: Outcome | null; outOutcome: Outcome | null; inReason: string | null } | null; nextRunDate: string | null; status: Status | null }
export async function scheduleView(ctx: Ctx): Promise<ScheduleView> {
  const config = await loadSchedule(ctx.db), status = await loadStatus(ctx.db);
  if (!config.timezone) return { config, today: null, nextRunDate: null, status };
  const rotation = (await prefsOf(ctx)).rotation, date = dayOf(ctx.now().getTime(), config.timezone);
  const rows = (await ctx.db.prepare("SELECT action, outcome, reason FROM time_schedule_log WHERE local_date = ?").bind(date).all<{ action: "in" | "out"; outcome: Outcome; reason: string | null }>()).results;
  const on = (d: string) => rotationStatus(d, rotation).phase === "on";
  return { config, status, today: { date, onRotation: on(date), inOutcome: rows.find((r) => r.action === "in")?.outcome ?? null, outOutcome: rows.find((r) => r.action === "out")?.outcome ?? null, inReason: rows.find((r) => r.action === "in")?.reason ?? null }, nextRunDate: nextScheduledDay(nextDay(date), on) };
}

const owner = (ctx: Ctx) => { if (ctx.actor.type !== "user") throw new Forbidden("The time clock is for the owner only"); };
const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof RangeError || e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};

/** Save the schedule: worksite time zone, clock-in and clock-out times, job, on/off. */
export const saveSchedule = (ctx: Ctx, raw: unknown): Promise<Result<ScheduleView>> => guard(async () => {
  owner(ctx);
  const merged = validateSchedule({ ...(await loadSchedule(ctx.db)), ...v.obj(raw, "input") });
  const job = await ctx.db.prepare("SELECT active FROM time_jobs WHERE id = ?").bind(merged.jobId).first<{ active: number }>();
  if (!job?.active) throw new v.InvalidInput("Choose an active job for the automatic clock-in.");
  await write(ctx.db, [ctx.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(SCHEDULE_KEY, JSON.stringify(merged), ctx.now().toISOString()), auditStmt(ctx, "timeclock.schedule.update", "setting", SCHEDULE_KEY)]);
  return ok(await scheduleView(ctx));
});

/** Today's one-off choices: skip the automatic clock-in, or work overtime (no automatic clock-out today). Each is recorded once, so it can neither be repeated nor undone by a retry. */
export const scheduleAction = (ctx: Ctx, raw: unknown): Promise<Result<ScheduleView>> => guard(async () => {
  owner(ctx);
  const action = v.oneOf<"skip_in" | "overtime">(v.obj(raw, "input").action, "action", ["skip_in", "overtime"])!;
  const view = await scheduleView(ctx);
  if (!view.today) return fail("invalid_input", "Choose the worksite time zone first.");
  const t = view.today, now = ctx.now().toISOString();
  const kind = action === "skip_in" ? "in" : "out", done = kind === "in" ? t.inOutcome : t.outOutcome;
  if (done) return fail("conflict", kind === "in" ? "Today's automatic clock-in was already decided." : done === "overtime" ? "Overtime is already on for today." : "Today's automatic clock-out already happened. Tap a job to keep working; the gap is not counted.");
  await write(ctx.db, [ctx.db.prepare("INSERT INTO time_schedule_log (local_date, action, outcome, reason, at, created_by) VALUES (?,?,?,?,?,?)").bind(t.date, kind, action === "skip_in" ? "skipped" : "overtime", action === "skip_in" ? "Skipped by the owner." : "Overtime: no automatic clock-out today.", now, ctx.actor.label), auditStmt(ctx, `timeclock.schedule.${action}`, "time_schedule", t.date)]);
  return ok(await scheduleView(ctx));
});
