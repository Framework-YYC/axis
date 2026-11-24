import { addDays } from "../../shared/rotation";
import { HORIZONS, horizonOf, type Horizon } from "../../shared/horizons";
import { MODULE_IDS, MODULES_META, type ModuleId } from "../../shared/modules";
import { canAccessModule } from "./access";
import { write } from "./db";
import { listEvents } from "./events";
import { listGoals } from "./goals";
import { listHabits } from "./habits";
import { prefsOf, resolveToday } from "./prefs";
import { listTasks, type Task } from "./tasks";
import { fail, ok, SCOPES, type Actor, type Ctx, type Result } from "./types";
import * as v from "./validate";

export type BriefingModule = "overview" | ModuleId;
const slim = (t: Task) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate, dueTime: t.dueTime, goalId: t.goalId, recurring: !!t.recurrence });

/** Internal actor for scheduled work. It never leaves the service layer. */
export const systemActor = (): Actor => ({ type: "user", id: "system", label: "Axis", scopes: new Set<string>(SCOPES), channel: "rest" });

export async function moduleActivity(ctx: Ctx, module: string, limit = 30) {
  const { results } = await ctx.db.prepare(
    `SELECT a.at, a.actor_label AS actor, a.channel, a.via, a.action, a.entity, a.entity_id AS entityId, a.outcome
     FROM audit_log a
     LEFT JOIN tasks t ON a.entity = 'task' AND a.entity_id = t.id
     LEFT JOIN goals g ON a.entity = 'goal' AND a.entity_id = g.id
     LEFT JOIN habits h ON a.entity = 'habit' AND a.entity_id = h.id
     LEFT JOIN events e ON a.entity = 'event' AND a.entity_id = e.id
     WHERE COALESCE(t.module, g.module, h.module, e.module) = ?
     ORDER BY a.id DESC LIMIT ?`,
  ).bind(module, limit).all();
  return results;
}

async function moduleDetail(sys: Ctx, module: ModuleId, today: string) {
  const prefs = await prefsOf(sys);
  const open = await listTasks(sys, { module, status: ["pending", "in_progress", "waiting"], limit: 500, today }, { today });
  const tasks = open.ok ? open.data.tasks : [];
  const by = (h: Horizon) => tasks.filter((t) => horizonOf(t.dueDate, today, prefs.weekStart) === h);
  const counts = Object.fromEntries(HORIZONS.map((h) => [h, by(h).length])) as Record<Horizon, number>;
  const done = await listTasks(sys, { module, since: addDays(today, -6), limit: 500, today }, { today, completedOnly: true });
  const goals = await listGoals(sys, { module, status: ["active", "paused"], today });
  const habits = await listHabits(sys, { module, today });
  const events = await listEvents(sys, { module, from: today, to: addDays(today, 7), today });
  return {
    counts: { ...counts, open: tasks.length, completedLast7: done.ok ? done.data.count : 0 },
    tasks: { overdue: by("overdue").slice(0, 15).map(slim), today: by("today").slice(0, 15).map(slim), tomorrow: by("tomorrow").slice(0, 15).map(slim), this_week: by("this_week").slice(0, 15).map(slim), in_progress: tasks.filter((t) => t.status === "in_progress").slice(0, 10).map(slim) },
    events: events.ok ? events.data.events.slice(0, 15).map((e) => ({ id: e.id, title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, location: e.location })) : [],
    goals: goals.ok ? goals.data.goals.map((g) => ({ id: g.id, title: g.title, progress: g.progress, status: g.status, term: g.term, targetDate: g.targetDate, unit: g.unit, current: g.currentValue, target: g.targetValue })) : [],
    habits: habits.ok ? habits.data.habits.map((h) => ({ id: h.id, title: h.title, applies: h.today.applies, done: h.today.done, value: h.today.value, target: h.today.target, streak: h.streak.current, best: h.streak.best })) : [],
    allTasks: tasks,
  };
}

