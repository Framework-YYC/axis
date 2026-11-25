import { Plus } from "lucide-react";
import { useState } from "react";
import { activityBars } from "../../shared/gauges";
import { focusStats } from "../../shared/overview";
import { averageProgress, eventsByDate, habitDays, inPersonal } from "../../shared/personal";
import { addDays } from "../../shared/rotation";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import { byUrgency, isOpen } from "../lib/taskUi";
import type { CalEvent, Goal, Habit, Task } from "../lib/types";
import { EventEditor, GoalEditor, HabitEditor, TaskEditor } from "./editors";
import { GoalList, HabitList } from "./compact";
import { Card } from "./InstrumentCard";
import { ModuleIcon } from "./mobile";
import { EventRow } from "./records";
import { TaskLine } from "./TaskLine";
import { Btn, Empty, Widget } from "./ui";
import { CapsuleBars, DotMatrixBars, Kpi, RadialGauge, SegmentedProgress, SplitBar, TickRing } from "./viz";

/** Everything Personal reads, filtered once: Daily and Health records side by side, each still carrying its own module. */
export function usePersonal() {
  const d = useData();
  const tasks = d.tasks.filter((t) => inPersonal(t.module));
  const goals = d.goals.filter((g) => inPersonal(g.module) && g.status !== "abandoned");
  const habits = d.habits.filter((h) => inPersonal(h.module) && h.status !== "archived");
  const events = d.events.filter((e) => inPersonal(e.module));
  return { ...d, tasks, goals, habits, events, health: { goals: goals.filter((g) => g.module === "health"), habits: habits.filter((h) => h.module === "health"), tasks: tasks.filter((t) => t.module === "health"), events: events.filter((e) => e.module === "health") } };
}

