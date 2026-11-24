import { Plus } from "lucide-react";
import { useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { HORIZONS, HORIZON_LABELS, horizonOf } from "../../shared/horizons";
import { isModule, MODULES_META, type ModuleId } from "../../shared/modules";
import { addDays } from "../../shared/rotation";
import { fillTicks } from "../../shared/viz";
import { EventEditor, GoalEditor, HabitEditor, TaskEditor } from "../components/editors";
import { SegBar, Spark } from "../components/charts";
import { MODULE_TABS } from "../components/nav";
import { GoalList, HabitList } from "../components/compact";
import { TaskGroups } from "../components/TaskGroups";
import { TaskLine } from "../components/TaskLine";
import { Btn, Empty, PageHeader, StatLine, Status, Tabs, Widget } from "../components/ui";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import { byUrgency, isOpen } from "../lib/taskUi";
import { useApi } from "../lib/useApi";
import type { ActivityRow, CalEvent, Goal, Habit, Task } from "../lib/types";

type Editing = { kind: "task"; task?: Task } | { kind: "goal"; goal?: Goal } | { kind: "habit"; habit?: Habit } | { kind: "event"; event?: CalEvent } | null;
type Briefing = { asOf: string; counts: Record<string, number>; tasks: Record<string, Array<{ id: string; title: string; priority: string; dueDate: string | null; dueTime: string | null }>>; events: Array<{ title: string; date: string; startTime: string | null }>; goals: Array<{ title: string; progress: number }>; habits: Array<{ title: string; applies: boolean; done: boolean; value: number; target: number; streak: number }>; attention: Record<string, number> };

export default function ModulePage() {
  const { module: raw } = useParams();
  if (!isModule(raw)) return <Navigate to="/" replace />;
  return <Module id={raw} />;
}

function Module({ id }: { id: ModuleId }) {
  const [sp, setSp] = useSearchParams();
  const tab = MODULE_TABS.some(([t]) => t === sp.get("tab")) ? sp.get("tab")! : "overview";
  const { tasks, goals, habits, events, today, weekStart, completeTask, reopenTask, inbox } = useData();
  const [edit, setEdit] = useState<Editing>(null);
  const meta = MODULES_META[id];
  const mt = tasks.filter((t) => t.module === id);
  const open = mt.filter(isOpen);
  const done = mt.filter((t) => t.status === "completed");
  const mg = goals.filter((g) => g.module === id && g.status !== "abandoned");
  const mh = habits.filter((h) => h.module === id && h.status !== "archived");
  const me = events.filter((e) => e.module === id && e.status === "scheduled" && e.date >= today).slice(0, 8);
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  const openTask = (t: Task) => setEdit({ kind: "task", task: t });
  const hz = Object.fromEntries(HORIZONS.map((h) => [h, open.filter((t) => horizonOf(t.dueDate, today, weekStart) === h).length])) as Record<(typeof HORIZONS)[number], number>;
  const activity = useApi<{ activity?: ActivityRow[]; events?: ActivityRow[] } | ActivityRow[]>(tab === "activity" ? `/modules/${id}/activity?limit=50` : null, tasks.length + goals.length);
  const briefing = useApi<Briefing>(tab === "briefing" ? `/briefing/${id}?today=${today}` : null, tasks.length + goals.length + habits.length);
  const rows: ActivityRow[] = Array.isArray(activity.data) ? activity.data : activity.data?.activity ?? activity.data?.events ?? [];
  const mine = inbox.filter((r) => r.assistant === id);
  const addButton = (
    <div className="flex gap-2">
      <Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "task" })}>Task</Btn>
      <Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "goal" })} className="max-sm:hidden">Goal</Btn>
      <Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "habit" })} className="max-sm:hidden">Habit</Btn>
    </div>
  );

  return (
    <div>
      <PageHeader crumb={meta.label.toUpperCase()} title={meta.label} subtitle={meta.blurb} controls={addButton} />
      <div className="mb-4 hidden xl:block"><Tabs label={`${meta.label} sections`} value={tab} onChange={(t) => { const n = new URLSearchParams(sp); n.set("tab", t); setSp(n, { replace: true }); }} options={MODULE_TABS.map(([v, l]) => ({ value: v, label: l, count: v === "tasks" ? open.length : v === "goals" ? mg.length : v === "habits" ? mh.length : undefined }))} /></div>

      {tab === "overview" && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[["Open", open.length], ["Due today", hz.today], ["Overdue", hz.overdue]].map(([l, n]) => (
                <div key={l as string} className="panel p-4"><p className="mono">{l}</p><p className={`num mt-1 text-[36px] font-extralight leading-none ${l === "Overdue" && (n as number) > 0 ? "text-red" : ""}`}>{n}</p></div>
              ))}
            </div>
            <Widget title="Next tasks" count={open.length}>
              {open.length === 0 ? <Empty>No open tasks in this module.</Empty> : <ul>{[...open].sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || byUrgency(a, b)).slice(0, 8).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={openTask} showModule={false} />)}</ul>}
            </Widget>
            <Widget title="Upcoming events">{me.length ? <ul>{me.map((e) => <li key={e.id} className="flex items-center gap-3 border-t border-line py-2.5 text-[13.5px] first:border-t-0"><span className="mono w-[74px] shrink-0">{pretty(e.date, { weekday: "short", day: "numeric" })}</span><button className="hit min-w-0 flex-1 truncate text-left" onClick={() => setEdit({ kind: "event", event: e })}>{e.title}</button><span className="mono">{e.startTime ?? "All day"}</span></li>)}</ul> : <Empty>No upcoming events.</Empty>}</Widget>
          </div>
          <div className="space-y-3">
            <Widget title="Goals" count={mg.filter((g) => g.status === "active").length}>{mg.length ? <GoalList goals={mg.slice(0, 4)} grouped={false} onEdit={(x) => setEdit({ kind: "goal", goal: x })} /> : <Empty>No goals yet.</Empty>}</Widget>
            <Widget title="Habits today">{mh.length ? <HabitList habits={mh.slice(0, 5)} onEdit={(x) => setEdit({ kind: "habit", habit: x })} /> : <Empty>No habits yet.</Empty>}</Widget>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <Widget bare title="Tasks" count={open.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ kind: "task" })}>New task</Btn>}>
          <TaskGroups tasks={[...open].sort(byUrgency)} today={today} weekStart={weekStart} onToggle={toggle} onOpen={openTask} showModule={false} />
          {done.length > 0 && <details className="mt-5"><summary className="mono cursor-pointer">Completed ({done.length})</summary><ul className="mt-2">{done.slice(0, 15).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={openTask} showModule={false} />)}</ul></details>}
        </Widget>
      )}

      {tab === "goals" && (
        <Widget bare title="Goals" count={mg.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ kind: "goal" })}>New goal</Btn>}>
          {mg.length === 0 ? <Empty>No goals in this module.</Empty> : <GoalList goals={mg} grouped={false} onEdit={(x) => setEdit({ kind: "goal", goal: x })} />}
        </Widget>
      )}

      {tab === "habits" && (
        <Widget bare title="Habits" count={mh.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ kind: "habit" })}>New habit</Btn>}>
          {mh.length === 0 ? <Empty>No habits in this module.</Empty> : <HabitList habits={mh} onEdit={(x) => setEdit({ kind: "habit", habit: x })} />}
        </Widget>
      )}

      {tab === "briefing" && (
        <Widget title="Briefing" tag={briefing.data ? `as of ${briefing.data.asOf.slice(11, 16)} UTC` : undefined}>
          <p className="mono mb-3 !normal-case !tracking-normal">Computed by Axis from this module's live records. The {meta.label} assistant reads the same briefing, so completing a task anywhere updates it everywhere.</p>
          {briefing.loading ? <Empty>Loading…</Empty> : !briefing.data ? <Empty>{briefing.error ?? "No briefing."}</Empty> : (
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                {(["overdue", "today", "tomorrow", "this_week", "in_progress"] as const).map((k) => (
                  <div key={k} className="mb-3"><p className="mono mb-1">{k === "in_progress" ? "In progress" : k === "this_week" ? "This week" : k[0].toUpperCase() + k.slice(1)} · {briefing.data!.tasks[k]?.length ?? 0}</p>
                    <ul className="text-[13.5px]">{(briefing.data!.tasks[k] ?? []).map((t) => <li key={t.id} className="flex justify-between gap-3 border-t border-line py-1.5 first:border-t-0"><span className="truncate">{t.title}</span><span className="mono shrink-0">{t.dueDate ? pretty(t.dueDate, { day: "numeric", month: "short" }) : ""}{t.dueTime ? ` ${t.dueTime}` : ""}</span></li>)}</ul></div>
                ))}
              </div>
              <div className="space-y-4 text-[13.5px]">
                <div><p className="mono mb-1">Goals</p>{briefing.data.goals.map((g, i) => <StatLine key={i} label={g.title} value={`${Math.round(g.progress)}%`} />)}{briefing.data.goals.length === 0 && <p className="text-muted">None</p>}</div>
                <div><p className="mono mb-1">Habits today</p>{briefing.data.habits.filter((h) => h.applies).map((h, i) => <StatLine key={i} label={h.title} value={h.done ? "Done" : `${h.value}/${h.target}`} />)}{briefing.data.habits.filter((h) => h.applies).length === 0 && <p className="text-muted">None due</p>}</div>
                <div><p className="mono mb-1">Needs attention</p><StatLine label="Overdue" value={briefing.data.attention.overdue ?? 0} tone={briefing.data.attention.overdue ? "bad" : undefined} /><StatLine label="Awaiting approval" value={briefing.data.attention.awaitingApproval ?? 0} /><StatLine label="Failed assistant requests" value={briefing.data.attention.inboxProblems ?? 0} /></div>
              </div>
            </div>
          )}
        </Widget>
      )}

      {tab === "activity" && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Widget title="Activity history" tag="Audited changes">
            {activity.loading ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No activity yet.</Empty> : <ul>{rows.map((a, i) => <li key={i} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0"><span className="min-w-0 truncate">{a.action} <span className="text-muted">· {a.actor}{a.via ? ` via ${a.via}` : ""}</span></span><span className="mono shrink-0">{a.at.slice(5, 16).replace("T", " ")}</span></li>)}</ul>}
          </Widget>
          <Widget title="Assistant requests" tag="Via the inbox">
            {mine.length === 0 ? <Empty>No requests from the {meta.label} assistant yet.</Empty> : <ul>{mine.slice(0, 15).map((r) => <li key={r.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0"><span className="min-w-0 truncate">{r.op}{r.result?.message ? <span className="text-muted"> · {r.result.message}</span> : null}</span><Status tone={r.status === "applied" ? "ok" : r.status === "duplicate" ? "idle" : r.status === "approval_required" ? "lime" : "bad"}>{r.status.replace("_", " ")}</Status></li>)}</ul>}
          </Widget>
        </div>
      )}

      {tab === "metrics" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Widget title="Completed per day" tag="Last 14 days">
            {(() => { const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)); const vals = days.map((d) => done.filter((t) => t.completedAt?.slice(0, 10) === d).length); return <><Spark values={vals} label="Tasks completed per day" /><p className="mono mt-2 !normal-case">{vals.reduce((a, b) => a + b, 0)} completed in 14 days</p></>; })()}
          </Widget>
          <Widget title="Open by horizon">
            <ul>{HORIZONS.filter((h) => hz[h] > 0).map((h) => <StatLine key={h} label={HORIZON_LABELS[h]} value={hz[h]} tone={h === "overdue" ? "bad" : undefined} />)}</ul>
            {open.length === 0 && <Empty>No open tasks.</Empty>}
          </Widget>
          <Widget title="Goal progress">
            {mg.length === 0 ? <Empty>No goals.</Empty> : mg.map((g) => <div key={g.id} className="mb-3 last:mb-0"><div className="mb-1 flex justify-between text-[13px]"><span className="truncate">{g.title}</span><span className="num">{Math.round(g.progress)}%</span></div><SegBar ticks={fillTicks(30, g.progress, 100)} label={`${g.title} ${Math.round(g.progress)}%`} height={12} /></div>)}
          </Widget>
          <Widget title="Habit streaks">
            {mh.length === 0 ? <Empty>No habits.</Empty> : mh.map((h) => <StatLine key={h.id} label={h.title} value={`${h.streak.current} now · ${h.streak.best} best`} />)}
          </Widget>
        </div>
      )}

      {edit?.kind === "task" && <TaskEditor task={edit.task} defaults={{ module: id }} onClose={() => setEdit(null)} />}
      {edit?.kind === "goal" && <GoalEditor goal={edit.goal} defaultModule={id} onClose={() => setEdit(null)} />}
      {edit?.kind === "habit" && <HabitEditor habit={edit.habit} defaultModule={id} onClose={() => setEdit(null)} />}
      {edit?.kind === "event" && <EventEditor event={edit.event} defaultModule={id} onClose={() => setEdit(null)} />}
    </div>
  );
}
