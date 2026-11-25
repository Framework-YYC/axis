import { nextOccurrence } from "../../shared/recurrence";
import { addDays } from "../../shared/rotation";
import { sameResponsibility, WORK_RECURRING, WORK_TRACKS } from "../../shared/workRecurring";
import { cycleOf } from "../../shared/progress";
import { auditStmt } from "./audit";
import { write } from "./db";
import { createTrack } from "./progress";
import { prefsOf, resolveToday } from "./prefs";
import { completeTask, createTask, type TaskRow } from "./tasks";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

export interface SetupItem { title: string; outcome: "created" | "would_create" | "exists"; dueDate: string | null; existingTitle?: string; existingType?: string }

/**
 * Introduces the Work module's standing responsibilities. Idempotent and duplicate-safe: a responsibility that already exists in the Work module
 * (same meaningful words, any type, open or completed) is reported and left alone, never recreated. `dryRun` reports what would happen.
 */
export async function setupWorkRecurring(ctx: Ctx, raw: unknown): Promise<Result<{ items: SetupItem[]; created: number; existing: number; tracks: Array<{ key: string; linked: number }> }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Owner only");
  const i = v.obj(raw ?? {}, "input");
  const today = await resolveToday(ctx, i, v);
  const dryRun = v.bool(i.dryRun, "dryRun") === true;
  const rotation = (await prefsOf(ctx)).rotation;
  const { results } = await ctx.db.prepare("SELECT id, title, recurrence, status FROM tasks WHERE module = 'progressive' AND archived_at IS NULL").all<Pick<TaskRow, "id" | "title" | "recurrence" | "status">>();
  const items: SetupItem[] = [];
  for (const def of WORK_RECURRING) {
    const twin = results.find((r) => sameResponsibility(r.title, def.title));
    if (twin) { items.push({ title: def.title, outcome: "exists", dueDate: null, existingTitle: twin.title, existingType: twin.recurrence ? "recurring" : "task" }); continue; }
    const yesterday = addDays(today, -1);
    // Monthly rules step from the month before, so this month's date counts if it is still ahead.
    const anchor = def.rule.freq === "monthly" ? addDays(`${today.slice(0, 8)}01`, -1) : yesterday;
    const first = def.lastDone ?? nextOccurrence(def.rule, anchor, yesterday, rotation);
    if (!first) continue;
    if (dryRun) { items.push({ title: def.title, outcome: "would_create", dueDate: def.lastDone ? nextOccurrence(def.rule, def.lastDone, today, rotation) : first }); continue; }
    const made = await createTask(ctx, { title: def.title, module: "progressive", priority: def.priority, dueDate: first, recurrence: def.rule, description: def.note, externalId: `setup:work-recurring:${def.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` });
    if (!made.ok) return made as Result<never>;
    let due = made.data.dueDate;
    if (def.lastDone) { // completed already: record it, and the service schedules the next occurrence from it
      const done = await completeTask(ctx, { id: made.data.id, today });
      if (!done.ok) return done as Result<never>;
      due = (done.data as { next?: { dueDate: string } | null }).next?.dueDate ?? null;
    }
    items.push({ title: def.title, outcome: "created", dueDate: due });
  }
  // Progress tracks: the REEF and RIPET weekly tasks complete reporting periods, the monthly tasks are the submissions (idempotent; existing series are linked, nothing is recreated).
  const tracks: Array<{ key: string; linked: number }> = [];
  if (!dryRun) {
    for (const t of WORK_TRACKS) {
      const made = await createTrack(ctx, { key: t.key, title: t.title, stream: t.stream, module: "progressive", periodRule: { freq: "weekly", interval: 1, byWeekday: [0] }, startCycle: cycleOf(today), today });
      if (!made.ok) return made as Result<never>;
      let linked = 0;
      const { results: series } = await ctx.db.prepare("SELECT id, title, recurrence_parent_id, track_part FROM tasks WHERE module = 'progressive' AND recurrence IS NOT NULL AND archived_at IS NULL").all<{ id: string; title: string; recurrence_parent_id: string | null; track_part: string | null }>();
      for (const [title, part] of [[t.periodTitle, "period"], [t.submitTitle, "submit"]] as const) {
        const roots = [...new Set(series.filter((r) => !r.track_part && sameResponsibility(r.title, title)).map((r) => r.recurrence_parent_id ?? r.id))];
        for (const root of roots) {
          await write(ctx.db, [ctx.db.prepare("UPDATE tasks SET track_part = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE (id = ? OR recurrence_parent_id = ?) AND track_part IS NULL").bind(`${t.key}:${part}`, ctx.now().toISOString(), ctx.actor.label, root, root), auditStmt(ctx, "task.update", "task", root)]);
          linked++;
        }
      }
      tracks.push({ key: t.key, linked });
    }
  }
  return ok({ items, created: items.filter((x) => x.outcome === "created").length, existing: items.filter((x) => x.outcome === "exists").length, tracks });
}
