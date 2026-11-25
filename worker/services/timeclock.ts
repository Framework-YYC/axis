import { MAX_SKEW_MS, findOverlap, nextDay, planPunch, startOfDay, type PunchAction, type TimeJob } from "../../shared/timeclock";
import { Forbidden } from "./access";
import { auditStmt } from "./audit";
import { changes, write } from "./db";
import { prefsOf, resolveToday } from "./prefs";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

/** The Time Clock is the owner's own record of hours: no assistant can read or change it. */
const owner = (ctx: Ctx) => { if (ctx.actor.type !== "user") throw new Forbidden("The time clock is for the owner only"); };
const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) return fail("conflict", "Another punch was saved at the same moment. Refresh and try again; nothing was duplicated.");
    throw e;
  }
};

interface EntryRow { id: string; kind: "job" | "break"; job_id: string | null; resume_job_id: string | null; start_at: string; end_at: string | null; note: string | null; punch_id: string | null; edited: number; orig_start_at: string | null; orig_end_at: string | null; version: number }
interface JobRow { id: string; name: string; number: string | null; active: number; sort_order: number }
const toEntry = (r: EntryRow) => ({ id: r.id, kind: r.kind, jobId: r.job_id, resumeJobId: r.resume_job_id, startAt: r.start_at, endAt: r.end_at, note: r.note, edited: !!r.edited, origStartAt: r.orig_start_at, origEndAt: r.orig_end_at, version: r.version });
const toJob = (r: JobRow): TimeJob => ({ id: r.id, name: r.name, number: r.number, active: !!r.active, sortOrder: r.sort_order });
export type EntryView = ReturnType<typeof toEntry>;
export interface ClockState { jobs: TimeJob[]; entries: EntryView[]; open: EntryView | null; serverNow: string; timezone: string; weekStart: 0 | 1 }

const COLS = "id, kind, job_id, resume_job_id, start_at, end_at, note, punch_id, edited, orig_start_at, orig_end_at, version";
const iso = (x: unknown, name: string): string => {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(x) || Number.isNaN(Date.parse(x))) throw new v.InvalidInput(`${name} must be a date and time with a zone, e.g. 2026-11-25T06:00:00Z`);
  return new Date(x).toISOString();
};

async function loadState(ctx: Ctx, from?: string, to?: string): Promise<ClockState> {
  const prefs = await prefsOf(ctx);
  const [jobs, open] = await Promise.all([
    ctx.db.prepare("SELECT id, name, number, active, sort_order FROM time_jobs ORDER BY sort_order, name").all<JobRow>(),
    ctx.db.prepare(`SELECT ${COLS} FROM time_entries WHERE end_at IS NULL AND deleted_at IS NULL`).first<EntryRow>(),
  ]);
  // A day on either side covers every zone; the client splits at its own midnight.
  const lo = from ? new Date(startOfDay(from, "UTC") - 86_400_000).toISOString() : "0000";
  const hi = to ? new Date(startOfDay(nextDay(to), "UTC") + 86_400_000).toISOString() : "9999";
  const { results } = await ctx.db.prepare(`SELECT ${COLS} FROM time_entries WHERE deleted_at IS NULL AND start_at < ? AND (end_at IS NULL OR end_at > ?) ORDER BY start_at`).bind(hi, lo).all<EntryRow>();
  return { jobs: jobs.results.map(toJob), entries: results.map(toEntry), open: open ? toEntry(open) : null, serverNow: ctx.now().toISOString(), timezone: prefs.timezone, weekStart: prefs.weekStart };
}

export const getTimeclock = (ctx: Ctx, raw: unknown): Promise<Result<ClockState>> => guard(async () => {
  owner(ctx);
  const i = v.obj(raw ?? {}, "input");
  const today = await resolveToday(ctx, i, v);
  const from = v.date(i.from, "from") ?? new Date(startOfDay(today, "UTC") - 20 * 86_400_000).toISOString().slice(0, 10);
  return ok(await loadState(ctx, from, v.date(i.to, "to") ?? today));
});