/** Everything one assistant needs for a briefing. The module's own data only. */
export async function buildModuleBriefing(sys: Ctx, module: ModuleId, today: string) {
  const prefs = await prefsOf(sys);
  const d = await moduleDetail(sys, module, today);
  const { allTasks, ...rest } = d;
  void allTasks;
  const pend = await sys.db.prepare("SELECT COUNT(*) AS n FROM pending_approvals WHERE status = 'pending' AND requested_by_id = ?").bind(`asst_${module}`).first<{ n: number }>();
  const bad = await sys.db.prepare("SELECT COUNT(*) AS n FROM assistant_inbox WHERE assistant = ? AND status IN ('rejected','error')").bind(module).first<{ n: number }>();
  const activity = await moduleActivity(sys, module, 10);
  return {
    module, label: MODULES_META[module].label, today, asOf: sys.now().toISOString(), timezone: prefs.timezone, weekStart: prefs.weekStart === 0 ? "sunday" : "monday",
    ...rest,
    attention: { overdue: d.counts.overdue, awaitingApproval: pend?.n ?? 0, inboxProblems: bad?.n ?? 0 },
    activity,
  };
}

/**
 * The cross-module overview for the Daily assistant and the owner. Detail only for Daily's own module; every other module is reduced
 * to counts and its next due date, so aggregating responsibilities does not expose sensitive titles or amounts.
 */
export async function buildOverview(sys: Ctx, today: string) {
  const prefs = await prefsOf(sys);
  const modules: Record<string, unknown> = {};
  for (const m of MODULE_IDS) {
    const d = await moduleDetail(sys, m, today);
    const next = d.allTasks.filter((t) => t.dueDate && t.dueDate >= today).map((t) => t.dueDate!).sort()[0] ?? null;
    const applicable = d.habits.filter((h) => h.applies);
    modules[m] = {
      label: MODULES_META[m].label, counts: d.counts, nextDueDate: next, activeGoals: d.goals.length,
      goalsAverageProgress: d.goals.length ? Math.round(d.goals.reduce((a, g) => a + g.progress, 0) / d.goals.length) : null,
      habitsDoneToday: applicable.filter((h) => h.done).length, habitsDueToday: applicable.length, eventsNext7Days: d.events.length,
    };
  }
  const daily = await buildModuleBriefing(sys, "daily", today);
  const approvals = await sys.db.prepare("SELECT COUNT(*) AS n FROM pending_approvals WHERE status = 'pending'").first<{ n: number }>();
  return { module: "overview", today, asOf: sys.now().toISOString(), timezone: prefs.timezone, weekStart: prefs.weekStart === 0 ? "sunday" : "monday", modules, daily, attention: { pendingApprovals: approvals?.n ?? 0 }, note: "Only the daily module is detailed here. Other modules are counts only." };
}

export async function buildBriefing(sys: Ctx, module: BriefingModule, today?: string) {
  const t = today ?? (await resolveToday(sys, {}, v));
  return module === "overview" ? buildOverview(sys, t) : buildModuleBriefing(sys, module, t);
}

/** Recompute and store briefings so an assistant that can only run SQL reads the same briefing the app shows. */
export async function refreshBriefings(db: D1Database, now = new Date(), modules: BriefingModule[] = ["overview", ...MODULE_IDS]): Promise<void> {
  const sys: Ctx = { db, actor: systemActor(), requestId: "system-briefing", now: () => now };
  const today = await resolveToday(sys, {}, v);
  for (const m of modules) {
    const content = JSON.stringify(await buildBriefing(sys, m, today));
    await write(db, [db.prepare("INSERT INTO briefings (module, today, as_of, content, generated_at) VALUES (?,?,?,?,?) ON CONFLICT(module) DO UPDATE SET today = excluded.today, as_of = excluded.as_of, content = excluded.content, generated_at = excluded.generated_at").bind(m, today, now.toISOString(), content, now.toISOString())]);
  }
}

export async function getBriefing(ctx: Ctx, raw: unknown): Promise<Result<unknown>> {
  try {
    const i = v.obj(raw ?? {}, "input");
    const module = (i.module ?? ctx.actor.assistant ?? "overview") as string;
    if (module !== "overview" && !(MODULE_IDS as readonly string[]).includes(module)) return fail("invalid_input", `module must be overview or one of: ${MODULE_IDS.join(", ")}`);
    if (module === "overview" ? !!ctx.actor.modules && !(ctx.actor.assistant === "daily") : !canAccessModule(ctx.actor, module)) return fail("forbidden", `This connection cannot read the ${module} briefing`);
    const sys: Ctx = { ...ctx, actor: systemActor() };
    const today = await resolveToday(ctx, i, v);
    return ok(await buildBriefing(sys, module as BriefingModule, today));
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    throw e;
  }
}
