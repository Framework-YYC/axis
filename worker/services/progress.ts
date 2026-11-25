import { addCycles, cycleLabel, cycleOf, cyclesBetween, lastDayOfCycle, partState, periodDates, periodRuleOk, progressOf, type PartView, type Progress } from "../../shared/progress";
import { validateRecurrence, type Recurrence } from "../../shared/recurrence";
import { assertModule, canAccessModule, defaultModule, Forbidden } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { resolveToday } from "./prefs";
import { completeTask, reopenTask } from "./tasks";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

export interface Step { key: string; title: string }
export interface Track { key: string; module: string; title: string; stream: string | null; periodRule: Recurrence; periodLabel: string; steps: Step[]; startCycle: string; active: boolean }
export interface CycleView { cycle: string; label: string; dueDate: string; parts: Array<PartView & { taskId: string | null }>; progress: Progress; materialized: boolean }
export interface TrackView extends Track { cycles: CycleView[] }
interface TrackRow { key: string; module: string; title: string; stream: string | null; period_rule: string; period_label: string; steps: string; start_cycle: string; active: number }
const DEFAULT_STEPS: Step[] = [{ key: "verify", title: "Final verification" }, { key: "submit", title: "Submit monthly report" }];
const MAX_CYCLES = 12;

const toTrack = (r: TrackRow): Track => ({ key: r.key, module: r.module, title: r.title, stream: r.stream, periodRule: JSON.parse(r.period_rule), periodLabel: r.period_label, steps: JSON.parse(r.steps), startCycle: r.start_cycle, active: r.active === 1 });
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** Creates a reusable progress track. Idempotent on its key. Owner only. */
export async function createTrack(ctx: Ctx, raw: unknown): Promise<Result<Track>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Owner only");
  try {
    const i = v.obj(raw, "track");
    const key = v.text(i.key, "key", { max: 40 })!;
    if (!/^[a-z0-9-]{2,40}$/.test(key)) throw new v.InvalidInput("key must be lowercase letters, digits and hyphens");
    const existing = await ctx.db.prepare("SELECT * FROM progress_tracks WHERE key = ?").bind(key).first<TrackRow>();
    if (existing) return ok(toTrack(existing), { duplicate: true });
    const rule = validateRecurrence(i.periodRule);
    if (!periodRuleOk(rule)) throw new v.InvalidInput("periodRule must be a daily rule or a weekly rule with weekdays and interval 1");
    const steps = i.steps === undefined ? DEFAULT_STEPS : (Array.isArray(i.steps) ? i.steps : []).map((s) => ({ key: v.text((s as Record<string, unknown>).key, "step key", { max: 30 })!, title: v.text((s as Record<string, unknown>).title, "step title", { max: 80 })! }));
    const module = v.moduleId(i.module) ?? defaultModule(ctx.actor);
    assertModule(ctx.actor, module);
    const today = await resolveToday(ctx, i, v);
    const startCycle = v.text(i.startCycle, "startCycle", { max: 7, optional: true }) ?? cycleOf(today);
    if (!/^\d{4}-\d{2}$/.test(startCycle)) throw new v.InvalidInput("startCycle must be YYYY-MM");
    const at = ctx.now().toISOString();
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO progress_tracks (key,module,title,stream,period_rule,period_label,steps,start_cycle,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)")
        .bind(key, module, v.text(i.title, "title", { max: 120 })!, v.text(i.stream, "stream", { max: 30, optional: true }) ?? null, JSON.stringify(rule), v.text(i.periodLabel, "periodLabel", { max: 30, optional: true }) ?? "Week ending", JSON.stringify(steps), startCycle, at, at),
      auditStmt(ctx, "track.create", "track", key),
    ]);
    return ok(toTrack((await ctx.db.prepare("SELECT * FROM progress_tracks WHERE key = ?").bind(key).first<TrackRow>())!));
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
}

interface PartRow { id: string; deliverable_id: string; kind: "period" | "step"; part_key: string; label: string; due_date: string; sort_order: number; done_at: string | null }
interface LinkedTask { id: string; due_date: string; status: string; track_part: string }