const activeJob = async (ctx: Ctx, id: string): Promise<JobRow> => {
  const j = await ctx.db.prepare("SELECT id, name, number, active, sort_order FROM time_jobs WHERE id = ?").bind(id).first<JobRow>();
  if (!j) throw new v.InvalidInput("No such job");
  if (!j.active) throw new v.InvalidInput(`${j.name} is archived. Turn it back on in the job settings first.`);
  return j;
};

/**
 * One punch: switch job, start a break, resume, or end the shift. The previous entry is stopped and the next one started at the same
 * instant, in one atomic batch, so punches can never overlap or leave a gap. Repeating the same request (a double tap, a retry after a
 * failed save) changes nothing. Orbis never ends a shift or deducts a break by itself.
 */
export type PunchResult = ClockState & { applied: boolean; message?: string };
export const punch = (ctx: Ctx, raw: unknown): Promise<Result<PunchResult>> => guard<PunchResult>(async () => {
  owner(ctx);
  const i = v.obj(raw, "input");
  const action = v.oneOf<PunchAction>(i.action, "action", ["job", "break", "resume", "end"])!;
  const jobId = v.text(i.jobId, "jobId", { max: 80, optional: true }) ?? null;
  const punchId = v.text(i.punchId, "punchId", { max: 80, optional: true }) ?? null;
  const nowMs = ctx.now().getTime();
  const at = i.at === undefined ? new Date(nowMs).toISOString() : iso(i.at, "at");
  const atMs = Date.parse(at);
  if (atMs > nowMs + MAX_SKEW_MS) throw new v.InvalidInput("That time is in the future. Check the clock on your device.");
  if (atMs < nowMs - 48 * 3_600_000) throw new v.InvalidInput("That punch is more than 48 hours old. Add it from the punch history instead.");
  if (punchId) {
    const done = await ctx.db.prepare("SELECT id FROM time_entries WHERE punch_id = ?").bind(punchId).first();
    if (done) return ok({ ...(await loadState(ctx, undefined, undefined)), applied: false, message: "This punch was already saved." }, { duplicate: true });
  }
  const open = await ctx.db.prepare(`SELECT ${COLS} FROM time_entries WHERE end_at IS NULL AND deleted_at IS NULL`).first<EntryRow>();
  const plan = planPunch(open ? { kind: open.kind, jobId: open.job_id, resumeJobId: open.resume_job_id } : null, action, jobId);
  if (plan.error) return fail("invalid_input", plan.error);
  if (plan.noop) return ok({ ...(await loadState(ctx)), applied: false, message: plan.noop }, { duplicate: true });
  if (plan.start?.kind === "job") await activeJob(ctx, plan.start.jobId!);
  // The punch must come after everything already recorded: no overlaps, no gaps filled by accident.
  if (open) { if (atMs <= Date.parse(open.start_at)) throw new v.InvalidInput("That time is not after the running punch started."); }
  else {
    const last = await ctx.db.prepare("SELECT MAX(end_at) AS e FROM time_entries WHERE deleted_at IS NULL").first<{ e: string | null }>();
    if (last?.e && atMs < Date.parse(last.e)) throw new v.InvalidInput("That time is before your last punch ended. Add it from the punch history instead.");
  }
  const now = ctx.now().toISOString();
  const stmts: D1PreparedStatement[] = [];
  if (open && plan.closeOpen) stmts.push(ctx.db.prepare("UPDATE time_entries SET end_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND end_at IS NULL").bind(at, now, ctx.actor.label, open.id));
  let newId: string | null = null;
  if (plan.start) {
    newId = `tent_${crypto.randomUUID()}`;
    stmts.push(ctx.db.prepare("INSERT INTO time_entries (id, kind, job_id, resume_job_id, start_at, end_at, note, punch_id, created_at, updated_at, created_by, updated_by) VALUES (?,?,?,?,?,NULL,NULL,?,?,?,?,?)").bind(newId, plan.start.kind, plan.start.jobId, plan.start.resumeJobId, at, punchId, now, now, ctx.actor.label, ctx.actor.label));
  }
  stmts.push(auditStmt(ctx, `timeclock.${action}`, "time_entry", newId ?? open?.id ?? null));
  const res = await write(ctx.db, stmts);
  if (open && plan.closeOpen && changes(res[0]) !== 1) return fail("conflict", "The running punch changed while saving. Refresh and try again; nothing was duplicated.");
  return ok({ ...(await loadState(ctx)), applied: true });
});

