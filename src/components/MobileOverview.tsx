import { AlertTriangle, Bell, CalendarDays, Check, ChevronRight, Plus, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { MODULE_IDS } from "../../shared/modules";
import { barHeights, focusStats, weekBars } from "../../shared/overview";
import { addDays } from "../../shared/rotation";
import { useData } from "../lib/data";
import { SHORT } from "../lib/moduleStyle";
import { pretty } from "../lib/dates";
import { byUrgency, isOpen } from "../lib/taskUi";
import type { Task } from "../lib/types";
import { ModuleIcon, Ring } from "./mobile";
import { TaskLine } from "./TaskLine";

const SectionHead = ({ title, to, count }: { title: string; to?: string; count?: number }) => (
  <div className="mb-1 flex items-center justify-between px-1">
    <h2 className="text-[15px] font-medium tracking-tight">{title}{count !== undefined && <span className="mono ml-2 !normal-case">{count}</span>}</h2>
    {to && <Link to={to} className="hit -mr-2 inline-flex items-center gap-0.5 px-2 text-[12.5px] text-muted">View all<ChevronRight size={14} aria-hidden /></Link>}
  </div>
);

/** The phone Overview: one glanceable page. Previews are capped; empty sections are left out. Every figure comes from live data. */
export function MobileOverview({ onOpenTask, onAddTask }: { onOpenTask: (t: Task) => void; onAddTask: () => void }) {
  const { tasks, goals, habits, events, approvals, inbox, today, completeTask, reopenTask, loading } = useData();
  const open = tasks.filter(isOpen);
  const f = focusStats(tasks, today);
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  const actionable = open.filter((t) => t.dueDate && t.dueDate <= today).sort(byUrgency);
  const comingUp = open.filter((t) => t.dueDate && t.dueDate > today).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || byUrgency(a, b));
  const preview = (actionable.length ? actionable : comingUp).slice(0, 4);
  const bars = weekBars(tasks, today, 7);
  const heights = barHeights(bars.map((b) => b.count));
  const weekTotal = bars.reduce((a, b) => a + b.count, 0);
  const dueHabits = habits.filter((h) => h.status === "active" && h.today.applies);
  const habitsDone = dueHabits.filter((h) => h.today.done).length;
  const activeGoals = goals.filter((g) => g.status === "active");
  const avg = activeGoals.length ? Math.round(activeGoals.reduce((a, g) => a + g.progress, 0) / activeGoals.length) : 0;
  const nextGoal = [...activeGoals].filter((g) => g.targetDate).sort((a, b) => (a.targetDate ?? "").localeCompare(b.targetDate ?? ""))[0];
  const upcomingEvents = events.filter((e) => e.status === "scheduled" && e.date >= today && e.date <= addDays(today, 7)).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")).slice(0, 3);
  const problems = inbox.filter((r) => r.status === "rejected" || r.status === "error").length;
  const attention = approvals.length + problems;
  const empty = !loading && tasks.length + goals.length + habits.length + events.length === 0;
  const dueByModule = (m: string) => open.filter((t) => t.module === m && t.dueDate && t.dueDate <= today).length;

  return (
    <div className="space-y-3.5 pb-2">
      <header className="flex items-start justify-between gap-3 px-1 pt-1">
        <div>
          <p className="mono !normal-case !tracking-[0.02em]">{pretty(today, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="display mt-1 text-[38px]">Overview</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/settings#approvals" aria-label={attention ? `${attention} items need your attention` : "Notifications"} className="hit relative grid place-items-center rounded-full bg-[var(--card-dim)]">
            <Bell size={17} aria-hidden />
            {attention > 0 && <span className="absolute right-3 top-3 size-2 rounded-full bg-red" />}
          </Link>
          <button onClick={onAddTask} aria-label="New task" className="hit grid place-items-center rounded-full bg-lime text-lime-ink"><Plus size={20} aria-hidden /></button>
        </div>
      </header>

      {empty && (
        <div className="flat p-5 text-[13.5px]">
          <p className="font-medium">Nothing here yet.</p>
          <p className="mt-1 text-muted">Add a task, or let your assistants file their first items. They will appear here.</p>
        </div>
      )}

      <Link to="/tasks?h=today" className="flat flex items-center gap-5 p-4" aria-label="Today's focus: open tasks due today">
        <Ring value={f.pct} size={112} stroke={10} label={`${f.pct} percent of today's work complete`}>
          <div><p className="num text-[32px] font-light leading-none">{f.pct}<span className="text-[15px]">%</span></p><p className="mono mt-1 !text-[9px]">done</p></div>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-medium tracking-tight">Today's focus</p>
          <dl className="mt-2.5 space-y-1.5 text-[13.5px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Remaining</dt><dd className="num font-medium">{f.remaining}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Completed</dt><dd className="num font-medium text-[var(--lime-deep)]">{f.completed}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Overdue</dt><dd className={`num font-medium ${f.overdue ? "text-red" : ""}`}>{f.overdue}</dd></div>
          </dl>
        </div>
      </Link>

      <nav aria-label="Assistant modules" className="grid grid-cols-5 gap-2">
        {MODULE_IDS.map((m) => {
          const n = dueByModule(m);
          return (
            <Link key={m} to={`/m/${m}`} className="hit flex flex-col items-center gap-1.5 rounded-[18px] py-2" aria-label={`${SHORT[m]}, ${n} due`}>
              <span className="relative">
                <ModuleIcon id={m} size={52} />
                {n > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--pill-bg)] px-1 text-[10.5px] font-semibold text-[var(--pill-ink)] num">{n}</span>}
              </span>
              <span className="text-[11.5px] text-muted">{SHORT[m]}</span>
            </Link>
          );
        })}
      </nav>

      {preview.length > 0 && (
        <section aria-label={actionable.length ? "Up next" : "Coming up"}>
          <SectionHead title={actionable.length ? "Up next" : "Coming up"} to={actionable.length ? "/tasks?h=today" : "/tasks?h=all"} count={actionable.length || comingUp.length} />
          <ul className="flat px-2 py-1.5 pl-3">{preview.map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={onOpenTask} />)}</ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/tasks?h=this_week" className="flat flex flex-col p-4" aria-label={`${weekTotal} tasks due in the next 7 days`}>
          <CalendarDays size={18} className="text-muted" aria-hidden />
          <p className="num mt-2 text-[34px] font-extralight leading-none">{String(weekTotal).padStart(2, "0")}</p>
          <p className="mt-1 text-[12.5px] text-muted">Upcoming tasks</p>
          <div className="mt-3 flex h-10 items-end gap-1" aria-hidden>
            {bars.map((b, i) => <i key={b.date} className="block flex-1 rounded-full" style={{ height: `${heights[i]}%`, background: i === 0 ? "var(--lime)" : "var(--tick-off)", boxShadow: i === 0 ? "0 0 0 1px var(--ink)" : undefined }} />)}
          </div>
        </Link>
        <Link to="/goals#habits" className="flat flex flex-col p-4" aria-label={`${habitsDone} of ${dueHabits.length} habits done today`}>
          <Check size={18} className="text-muted" aria-hidden />
          <p className="num mt-2 text-[34px] font-extralight leading-none">{habitsDone}<span className="text-[20px] text-muted">/{dueHabits.length}</span></p>
          <p className="mt-1 text-[12.5px] text-muted">Daily habits</p>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
            {dueHabits.slice(0, 8).map((h) => <i key={h.id} className="block size-3.5 rounded-full" style={{ background: h.today.done ? "var(--lime)" : "transparent", boxShadow: h.today.done ? "0 0 0 1px var(--ink)" : "inset 0 0 0 2px var(--tick-off)" }} />)}
            {dueHabits.length === 0 && <span className="text-[12px] text-faint">None due today</span>}
          </div>
        </Link>
      </div>

      {activeGoals.length > 0 && (
        <Link to="/goals" className="flat flex items-center gap-4 p-4" aria-label={`${activeGoals.length} active goals, average ${avg} percent`}>
          <Ring value={avg} size={56} stroke={6} label={`Average goal progress ${avg} percent`}><Target size={16} aria-hidden /></Ring>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Goals <span className="text-muted">· {activeGoals.length} active</span></p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{nextGoal ? `Next target: ${nextGoal.title} · ${pretty(nextGoal.targetDate!, { day: "numeric", month: "short" })}` : `Average progress ${avg}%`}</p>
          </div>
          <ChevronRight size={18} className="text-faint" aria-hidden />
        </Link>
      )}

      {upcomingEvents.length > 0 && (
        <section aria-label="Schedule">
          <SectionHead title="Schedule" to="/calendar" />
          <ul className="flat divide-y divide-[var(--line)] px-4">
            {upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <ModuleIcon id={e.module} size={28} />
                <span className="min-w-0 flex-1 truncate text-[14px]">{e.title}</span>
                <span className="num shrink-0 text-[12px] text-muted">{e.date === today ? "Today" : pretty(e.date, { weekday: "short" })} {e.startTime ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attention > 0 && (
        <Link to="/settings#approvals" className="flat flex items-center gap-3 p-3.5 text-[13.5px]">
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          <span className="flex-1">{approvals.length > 0 ? `${approvals.length} awaiting your approval` : `${problems} assistant request${problems > 1 ? "s" : ""} failed`}</span>
          <ChevronRight size={16} className="text-faint" aria-hidden />
        </Link>
      )}
    </div>
  );
}