/** Builds one cycle: stored parts if the cycle was materialised, otherwise the parts the track's rule implies. Done = marked done here OR the linked task completed. */
function buildCycle(track: Track, cycle: string, stored: PartRow[] | null, tasks: LinkedTask[], today: string): CycleView {
  const due = lastDayOfCycle(cycle);
  const rows: Array<{ id: string | null; kind: "period" | "step"; key: string; label: string; dueDate: string; doneAt: string | null }> = stored
    ? [...stored].sort((a, b) => a.sort_order - b.sort_order).map((p) => ({ id: p.id, kind: p.kind, key: p.part_key, label: p.label, dueDate: p.due_date, doneAt: p.done_at }))
    : [
        ...periodDates(track.periodRule, cycle).map((d) => ({ id: null, kind: "period" as const, key: d, label: `${track.periodLabel} ${shortDate(d)}`, dueDate: d, doneAt: null })),
        ...track.steps.map((s) => ({ id: null, kind: "step" as const, key: s.key, label: s.title, dueDate: due, doneAt: null })),
      ];
  const parts = rows.map((r) => {
    const tp = `${track.key}:${r.kind === "period" ? "period" : r.key === "submit" ? "submit" : "none"}`;
    const linked = r.kind === "period" || r.key === "submit" ? tasks.filter((t) => t.track_part === tp && t.due_date === r.dueDate).sort((a, b) => (a.status === "completed" ? 0 : 1) - (b.status === "completed" ? 0 : 1))[0] : undefined;
    const viaTask = linked?.status === "completed";
    const done = !!r.doneAt || viaTask;
    return { id: r.id ?? `${track.key}:${cycle}:${r.key}`, kind: r.kind, key: r.key, label: r.label, dueDate: r.dueDate, done, doneAt: r.doneAt, viaTask, state: partState(done, r.dueDate, today), taskId: linked && linked.status !== "completed" ? linked.id : linked?.id ?? null };
  });
  return { cycle, label: cycleLabel(cycle), dueDate: due, parts, progress: progressOf(parts), materialized: !!stored };
}

async function loadTracks(ctx: Ctx, key?: string): Promise<Track[]> {
  const { results } = await ctx.db.prepare(`SELECT * FROM progress_tracks WHERE active = 1 ${key ? "AND key = ?" : ""} ORDER BY title`).bind(...(key ? [key] : [])).all<TrackRow>();
  return results.map(toTrack).filter((t) => canAccessModule(ctx.actor, t.module));
}

async function viewTrack(ctx: Ctx, track: Track, today: string): Promise<TrackView> {
  const current = cycleOf(today);
  const first = track.startCycle > addCycles(current, -(MAX_CYCLES - 1)) ? track.startCycle : addCycles(current, -(MAX_CYCLES - 1));
  const cycles = cyclesBetween(first, current);
  const range = [`${first}-01`, lastDayOfCycle(current)];
  const [{ results: tasks }, { results: parts }, { results: dels }] = await Promise.all([
    ctx.db.prepare("SELECT id, due_date, status, track_part FROM tasks WHERE track_part LIKE ? AND due_date BETWEEN ? AND ? AND archived_at IS NULL").bind(`${track.key}:%`, range[0], range[1]).all<LinkedTask>(),
    ctx.db.prepare("SELECT p.* FROM deliverable_parts p JOIN deliverables d ON d.id = p.deliverable_id WHERE d.track_key = ?").bind(track.key).all<PartRow & { deliverable_id: string }>(),
    ctx.db.prepare("SELECT id, cycle FROM deliverables WHERE track_key = ?").bind(track.key).all<{ id: string; cycle: string }>(),
  ]);
  const byCycle = new Map(dels.map((d) => [d.cycle, d.id]));
  return { ...track, cycles: cycles.map((c) => { const id = byCycle.get(c); return buildCycle(track, c, id ? parts.filter((p) => p.deliverable_id === id) : null, tasks, today); }).reverse() };
}