/** Entries other than `ignore`, for overlap checks. */
const others = async (ctx: Ctx, ignore: string[]) => (await ctx.db.prepare("SELECT id, start_at, end_at FROM time_entries WHERE deleted_at IS NULL").all<{ id: string; start_at: string; end_at: string | null }>()).results.filter((r) => !ignore.includes(r.id)).map((r) => ({ id: r.id, startAt: r.start_at, endAt: r.end_at }));

/**
 * Edit a punch: change its start, end, job or note. The original punched times are kept the first time. Moving the start (or end) of an entry that
 * directly follows (or precedes) another moves the neighbour's matching edge too, which is how a switch time is corrected. Overlaps are refused.
 */
export const editEntry = (ctx: Ctx, raw: unknown): Promise<Result<ClockState>> => guard(async () => {
  owner(ctx);
  const i = v.obj(raw, "input");
  const id = v.text(i.id, "id", { max: 80 })!;
  const row = await ctx.db.prepare(`SELECT ${COLS} FROM time_entries WHERE id = ? AND deleted_at IS NULL`).bind(id).first<EntryRow>();
  if (!row) return fail("not_found", "No such punch");
  const nowMs = ctx.now().getTime(), now = ctx.now().toISOString();
  const start = i.startAt === undefined ? row.start_at : iso(i.startAt, "startAt");
  const end = i.endAt === undefined ? row.end_at : i.endAt === null ? null : iso(i.endAt, "endAt");
  if (end === null && row.end_at !== null) throw new v.InvalidInput("A finished punch cannot be reopened. Punch a new one instead.");
  if (end !== null && Date.parse(end) <= Date.parse(start)) throw new v.InvalidInput("The end must be after the start.");
  if (Date.parse(start) > nowMs + MAX_SKEW_MS || (end && Date.parse(end) > nowMs + MAX_SKEW_MS)) throw new v.InvalidInput("Times cannot be in the future.");
  const jobId = i.jobId === undefined ? (row.kind === "job" ? row.job_id : row.resume_job_id) : v.text(i.jobId, "jobId", { max: 80 })!;
  if (i.jobId !== undefined) await activeJob(ctx, jobId!);
  const note = i.note === undefined ? row.note : (v.text(i.note, "note", { max: 200, optional: true }) ?? null);
  const stmts: D1PreparedStatement[] = [];
  const spans = await others(ctx, [id]);
  // Contiguous neighbours follow a moved edge.
  const prev = start !== row.start_at ? spans.find((s) => s.endAt === row.start_at) : undefined;
  const next = end !== row.end_at && row.end_at ? spans.find((s) => s.startAt === row.end_at) : undefined;
  const ignore = [id, ...(prev ? [prev.id] : []), ...(next ? [next.id] : [])];
  const rest = spans.filter((s) => !ignore.includes(s.id));
  if (findOverlap(rest, Date.parse(start), end ? Date.parse(end) : null)) throw new v.InvalidInput("That would overlap another punch. Adjust the neighbouring punch first.");
  if (prev) { if (Date.parse(start) <= Date.parse(prev.startAt)) throw new v.InvalidInput("The start would move before the previous punch began."); if (findOverlap(rest, Date.parse(prev.startAt), Date.parse(start))) throw new v.InvalidInput("That would overlap another punch."); }
  if (next) { if (end === null || (next.endAt && Date.parse(end) >= Date.parse(next.endAt))) throw new v.InvalidInput("The end would move past the next punch."); if (findOverlap(rest, Date.parse(end), next.endAt ? Date.parse(next.endAt) : null)) throw new v.InvalidInput("That would overlap another punch."); }
  const touch = (rid: string, s: string, e: string | null, orig: { s: string; e: string | null } | null) =>
    ctx.db.prepare("UPDATE time_entries SET start_at = ?, end_at = ?, edited = 1, orig_start_at = COALESCE(orig_start_at, ?), orig_end_at = COALESCE(orig_end_at, ?), updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(s, e, orig?.s ?? s, orig?.e ?? e, now, ctx.actor.label, rid);
  stmts.push(ctx.db.prepare("UPDATE time_entries SET start_at = ?, end_at = ?, note = ?, job_id = CASE WHEN kind = 'job' THEN ? ELSE job_id END, resume_job_id = CASE WHEN kind = 'break' THEN ? ELSE resume_job_id END, edited = CASE WHEN ? != start_at OR ? IS NOT end_at THEN 1 ELSE edited END, orig_start_at = CASE WHEN (? != start_at OR ? IS NOT end_at) THEN COALESCE(orig_start_at, start_at) ELSE orig_start_at END, orig_end_at = CASE WHEN (? != start_at OR ? IS NOT end_at) THEN COALESCE(orig_end_at, end_at) ELSE orig_end_at END, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
    .bind(start, end, note, jobId, jobId, start, end, start, end, start, end, now, ctx.actor.label, id));
  if (prev) { const p = (await ctx.db.prepare(`SELECT ${COLS} FROM time_entries WHERE id = ?`).bind(prev.id).first<EntryRow>())!; stmts.push(touch(prev.id, p.start_at, start, { s: p.start_at, e: p.end_at })); }
  if (next) { const n = (await ctx.db.prepare(`SELECT ${COLS} FROM time_entries WHERE id = ?`).bind(next.id).first<EntryRow>())!; stmts.push(touch(next.id, end!, n.end_at, { s: n.start_at, e: n.end_at })); }
  stmts.push(auditStmt(ctx, "timeclock.edit", "time_entry", id));
  await write(ctx.db, stmts);
  return ok(await loadState(ctx));
});

/** A missed punch added after the fact: a finished entry with a start and an end, never overlapping another. */
export const addEntry = (ctx: Ctx, raw: unknown): Promise<Result<ClockState>> => guard(async () => {
  owner(ctx);
  const i = v.obj(raw, "input");
  const kind = v.oneOf<"job" | "break">(i.kind, "kind", ["job", "break"], "job")!;
  const start = iso(i.startAt, "startAt"), end = iso(i.endAt, "endAt");
  if (Date.parse(end) <= Date.parse(start)) throw new v.InvalidInput("The end must be after the start.");
  if (Date.parse(end) > ctx.now().getTime() + MAX_SKEW_MS) throw new v.InvalidInput("Times cannot be in the future.");
  const jobId = v.text(i.jobId, "jobId", { max: 80, optional: kind === "break" }) ?? null;
  if (kind === "job") await activeJob(ctx, jobId!);
  if (findOverlap(await others(ctx, []), Date.parse(start), Date.parse(end))) throw new v.InvalidInput("That would overlap another punch.");
  const id = `tent_${crypto.randomUUID()}`, now = ctx.now().toISOString();
  await write(ctx.db, [ctx.db.prepare("INSERT INTO time_entries (id, kind, job_id, resume_job_id, start_at, end_at, note, edited, created_at, updated_at, created_by, updated_by) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)").bind(id, kind, kind === "job" ? jobId : null, kind === "break" ? jobId : null, start, end, v.text(i.note, "note", { max: 200, optional: true }) ?? null, now, now, ctx.actor.label, ctx.actor.label), auditStmt(ctx, "timeclock.add", "time_entry", id)]);
  return ok(await loadState(ctx));
});

/** Removes a punch from the history (kept in the audit trail). Deleting the running punch clocks you out. */
export const deleteEntry = (ctx: Ctx, raw: unknown): Promise<Result<ClockState>> => guard(async () => {
  owner(ctx);
  const id = v.text(v.obj(raw, "input").id, "id", { max: 80 })!;
  const now = ctx.now().toISOString();
  const r = await write(ctx.db, [ctx.db.prepare("UPDATE time_entries SET deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL").bind(now, now, ctx.actor.label, id), auditStmt(ctx, "timeclock.delete", "time_entry", id)]);
  if (changes(r[0]) !== 1) return fail("not_found", "No such punch");
  return ok(await loadState(ctx));
});

/** Job names and numbers: add one, rename it, change its number, put it away or bring it back. Past punches keep pointing at it. */
export const saveJob = (ctx: Ctx, raw: unknown): Promise<Result<ClockState>> => guard(async () => {
  owner(ctx);
  const i = v.obj(raw, "input");
  const now = ctx.now().toISOString();
  const id = v.text(i.id, "id", { max: 80, optional: true });
  const name = v.text(i.name, "name", { max: 40, optional: !!id });
  const number = i.number === undefined ? undefined : (v.text(i.number, "number", { max: 20, optional: true }) ?? null);
  const active = v.bool(i.active, "active");
  const sort = i.sortOrder === undefined ? undefined : v.int(i.sortOrder, "sortOrder", { min: 0, max: 999, fallback: 0 });
  if (!id) {
    if (!name) throw new v.InvalidInput("A job needs a name.");
    const max = (await ctx.db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM time_jobs").first<{ m: number }>())!.m;
    const jid = `tjob_${crypto.randomUUID()}`;
    await write(ctx.db, [ctx.db.prepare("INSERT INTO time_jobs (id, name, number, active, sort_order, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?)").bind(jid, name, number ?? null, active === false ? 0 : 1, sort ?? max + 1, now, now, ctx.actor.label), auditStmt(ctx, "timeclock.job.create", "time_job", jid)]);
  } else {
    const cur = await ctx.db.prepare("SELECT id, name, number, active, sort_order FROM time_jobs WHERE id = ?").bind(id).first<JobRow>();
    if (!cur) return fail("not_found", "No such job");
    if (active === false) { const run = await ctx.db.prepare("SELECT 1 FROM time_entries WHERE end_at IS NULL AND deleted_at IS NULL AND (job_id = ? OR resume_job_id = ?)").bind(id, id).first(); if (run) throw new v.InvalidInput("This job is running now. Switch jobs or end the shift first."); }
    await write(ctx.db, [ctx.db.prepare("UPDATE time_jobs SET name = ?, number = ?, active = ?, sort_order = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(name ?? cur.name, number === undefined ? cur.number : number, active === undefined ? cur.active : active ? 1 : 0, sort ?? cur.sort_order, now, ctx.actor.label, id), auditStmt(ctx, "timeclock.job.update", "time_job", id)]);
  }
  return ok(await loadState(ctx));
});

/** Synthetic punches for staging review: a finished week plus today. Idempotent. */
export async function demoTimeEntries(ctx: Ctx, today: string): Promise<number> {
  const exists = await ctx.db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE demo = 1").first<{ n: number }>();
  if (exists && exists.n > 0) return 0;
  const tz = (await prefsOf(ctx)).timezone;
  const at = (date: string, hhmm: string) => new Date(startOfDay(date, tz) + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000).toISOString();
  const addD = (d: string, n: number) => new Date(startOfDay(d, "UTC") + n * 86_400_000).toISOString().slice(0, 10);
  const now = ctx.now().toISOString(), stmts: D1PreparedStatement[] = [];
  let n = 0;
  const put = (kind: "job" | "break", job: string | null, resume: string | null, s: string, e: string | null, note: string | null = "Synthetic") => { stmts.push(ctx.db.prepare("INSERT INTO time_entries (id, kind, job_id, resume_job_id, start_at, end_at, note, demo, created_at, updated_at, created_by, updated_by) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)").bind(`tent_${crypto.randomUUID()}`, kind, job, resume, s, e, note, now, now, ctx.actor.label, ctx.actor.label)); n++; };
  for (let k = 5; k >= 1; k--) { // the five previous days: 06:00 to 17:30 with switches and a lunch break the owner punched
    const d = addD(today, -k);
    put("job", "tjob_reef", null, at(d, "06:00"), at(d, "09:30")); put("job", "tjob_ripet", null, at(d, "09:30"), at(d, "12:00"));
    put("break", null, "tjob_ripet", at(d, "12:00"), at(d, "12:30")); put("job", "tjob_ripet", null, at(d, "12:30"), at(d, "14:45")); put("job", "tjob_reef", null, at(d, "14:45"), at(d, "17:30"));
  }
  stmts.push(auditStmt(ctx, "demo.timeclock", "time_entry", null));
  await write(ctx.db, stmts);
  return n;
}