type Editing = { task?: Task } | { goal?: Goal } | { habit?: Habit } | { event?: CalEvent } | null;
const Editors = ({ edit, close }: { edit: Editing; close: () => void }) => (
  <>
    {edit && "task" in edit && <TaskEditor task={edit.task} defaults={{ module: "daily" }} onClose={close} />}
    {edit && "goal" in edit && <GoalEditor goal={edit.goal} defaultModule="daily" onClose={close} />}
    {edit && "habit" in edit && <HabitEditor habit={edit.habit} defaultModule="daily" onClose={close} />}
    {edit && "event" in edit && <EventEditor event={edit.event} defaultModule="daily" onClose={close} />}
  </>
);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Personal Overview: instrument cards in the same style as Finance and Work, all drawn from Daily and Health records. */
export function PersonalOverview() {
  const { tasks, goals, habits, events, today, weekStart, completeTask, reopenTask, health } = usePersonal();
  const [edit, setEdit] = useState<Editing>(null);
  const open = tasks.filter(isOpen);
  const f = focusStats(tasks, today);
  const dueToday = f.remaining - f.overdue;
  const totalToday = f.completed + f.remaining;
  const bars = activityBars(tasks, "this_week", today, weekStart);
  const done = bars.reduce((a, b) => a + b.count, 0);
  const due = habits.filter((h) => h.status === "active" && h.today.applies);
  const habitsDone = due.filter((h) => h.today.done).length;
  const habitPct = due.length ? Math.round((habitsDone / due.length) * 100) : null;
  const days = habitDays(habits, 7);
  const hGoalAvg = averageProgress(health.goals);
  const goalAvg = averageProgress(goals);
  const actionable = open.filter((t) => t.dueDate && t.dueDate <= today).sort(byUrgency);
  const priorities = (actionable.length ? actionable : open.filter((t) => t.dueDate).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || byUrgency(a, b))).slice(0, 5);
  const week = eventsByDate(events, today, addDays(today, 7));
  const nextEvents = week.flatMap((g) => g.items.map((e) => e)).slice(0, 4);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  const range = `${pretty(bars[0].date, { day: "numeric", month: "short" })} – ${pretty(bars[6].date, { day: "numeric", month: "short" })}`;
  const none = tasks.length + goals.length + habits.length + events.length === 0;
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-12 @[640px]:gap-3">
        <Card tone="charcoal" to="/m/personal?tab=tasks" label="Today" aria={`Today: ${f.completed} of ${totalToday} personal tasks done. Open tasks`} className="min-h-[220px] items-center @[640px]:col-span-4 @[1000px]:col-span-3">
          <RadialGauge pct={f.pct} size={118} className="mt-3.5" label={totalToday === 0 ? "No personal tasks due today" : `${f.pct} percent of today's personal tasks complete`} />
          <div className="mt-auto text-center">
            <p className="num text-[28px] font-light leading-none tracking-tight">{totalToday === 0 ? "—" : <>{f.pct}<span className="text-[0.62em]">%</span></>}</p>
            <p className="mt-1.5 text-[14px] opacity-70">{totalToday === 0 ? "Nothing due today" : `${f.completed} of ${totalToday} done`}</p>
          </div>
        </Card>

        <Card tone="sage" to="/m/personal?tab=habits" label="Habits" aria={`Habits: ${habitsDone} of ${due.length} done today. Open habits`} className="min-h-[220px] @[640px]:col-span-4 @[1000px]:col-span-3">
          <div className="mt-3 flex items-start justify-between gap-2">
            <Kpi size={30} value={<>{habitsDone}<span className="text-[0.6em] opacity-60">/{due.length}</span></>} caption="done today" />
            <TickRing pct={habitPct} size={56} ink="var(--w-on)" accent="var(--w-on)" label={habitPct === null ? "No habits due today" : `${habitPct} percent of today's habits done`} />
          </div>
          <CapsuleBars className="mt-auto pt-3" height={56} ink="var(--w-on)" values={days.map((x) => x.done)} label={days.length ? `Habits done per day, last ${days.length} days: ${days.map((x) => `${x.done} of ${x.due}`).join(", ")}` : "No habit history yet"} />
          <p className="pt-2 text-[12.5px] opacity-70">{days.length ? `Last ${days.length} days` : "History appears as habits are logged"}</p>
        </Card>

        <Card tone="blue" to="/m/personal?tab=health" label="Health" aria={`Health: ${health.goals.length} goals${hGoalAvg !== null ? `, average progress ${hGoalAvg} percent` : ""}. Open health`} className="col-span-2 min-h-[190px] @[640px]:col-span-4 @[1000px]:col-span-3">
          <div className="mt-3 flex items-start justify-between gap-2">
            <Kpi size={30} value={health.goals.filter((g) => g.status === "active").length} caption="Active health goals" />
            <TickRing pct={hGoalAvg} size={56} ink="var(--w-blue-ink)" accent="var(--w-blue-ink)" label={hGoalAvg === null ? "No health goals yet" : `Average health goal progress ${hGoalAvg} percent`} />
          </div>
          <p className="mt-auto pt-3 text-[14px] opacity-80">{health.habits.length} health habit{health.habits.length === 1 ? "" : "s"} · {health.tasks.filter(isOpen).length} open task{health.tasks.filter(isOpen).length === 1 ? "" : "s"}</p>
        </Card>

        <Card tone="charcoal" to="/m/personal?tab=tasks" label="Tasks" aria={`Tasks: ${dueToday} remaining today, ${f.overdue} overdue. Open tasks`} className="col-span-2 min-h-[190px] @[640px]:col-span-4 @[1000px]:col-span-3">
          <Kpi className="mt-3.5" size={30} value={dueToday} caption="Remaining today" />
          <SplitBar className="mt-3" parts={[{ value: f.completed, color: "var(--g-sage)" }, { value: dueToday, color: "color-mix(in srgb, var(--ink) 20%, transparent)" }, { value: f.overdue, color: "var(--w-terra)" }]} label={totalToday === 0 ? "No personal tasks due today" : `Today: ${f.completed} done, ${dueToday} remaining, ${f.overdue} overdue`} />
          <div className="mt-auto flex items-baseline justify-between pt-3"><span className="text-[14px] text-muted">Overdue</span><span className="num text-[16px]" style={{ color: f.overdue > 0 ? "var(--w-terra)" : "var(--faint)" }}>{pad2(f.overdue)}</span></div>
        </Card>

        <Card tone="butter" label="Task activity" aria={`Personal task activity, ${range}: ${done} completed`} className="col-span-2 min-h-[160px] @[640px]:col-span-8 @[1000px]:col-span-5">
          <p className="mt-1 text-[11.5px] opacity-65">Tasks completed per day · {range}</p>
          <DotMatrixBars bars={bars} className="mx-auto mt-2.5 max-w-[470px]" label={`Personal tasks completed per day, ${range}: ${bars.map((b) => `${b.label} ${b.count}`).join(", ")}. ${done} in total.`} />
        </Card>

        <Card tone="charcoal" headTo="/m/personal?tab=appointments" label="Appointments" aria={`Appointments: ${nextEvents.length} in the next seven days`} className="col-span-2 @[640px]:col-span-5 @[1000px]:col-span-7">
          <div className="mt-3 grid grid-cols-7 gap-1" aria-label="Next seven days">
            {weekDays.map((d) => {
              const ev = events.filter((e) => e.status === "scheduled" && e.date === d).length;
              return (
                <div key={d} className="flex flex-col items-center gap-1 rounded-xl py-1.5" style={d === today ? { boxShadow: "0 0 0 1px var(--ink)" } : undefined} aria-label={`${pretty(d, { weekday: "long", day: "numeric", month: "long" })}: ${ev} appointments`}>
                  <span className="mono !text-[9px]">{pretty(d, { weekday: "short" }).slice(0, 3)}</span>
                  <span className="num text-[15px] font-light leading-none">{Number(d.slice(8))}</span>
                  <span className="flex h-1.5" aria-hidden>{ev > 0 && <i className="size-1.5 rounded-full" style={{ background: "var(--g-sage)" }} />}</span>
                </div>
              );
            })}
          </div>
          <ul className="mt-3">
            {nextEvents.length === 0 ? <li className="py-3 text-[13.5px] text-muted">No appointments in the next seven days.</li> : nextEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                <ModuleIcon id={e.module} size={24} />
                <button onClick={() => setEdit({ event: e })} className="hit min-w-0 flex-1 truncate text-left text-[13.5px]">{e.title}</button>
                <span className="num shrink-0 text-[12px] text-muted">{e.date === today ? "Today" : pretty(e.date, { weekday: "short" })}{e.startTime ? ` ${e.startTime}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card tone="charcoal" headTo="/m/personal?tab=tasks" label="Next up" aria={`Next up: ${actionable.length} due today or overdue`} className="col-span-2 @[640px]:col-span-7 @[1000px]:col-span-7">
          <div className="mt-2">{priorities.length === 0 ? <p className="py-6 text-[13.5px] text-muted">Nothing is due. A clear day.</p> : <ul>{priorities.map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={(x) => setEdit({ task: x })} compact />)}</ul>}</div>
        </Card>

        <Card tone="charcoal" headTo="/m/personal?tab=goals" label="Goals" aria={`Goals: ${goals.filter((g) => g.status === "active").length} active${goalAvg !== null ? `, average ${goalAvg} percent` : ""}`} className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-5">
          <ul className="mt-3 space-y-3">
            {goals.filter((g) => g.status === "active").slice(0, 4).map((g) => (
              <li key={g.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[13px]"><span className="flex min-w-0 items-center gap-2"><ModuleIcon id={g.module} size={18} /><span className="truncate">{g.title}</span></span><span className="num shrink-0">{Math.round(g.progress)}%</span></div>
                <SegmentedProgress value={g.progress} total={100} height={10} segments={20} label={`${g.title}: ${Math.round(g.progress)} percent`} />
              </li>
            ))}
            {goals.filter((g) => g.status === "active").length === 0 && <li className="py-3 text-[13.5px] text-muted">No active goals yet.</li>}
          </ul>
        </Card>
      </div>
      {none && <p className="mt-4 px-1 text-[13px] text-muted">Nothing here yet. Use Quick Add in the Orbis menu, or let the Daily and Health assistants file their first items.</p>}
      <Editors edit={edit} close={() => setEdit(null)} />
    </div>
  );
}

/** Health: goals with their measurements, habit consistency and health appointments. Only what is recorded is shown; there is no separate metrics store. */
export function HealthView() {
  const { today, health, habits } = usePersonal();
  const [edit, setEdit] = useState<Editing>(null);
  const days = habitDays(health.habits, 14);
  const due = health.habits.filter((h) => h.status === "active" && h.today.applies);
  const doneN = due.filter((h) => h.today.done).length;
  const best = health.habits.reduce((m, h) => Math.max(m, h.streak.current), 0);
  const numeric = health.goals.filter((g) => g.kind === "numeric" && g.status === "active");
  const upcoming = health.events.filter((e) => e.status === "scheduled" && e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")).slice(0, 5);
  void habits;
  return (
    <div className="@container space-y-3">
      <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-12 @[640px]:gap-3">
        <Card tone="sage" label="Consistency" aria={`Health habit consistency: ${doneN} of ${due.length} done today, best current streak ${best} days`} className="col-span-2 min-h-[170px] @[640px]:col-span-5">
          <div className="mt-3 flex items-start justify-between gap-2">
            <Kpi size={30} value={<>{doneN}<span className="text-[0.6em] opacity-60">/{due.length}</span></>} caption="health habits done today" />
            <Kpi size={30} value={best} caption="best streak (days)" />
          </div>
          <CapsuleBars className="mt-auto pt-3" height={52} ink="var(--w-on)" values={days.map((x) => x.done)} label={days.length ? `Health habits done per day, last ${days.length} days: ${days.map((x) => `${x.done} of ${x.due}`).join(", ")}` : "No health habit history yet"} />
        </Card>
        <Card tone="blue" label="Measurements" aria={`Health goals with measurements: ${numeric.length}`} className="col-span-2 min-h-[170px] @[640px]:col-span-7">
          {numeric.length === 0 ? <p className="mt-3 text-[13.5px] opacity-75">No measured goals yet. Weight, body composition or fitness targets filed as numeric goals appear here with their progress.</p> : (
            <ul className="mt-3 space-y-3">
              {numeric.slice(0, 4).map((g) => (
                <li key={g.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate">{g.title}</span><span className="num shrink-0">{g.currentValue ?? "—"}{g.unit ? ` ${g.unit}` : ""}<span className="opacity-60"> → {g.targetValue ?? "—"}{g.unit ? ` ${g.unit}` : ""}</span></span></div>
                  <SegmentedProgress value={g.progress} total={100} height={10} segments={20} color="var(--w-blue-ink)" track="color-mix(in srgb, var(--w-blue-ink) 18%, transparent)" label={`${g.title}: ${Math.round(g.progress)} percent`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-3 @[960px]:grid-cols-2">
        <Widget bare title="Health goals" count={health.goals.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ goal: undefined })}>New goal</Btn>}>
          {health.goals.length === 0 ? <Empty>No health goals yet.</Empty> : <GoalList goals={health.goals} grouped={false} onEdit={(g) => setEdit({ goal: g })} />}
        </Widget>
        <div className="space-y-3">
          <Widget bare title="Health habits" count={health.habits.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ habit: undefined })}>New habit</Btn>}>
            {health.habits.length === 0 ? <Empty>No health habits yet.</Empty> : <HabitList habits={health.habits} onEdit={(h) => setEdit({ habit: h })} />}
          </Widget>
          <Widget title="Health appointments" count={upcoming.length}>
            {upcoming.length === 0 ? <Empty>No upcoming health appointments.</Empty> : <ul>{upcoming.map((e) => <EventRow key={e.id} e={e} showModule={false} onOpen={(x) => setEdit({ event: x })} />)}</ul>}
          </Widget>
        </div>
      </div>
      <Editors edit={edit && "goal" in edit ? { goal: edit.goal } : edit} close={() => setEdit(null)} />
    </div>
  );
}

/** Appointments: upcoming events from Daily and Health, grouped by day. */
export function AppointmentsView() {
  const { events, today } = usePersonal();
  const [edit, setEdit] = useState<Editing>(null);
  const groups = eventsByDate(events, today, addDays(today, 90));
  return (
    <>
      <Widget bare title="Appointments" count={groups.reduce((n, g) => n + g.items.length, 0)} tag="Next 90 days" action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ event: undefined })}>New appointment</Btn>}>
        {groups.length === 0 ? <Empty>No upcoming appointments.</Empty> : groups.map((g) => (
          <section key={g.date} className="mb-3 last:mb-0">
            <p className="mono mb-1 px-1">{g.date === today ? "Today" : pretty(g.date, { weekday: "long", day: "numeric", month: "long" })}</p>
            <ul className="flat px-3.5 py-1">{g.items.map((e: CalEvent) => <EventRow key={e.id} e={e} onOpen={(x) => setEdit({ event: x })} />)}</ul>
          </section>
        ))}
      </Widget>
      <Editors edit={edit} close={() => setEdit(null)} />
    </>
  );
}
