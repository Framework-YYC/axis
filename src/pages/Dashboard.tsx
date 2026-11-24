import { ArrowUpRight, Bell, CalendarDays, ChevronDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ACTIVITY_PERIODS, activityBars, localDay, type ActivityPeriod } from "../../shared/gauges";
import { MODULE_IDS, MODULES_META } from "../../shared/modules";
import { addDays } from "../../shared/rotation";
import { focusStats, weekBars } from "../../shared/overview";
import { AccountMenuButton } from "../components/AccountMenu";
import { HabitTile } from "../components/compact";
import { TaskEditor } from "../components/editors";
import { ModuleIcon } from "../components/mobile";
import { TaskLine } from "../components/TaskLine";
import { DotMatrixBars, FanGauge, Kpi, RadialGauge, SplitBar, TickRing } from "../components/viz";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import { byUrgency, isOpen } from "../lib/taskUi";
import type { Task } from "../lib/types";

/** One widget surface. `tone` picks the instrument colour; pastel cards keep dark text in both themes. */
const TONE = {
  charcoal: { bg: "var(--w-charcoal)", fg: "var(--ink)", ring: "0 0 0 1px var(--line)" },
  blue: { bg: "var(--w-blue)", fg: "var(--w-on-blue)", ring: "none" },
  butter: { bg: "var(--w-butter)", fg: "var(--w-butter-on)", ring: "none" },
} as const;
function Card({ tone, to, headTo, label, className, children, aria }: { tone: keyof typeof TONE; to?: string; headTo?: string; label?: string; className?: string; children: ReactNode; aria?: string }) {
  const t = TONE[tone];
  const cls = cx("relative flex min-w-0 flex-col rounded-[20px] p-3.5", className);
  const style = { background: t.bg, color: t.fg, boxShadow: t.ring };
  const head = label ? <p className="self-start text-[15px] font-normal leading-tight tracking-tight opacity-80">{label}</p> : null;
  if (to) return (
    <Link to={to} aria-label={aria} className={cx(cls, "hit press")} style={style}>
      {head}
      <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden className="absolute right-3.5 top-3.5 opacity-60" />
      {children}
    </Link>
  );
  return (
    <section aria-label={aria ?? label} className={cls} style={style}>
      {head}
      {headTo && <Link to={headTo} aria-label={`Open ${label}`} className="hit press absolute right-1 top-1 grid place-items-center opacity-60 hover:opacity-100"><ArrowUpRight size={15} strokeWidth={1.5} aria-hidden /></Link>}
      {children}
    </section>
  );
}
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Home: five instrument widgets and nothing else. Detail lives on the dedicated screens. */
export default function Overview() {
  const { tasks, goals, habits, events, approvals, inbox, today, weekStart, source, error, loading, completeTask, reopenTask } = useData();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [period, setPeriod] = useState<ActivityPeriod>("this_week");

  const open = tasks.filter(isOpen);
  const f = focusStats(tasks, today);
  const dueToday = f.remaining - f.overdue;
  const totalToday = f.completed + f.remaining;
  const week = weekBars(tasks, today, 7);
  const weekTotal = week.reduce((a, b) => a + b.count, 0);
  const bars = activityBars(tasks, period, today, weekStart);
  const done = bars.reduce((a, b) => a + b.count, 0);
  const activeGoals = goals.filter((g) => g.status === "active");
  const avg = activeGoals.length ? Math.round(activeGoals.reduce((a, g) => a + g.progress, 0) / activeGoals.length) : null;
  const attention = approvals.length + inbox.filter((r) => r.status === "rejected" || r.status === "error").length;
  const range = `${pretty(bars[0].date, { day: "numeric", month: "short" })} – ${pretty(bars[6].date, { day: "numeric", month: "short" })}`;
  const empty = !loading && open.length + done + goals.length === 0;
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  // Expanded widgets (iPad and desktop)
  const actionable = open.filter((t) => t.dueDate && t.dueDate <= today).sort(byUrgency);
  const priorities = (actionable.length ? actionable : open.filter((t) => t.dueDate).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || byUrgency(a, b))).slice(0, 6);
  const dueHabits = habits.filter((h) => h.status === "active" && h.today.applies);
  const habitsDone = dueHabits.filter((h) => h.today.done).length;
  const habitPct = dueHabits.length ? Math.round((habitsDone / dueHabits.length) * 100) : null;
  const modules = MODULE_IDS.map((m) => {
    const mine = open.filter((t) => t.module === m);
    const completedToday = tasks.filter((t) => t.module === m && t.status === "completed" && t.completedAt && localDay(t.completedAt) === today).length;
    const overdueN = mine.filter((t) => t.dueDate && t.dueDate < today).length;
    const dueN = mine.filter((t) => t.dueDate === today).length;
    return { m, open: mine.length, completedToday, dueN, overdueN, goals: goals.filter((g) => g.module === m && g.status === "active").length };
  });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const upcoming = events.filter((e) => e.status === "scheduled" && e.date >= today && e.date <= addDays(today, 7)).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")).slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <header className="px-1 pt-0.5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-muted">{pretty(today, { weekday: "long", month: "long", day: "numeric" })}</p>
          <div className="-mr-3 flex items-center">
            <Link to="/calendar" aria-label="Calendar" className="hit grid place-items-center text-muted hover:text-[var(--ink)]"><CalendarDays size={18} strokeWidth={1.4} aria-hidden /></Link>
            <AccountMenuButton />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[30px] font-[350] leading-none tracking-[-0.025em] md:text-[36px]">Overview</h1>
          <div className="flex items-center gap-2">
            <Link to="/settings#approvals" aria-label={attention ? `${attention} items need your attention` : "Notifications"} className="hit relative grid place-items-center rounded-full" style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--ink) 55%, transparent)" }}>
              <Bell size={17} strokeWidth={1.4} aria-hidden />
              {attention > 0 && <span className="absolute right-3 top-3 size-1.5 rounded-full" style={{ background: "var(--w-terra)" }} />}
            </Link>
            <button onClick={() => setAdding(true)} aria-label="New task" className="hit grid place-items-center rounded-full bg-[var(--pill-bg)] text-[var(--pill-ink)]"><Plus size={19} strokeWidth={1.5} aria-hidden /></button>
          </div>
        </div>
      </header>

      {source !== "live" && error && <p role="alert" className="mt-3 rounded-2xl p-3.5 text-[13px]" style={{ boxShadow: "0 0 0 1px var(--line)" }}>{error}</p>}

      <div className="@container mt-3.5"><div className="stagger grid grid-cols-2 gap-2 @[640px]:grid-cols-12 @[640px]:gap-3">
        <Card tone="charcoal" to="/tasks?h=today" label="Daily completion" aria={`Daily completion: ${f.completed} of ${totalToday} tasks, ${f.pct} percent. Open today's tasks`} className="min-h-[232px] items-center @[640px]:order-1 @[640px]:col-span-4 @[1000px]:col-span-3">
          <RadialGauge pct={f.pct} size={122} className="mt-3.5" label={totalToday === 0 ? "No tasks due today" : `${f.pct} percent of today's tasks complete`} />
          <div className="mt-auto text-center">
            <p className="num text-[28px] font-light leading-none tracking-tight">{totalToday === 0 ? "—" : <>{f.pct}<span className="text-[0.62em]">%</span></>}</p>
            <p className="mt-1.5 text-[14px] opacity-70">{totalToday === 0 ? "No tasks today" : `${f.completed} of ${totalToday} completed`}</p>
          </div>
        </Card>

        <Card tone="blue" to="/tasks?h=this_week" label="Weekly workload" aria={`Weekly workload: ${weekTotal} tasks due in the next 7 days`} className="min-h-[232px] items-center @[640px]:order-2 @[640px]:col-span-4 @[1000px]:col-span-3">
          <FanGauge values={week.map((d) => d.count)} size={156} className="mt-6" label={`Open tasks due each of the next 7 days, today first: ${week.map((d) => d.count).join(", ")}. Segment depth is relative to the busiest day.`}>
            <p className="num text-[28px] font-light leading-none tracking-tight">{weekTotal}</p>
          </FanGauge>
          <p className="mt-1.5 text-[12.5px] opacity-75">Upcoming tasks</p>
          <p className="mt-auto pt-3 text-[15px] opacity-85">Next seven days</p>
        </Card>

        <Card tone="butter" label="Task activity" aria={`Task activity, ${range}: ${done} tasks completed`} className="col-span-2 min-h-[160px] @[640px]:order-4 @[640px]:col-span-8 @[1000px]:order-5 @[1000px]:col-span-6">
          <p className="mt-1 text-[11.5px] opacity-65">Tasks completed per day · {range}</p>
          <div className="absolute right-3 top-2.5">
            <label className="relative inline-flex h-9 items-center rounded-full pl-3.5 pr-8 text-[13px]" style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--w-butter-on) 45%, transparent)" }}>
              <span className="sr-only">Reporting period</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as ActivityPeriod)} className="hit absolute inset-0 w-full cursor-pointer appearance-none rounded-full bg-transparent pl-3.5 pr-8 text-[13px] text-transparent outline-none">
                {ACTIVITY_PERIODS.map((p) => <option key={p.id} value={p.id} className="text-black">{p.label}</option>)}
              </select>
              <span aria-hidden>{ACTIVITY_PERIODS.find((p) => p.id === period)?.label}</span>
              <ChevronDown size={14} strokeWidth={1.4} aria-hidden className="pointer-events-none absolute right-2.5" />
            </label>
          </div>
          {[false, true].map((tall) => <DotMatrixBars key={String(tall)} tall={tall} bars={bars} className={cx("mx-auto mt-2.5 max-w-[470px]", tall ? "@max-[999px]:hidden @[1000px]:max-w-[560px]" : "@[1000px]:hidden")} label={`Tasks completed per day, ${range}: ${bars.map((b) => `${b.label} ${b.count}`).join(", ")}. ${done} in total.`} />)}
        </Card>

        <Card tone="charcoal" to="/tasks" label="Tasks" aria={`Tasks: ${dueToday} remaining today, ${f.overdue} overdue. Open all tasks`} className="min-h-[160px] @[640px]:order-3 @[640px]:col-span-4 @[1000px]:col-span-3">
          <Kpi className="mt-3.5" size={28} value={dueToday} caption="Remaining today" />
          <SplitBar className="mt-3" parts={[{ value: f.completed, color: "var(--g-sage)" }, { value: dueToday, color: "color-mix(in srgb, var(--ink) 20%, transparent)" }, { value: f.overdue, color: "var(--w-terra)" }]} label={totalToday === 0 ? "No tasks due today" : `Today: ${f.completed} done, ${dueToday} remaining, ${f.overdue} overdue`} />
          <div className="mt-auto flex items-baseline justify-between pt-3">
            <span className="text-[14px] text-muted">Overdue</span>
            <span className="num text-[16px]" style={{ color: f.overdue > 0 ? "var(--w-terra)" : "var(--faint)" }}>{pad2(f.overdue)}</span>
          </div>
        </Card>

        <Card tone="charcoal" to="/goals" label="Goals" aria={`Goals: ${activeGoals.length} active${avg !== null ? `, average progress ${avg} percent` : ""}. Open goals`} className="min-h-[160px] @[640px]:order-5 @[640px]:col-span-4 @[1000px]:order-4 @[1000px]:col-span-3">
          <div className="mt-3 flex items-start justify-between gap-2">
            <Kpi size={28} value={activeGoals.length} caption="Active goals" />
            <TickRing pct={avg} size={54} label={avg === null ? "No goals yet" : `Average goal progress ${avg} percent`} />
          </div>
          <hr className="mt-auto border-0 border-t" style={{ borderColor: "var(--line)" }} />
          <p className="pt-2.5 text-[14px] text-muted">{activeGoals.length === 0 ? "No goals yet" : "View all objectives"}</p>
        </Card>

        <Card tone="charcoal" headTo="/tasks?h=today" label="Today's priorities" aria={`Today's priorities: ${actionable.length} due today or overdue`} className="@max-[639px]:hidden @[640px]:order-6 @[640px]:col-span-7 @[1000px]:col-span-6">
          <div className="mt-2">
            {priorities.length === 0 ? <p className="py-6 text-[13.5px] text-muted">Nothing is due. A clear day.</p> : (
              <ul className="@[1000px]:[&>li:nth-child(n+6)]:hidden">{priorities.map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={setEditing} compact />)}</ul>
            )}
          </div>
        </Card>

        <Card tone="charcoal" headTo="/goals#habits" label="Daily habits" aria={`Daily habits: ${habitsDone} of ${dueHabits.length} done today`} className="@max-[639px]:hidden @[640px]:order-7 @[640px]:col-span-5 @[1000px]:col-span-4">
          <div className="mt-3 flex items-start justify-between gap-2">
            <Kpi size={28} value={<>{habitsDone}<span className="text-[0.6em] text-muted">/{dueHabits.length}</span></>} caption="done today" />
            <TickRing pct={habitPct} size={50} label={habitPct === null ? "No habits due today" : `${habitPct} percent of today's habits done`} />
          </div>
          <div className="mt-2">
            {dueHabits.length === 0 ? <p className="py-3 text-[13.5px] text-muted">No habits due today.</p> : <ul className="@container">{dueHabits.slice(0, 5).map((h) => <HabitTile key={h.id} h={h} onOpen={() => navigate("/goals#habits")} />)}</ul>}
          </div>
        </Card>

        <Card tone="charcoal" label="Modules" aria="Module overview" className="@max-[639px]:hidden @[640px]:order-8 @[640px]:col-span-7 @[1000px]:col-span-4">
          <ul className="mt-2">
            {modules.map((r) => (
              <li key={r.m} className="border-t border-line first:border-t-0">
                <Link to={`/m/${r.m}`} aria-label={`${MODULES_META[r.m].label}: ${r.open} open, ${r.dueN} due today, ${r.overdueN} overdue`} className="hit press flex items-center gap-3 py-2">
                  <ModuleIcon id={r.m} size={28} />
                  <span className="w-[74px] shrink-0 text-[14px]">{MODULES_META[r.m].label}</span>
                  <SplitBar className="min-w-0 flex-1" height={6} parts={[{ value: r.completedToday, color: "var(--g-sage)" }, { value: r.dueN, color: "color-mix(in srgb, var(--ink) 20%, transparent)" }, { value: r.overdueN, color: "var(--w-terra)" }]} label={`${MODULES_META[r.m].label} today: ${r.completedToday} done, ${r.dueN} due, ${r.overdueN} overdue`} />
                  <span className="num w-[58px] shrink-0 text-right text-[12.5px] text-muted">{r.open} open</span>
                  <span className="num w-5 shrink-0 text-right text-[12.5px]" style={{ color: r.overdueN > 0 ? "var(--w-terra)" : "var(--faint)" }}>{r.overdueN > 0 ? pad2(r.overdueN) : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card tone="charcoal" to="/calendar" label="Upcoming schedule" aria={`Upcoming schedule: ${upcoming.length} events in the next seven days. Open the calendar`} className="@max-[639px]:hidden @[640px]:order-9 @[640px]:col-span-5 @[1000px]:col-span-4">
          <div className="mt-3 grid grid-cols-7 gap-1" aria-label="Next seven days">
            {weekDays.map((d) => {
              const ev = events.filter((e) => e.status === "scheduled" && e.date === d).length, tk = open.filter((t) => t.dueDate === d).length;
              return (
                <div key={d} className="flex flex-col items-center gap-1 rounded-xl py-1.5" style={d === today ? { boxShadow: "0 0 0 1px var(--ink)" } : undefined} aria-label={`${pretty(d, { weekday: "long", day: "numeric", month: "long" })}: ${ev} events, ${tk} tasks`}>
                  <span className="mono !text-[9px]">{pretty(d, { weekday: "short" }).slice(0, 3)}</span>
                  <span className="num text-[15px] font-light leading-none">{Number(d.slice(8))}</span>
                  <span className="flex h-1.5 gap-0.5" aria-hidden>{ev > 0 && <i className="size-1.5 rounded-full" style={{ background: "var(--g-sage)" }} />}{tk > 0 && <i className="size-1.5 rounded-[2px] border border-current opacity-60" />}</span>
                </div>
              );
            })}
          </div>
          <ul className="mt-3">
            {upcoming.length === 0 ? <li className="py-3 text-[13.5px] text-muted">No events in the next seven days.</li> : upcoming.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                <ModuleIcon id={e.module} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{e.title}</span>
                <span className="num shrink-0 text-[12px] text-muted">{e.date === today ? "Today" : pretty(e.date, { weekday: "short" })}{e.startTime ? ` ${e.startTime}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div></div>

      {empty && <p className="mt-4 px-1 text-[13px] text-muted">Nothing here yet. Add a task, or let your assistants file their first items; the widgets fill in as records arrive.</p>}
      {adding && <TaskEditor onClose={() => setAdding(false)} />}
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
