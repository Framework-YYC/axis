import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MODULE_IDS, MODULES_META } from "../../shared/modules";
import { addDays } from "../../shared/rotation";
import { horizonOf } from "../../shared/horizons";
import { EventEditor, GoalEditor, HabitEditor, TaskEditor } from "../components/editors";
import { MobileOverview } from "../components/MobileOverview";
import { ASSISTANT_ICONS } from "../lib/moduleStyle";
import { EventRow, GoalCard, HabitRow } from "../components/records";
import { TaskLine } from "../components/TaskLine";
import { Btn, Empty, PageHeader, Status, Widget } from "../components/ui";
import { SegBar } from "../components/charts";
import { fillTicks } from "../../shared/viz";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import { byUrgency, isOpen } from "../lib/taskUi";
import type { CalEvent, Goal, Habit, Task } from "../lib/types";

type Editing = { kind: "task"; task?: Task } | { kind: "goal"; goal?: Goal } | { kind: "habit"; habit?: Habit } | { kind: "event"; event?: CalEvent } | null;

export default function Overview() {
  const { tasks, goals, habits, events, approvals, inbox, activity, today, weekStart, source, loading, error, completeTask, reopenTask } = useData();
  const [edit, setEdit] = useState<Editing>(null);
  const open = tasks.filter(isOpen);
  const at = (h: string) => open.filter((t) => horizonOf(t.dueDate, today, weekStart) === h).sort(byUrgency);
  const overdue = at("overdue"), dueToday = at("today"), tomorrow = at("tomorrow");
  const thisWeek = open.filter((t) => { const h = horizonOf(t.dueDate, today, weekStart); return h === "this_week" || h === "tomorrow"; }).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || byUrgency(a, b));
  const doneToday = tasks.filter((t) => t.status === "completed" && t.completedAt?.slice(0, 10) === today).length;
  const todaysEvents = events.filter((e) => e.date === today && e.status === "scheduled");
  const nextEvents = events.filter((e) => e.date > today && e.date <= addDays(today, 7) && e.status === "scheduled").slice(0, 6);
  const activeGoals = goals.filter((g) => g.status === "active");
  const dueHabits = habits.filter((h) => h.status === "active" && h.today.applies);
  const habitsDone = dueHabits.filter((h) => h.today.done).length;
  const inboxProblems = inbox.filter((r) => r.status === "rejected" || r.status === "error").length;
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  const openTask = (t: Task) => setEdit({ kind: "task", task: t });
  const empty = !loading && tasks.length + goals.length + habits.length + events.length === 0;

  return (
    <>
    <div className="md:hidden"><MobileOverview onOpenTask={openTask} onAddTask={() => setEdit({ kind: "task" })} /></div>
    <div className="hidden md:block">
      <PageHeader crumb="OVERVIEW" title="Overview" subtitle={`${pretty(today, { weekday: "long", day: "numeric", month: "long" })} · all five modules`} />
      {source !== "live" && <p role="alert" className="panel-dim mb-4 p-3.5 text-[13px]">{error}</p>}
      {error && source === "live" && <p role="alert" className="panel-dim mb-4 p-3.5 text-[13px] text-red">{error}</p>}
      {empty && (
        <div className="panel-dim mb-4 p-5 text-[13.5px]">
          <p className="font-medium">Nothing here yet.</p>
          <p className="mt-1 text-muted">Axis holds no records. Add a task, or load the clearly labelled synthetic demonstration set from <Link className="underline" to="/settings#data">Settings</Link> to see every screen populated.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Due today", dueToday.length, "/tasks?h=today"], ["Overdue", overdue.length, "/tasks?h=overdue"], ["Next 7 days", thisWeek.length, "/tasks?h=this_week"], ["Done today", doneToday, "/tasks?h=done"]].map(([l, n, to]) => (
          <Link key={l as string} to={to as string} className="panel p-4 md:p-5">
            <p className="mono">{l}</p>
            <p className={`num mt-1 text-[44px] font-extralight leading-none tracking-tight ${l === "Overdue" && (n as number) > 0 ? "text-red" : ""}`}>{n}</p>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Widget id="priorities" title="Today's priorities" count={dueToday.length + overdue.length} action={<Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "task" })}>Task</Btn>}>
            {overdue.length + dueToday.length === 0 ? <Empty>Nothing due today.</Empty> : (
              <ul>
                {[...overdue, ...dueToday].slice(0, 12).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={openTask} />)}
              </ul>
            )}
            {tomorrow.length > 0 && <p className="mono mt-3 !normal-case">Tomorrow: {tomorrow.length} task{tomorrow.length === 1 ? "" : "s"}, starting with "{tomorrow[0].title}"</p>}
          </Widget>
          <Widget id="schedule" title="Schedule" tag="Today and next 7 days" action={<Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "event" })}>Event</Btn>}>
            {todaysEvents.length + nextEvents.length === 0 ? <Empty>No events in the next week.</Empty> : (
              <>
                {todaysEvents.length > 0 && <ul className="mb-2">{todaysEvents.map((e) => <EventRow key={e.id} e={e} onOpen={(x) => setEdit({ kind: "event", event: x })} />)}</ul>}
                {nextEvents.length > 0 && <ul>{nextEvents.map((e) => <li key={e.id} className="flex items-center gap-3 border-t border-line py-2.5 text-[13.5px] first:border-t-0"><span className="mono w-[74px] shrink-0">{pretty(e.date, { weekday: "short", day: "numeric" })}</span><button className="min-w-0 flex-1 truncate text-left" onClick={() => setEdit({ kind: "event", event: e })}>{e.title}</button><span className="mono">{e.startTime ?? "All day"}</span></li>)}</ul>}
              </>
            )}
          </Widget>
          <Widget title="Due this week" count={thisWeek.length}>
            {thisWeek.length === 0 ? <Empty>Nothing else due this week.</Empty> : <ul>{thisWeek.slice(0, 8).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={openTask} />)}</ul>}
          </Widget>
        </div>

        <div className="space-y-3">
          <Widget title="Needs attention" count={approvals.length + overdue.length + inboxProblems}>
            <ul className="space-y-2 text-[13.5px]">
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><AlertTriangle size={14} aria-hidden />Overdue tasks</span><Status tone={overdue.length ? "bad" : "ok"}>{overdue.length}</Status></li>
              <li className="flex items-center justify-between gap-3"><Link to="/settings#approvals" className="underline-offset-2 hover:underline">Awaiting your approval</Link><Status tone={approvals.length ? "lime" : "ok"}>{approvals.length}</Status></li>
              <li className="flex items-center justify-between gap-3"><Link to="/settings#activity" className="underline-offset-2 hover:underline">Assistant requests that failed</Link><Status tone={inboxProblems ? "warn" : "ok"}>{inboxProblems}</Status></li>
            </ul>
          </Widget>
          <Widget id="goals" title="Active goals" count={activeGoals.length} action={<Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "goal" })}>Goal</Btn>}>
            {activeGoals.length === 0 ? <Empty>No active goals.</Empty> : <ul className="space-y-2.5">{activeGoals.slice(0, 5).map((g) => <GoalCard key={g.id} g={g} onEdit={(x) => setEdit({ kind: "goal", goal: x })} />)}</ul>}
          </Widget>
          <Widget id="habits" title="Today's habits" tag={dueHabits.length ? `${habitsDone} of ${dueHabits.length} done` : undefined} action={<Btn variant="soft" icon={Plus} onClick={() => setEdit({ kind: "habit" })}>Habit</Btn>}>
            {dueHabits.length === 0 ? <Empty>No habits due today.</Empty> : (
              <>
                <SegBar ticks={fillTicks(Math.max(dueHabits.length, 1) * 4, habitsDone * 4, dueHabits.length * 4)} label={`${habitsDone} of ${dueHabits.length} habits done`} height={14} className="mb-3" />
                <ul>{dueHabits.map((h) => <HabitRow key={h.id} h={h} onEdit={(x) => setEdit({ kind: "habit", habit: x })} />)}</ul>
              </>
            )}
          </Widget>
        </div>
      </div>

      <section id="modules" aria-label="Modules" className="mt-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {MODULE_IDS.map((m) => {
            const mt = open.filter((t) => t.module === m);
            const od = mt.filter((t) => horizonOf(t.dueDate, today, weekStart) === "overdue").length;
            const td = mt.filter((t) => t.dueDate === today).length;
            const gs = activeGoals.filter((g) => g.module === m);
            const hs = dueHabits.filter((h) => h.module === m);
            const Icon = ASSISTANT_ICONS[m];
            return (
              <Link key={m} to={`/m/${m}`} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[15px] font-medium"><Icon size={16} aria-hidden />{MODULES_META[m].label}</span><ArrowRight size={14} className="text-faint" aria-hidden /></div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div><dt className="mono">Open</dt><dd className="num text-[22px] font-light">{mt.length}</dd></div>
                  <div><dt className="mono">Today</dt><dd className="num text-[22px] font-light">{td}</dd></div>
                  <div><dt className="mono">Overdue</dt><dd className={`num text-[22px] font-light ${od ? "text-red" : ""}`}>{od}</dd></div>
                </dl>
                <p className="mono !normal-case !tracking-normal">{gs.length ? `${gs.length} goal${gs.length > 1 ? "s" : ""}, avg ${Math.round(gs.reduce((a, g) => a + g.progress, 0) / gs.length)}%` : "No active goals"} · {hs.length ? `${hs.filter((h) => h.today.done).length}/${hs.length} habits` : "no habits today"}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <Widget id="activity" title="Recent assistant activity" className="mt-3">
        {activity.length === 0 ? <Empty>No activity yet.</Empty> : (
          <ul className="grid gap-x-8 md:grid-cols-2">
            {activity.slice(0, 10).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0 md:[&:nth-child(2)]:border-t-0">
                <span className="min-w-0 truncate">{a.action} <span className="text-muted">· {a.actor}</span></span>
                <span className="mono shrink-0">{a.at.slice(5, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Widget>

    </div>
      {edit?.kind === "task" && <TaskEditor task={edit.task} onClose={() => setEdit(null)} />}
      {edit?.kind === "goal" && <GoalEditor goal={edit.goal} onClose={() => setEdit(null)} />}
      {edit?.kind === "habit" && <HabitEditor habit={edit.habit} onClose={() => setEdit(null)} />}
      {edit?.kind === "event" && <EventEditor event={edit.event} onClose={() => setEdit(null)} />}
    </>
  );
}