/** Progress of every track the caller can see (newest cycle first). Nothing is written. */
export async function getProgress(ctx: Ctx, raw: unknown): Promise<Result<{ today: string; tracks: TrackView[] }>> {
  try {
    const i = v.obj(raw ?? {}, "input");
    const today = await resolveToday(ctx, i, v);
    const key = v.text(i.track, "track", { max: 40, optional: true });
    const tracks = await loadTracks(ctx, key);
    return ok({ today, tracks: await Promise.all(tracks.map((t) => viewTrack(ctx, t, today))) });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}

async function materialize(ctx: Ctx, track: Track, cycle: string): Promise<string> {
  const existing = await ctx.db.prepare("SELECT id FROM deliverables WHERE track_key = ? AND cycle = ?").bind(track.key, cycle).first<{ id: string }>();
  if (existing) return existing.id;
  const id = `dlv_${crypto.randomUUID()}`; const at = ctx.now().toISOString(); const due = lastDayOfCycle(cycle);
  const cv = buildCycle(track, cycle, null, [], due);
  const stmts = [ctx.db.prepare("INSERT INTO deliverables (id,track_key,cycle,title,due_date,created_at) VALUES (?,?,?,?,?,?)").bind(id, track.key, cycle, `${track.title}, ${cycleLabel(cycle)}`, due, at)];
  cv.parts.forEach((p, n) => stmts.push(ctx.db.prepare("INSERT INTO deliverable_parts (id,deliverable_id,kind,part_key,label,due_date,sort_order) VALUES (?,?,?,?,?,?,?)").bind(`prt_${crypto.randomUUID()}`, id, p.kind, p.key, p.label, p.dueDate, n)));
  stmts.push(auditStmt(ctx, "deliverable.create", "deliverable", id));
  await write(ctx.db, stmts);
  return id;
}

async function togglePart(ctx: Ctx, raw: unknown, done: boolean): Promise<Result<CycleView>> {
  try {
    const i = v.obj(raw, "input");
    const trackKey = v.text(i.track, "track", { max: 40 })!, cycle = v.text(i.cycle, "cycle", { max: 7 })!, partKey = v.text(i.part, "part", { max: 40 })!;
    if (!/^\d{4}-\d{2}$/.test(cycle)) throw new v.InvalidInput("cycle must be YYYY-MM");
    const today = await resolveToday(ctx, i, v);
    const track = (await loadTracks(ctx, trackKey))[0];
    if (!track) return fail("not_found", "No such progress track");
    const cv = (await viewTrack(ctx, track, today)).cycles.find((c) => c.cycle === cycle);
    const part = cv?.parts.find((p) => p.key === partKey);
    if (!cv || !part) return fail("not_found", "No such reporting period or step in that cycle");
    if (part.done === done) return ok(cv, { duplicate: true });
    if (done) {
      // The final steps follow the periods: verification needs every period done, submission needs verification too.
      const blockers = cv.parts.filter((p) => p.kind === "period" || (part.key === "submit" && p.key !== "submit" && p.kind === "step")).filter((p) => p.key !== part.key && !p.done);
      if (part.kind === "step" && blockers.length) return fail("invalid_input", `Finish the earlier parts first: ${blockers.map((b) => b.label).join(", ")}`);
    }
    // A linked recurring task is the source of truth: completing the period completes the task (and schedules the next one).
    if (part.taskId) {
      const r = done ? await completeTask(ctx, { id: part.taskId, today }) : await reopenTask(ctx, { id: part.taskId });
      if (!r.ok) return r as Result<never>;
    } else if (!done && part.viaTask) {
      return fail("invalid_input", "This part was completed through its task; reopen the task instead");
    } else {
      const id = await materialize(ctx, track, cycle);
      const at = ctx.now().toISOString();
      await write(ctx.db, [
        ctx.db.prepare("UPDATE deliverable_parts SET done_at = ?, done_by = ? WHERE deliverable_id = ? AND part_key = ?").bind(done ? at : null, done ? ctx.actor.label : null, id, partKey),
        auditStmt(ctx, done ? "part.complete" : "part.reopen", "deliverable", id),
      ]);
    }
    const fresh = (await viewTrack(ctx, track, today)).cycles.find((c) => c.cycle === cycle)!;
    return ok(fresh);
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
}
export const completePart = (ctx: Ctx, raw: unknown) => togglePart(ctx, raw, true);
export const reopenPart = (ctx: Ctx, raw: unknown) => togglePart(ctx, raw, false);
