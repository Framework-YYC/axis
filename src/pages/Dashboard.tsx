import { ArrowUpRight, Bell, CalendarDays, ChevronDown, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ACTIVITY_PERIODS, activityBars, type ActivityPeriod } from "../../shared/gauges";
import { focusStats, weekBars } from "../../shared/overview";
import { AccountMenuButton } from "../components/AccountMenu";
import { TaskEditor } from "../components/editors";
import { DotMatrixBars, FanGauge, Kpi, RadialGauge, SplitBar, TickRing } from "../components/viz";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import { isOpen } from "../lib/taskUi";

/** One widget surface. `tone` picks the instrument colour; pastel cards keep dark text in both themes. */
const TONE = {
  charcoal: { bg: "var(--w-charcoal)", fg: "var(--ink)", ring: "0 0 0 1px var(--line)" },
  blue: { bg: "var(--w-blue)", fg: "var(--w-on-blue)", ring: "none" },
  butter: { bg: "var(--w-butter)", fg: "var(--w-butter-on)", ring: "none" },
} as const;
function Card({ tone, to, label, className, children, aria }: { tone: keyof typeof TONE; to?: string; label?: string; className?: string; children: ReactNode; aria?: string }) {
  const t = TONE[tone];
  const cls = cx("relative flex min-w-0 flex-col rounded-[20px] p-3.5", className);
  const style = { background: t.bg, color: t.fg, boxShadow: t.ring };
  const head = label ? <p className="self-start text-[15px] font-normal leading-tight tracking-tight opacity-80">{label}</p> : null;
  if (to) return (
    <Link to={to} aria-label={aria} className={cx(cls, "hit")} style={style}>
      {head}
      <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden className="absolute right-3.5 top-3.5 opacity-60" />
      {children}
    </Link>
  );
  return <section aria-label={aria ?? label} className={cls} style={style}>{head}{children}</section>;
}
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Home: five instrument widgets and nothing else. Detail lives on the dedicated screens. */
export default function Overview() {
  const { tasks, goals, approvals, inbox, today, weekStart, source, error, loading } = useData();
  const [adding, setAdding] = useState(false);
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

  return (
    <div className="mx-auto w-full max-w-[760px] xl:max-w-[1120px]">
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

      <div className="mt-3.5 grid grid-cols-2 gap-2 xl:grid-cols-12">
        <Card tone="charcoal" to="/tasks?h=today" label="Daily completion" aria={`Daily completion: ${f.completed} of ${totalToday} tasks, ${f.pct} percent. Open today's tasks`} className="min-h-[232px] items-center xl:col-span-4 xl:col-start-1 xl:row-start-1">
          <RadialGauge pct={f.pct} size={122} className="mt-3.5" label={totalToday === 0 ? "No tasks due today" : `${f.pct} percent of today's tasks complete`} />
          <div className="mt-auto text-center">
            <p className="num text-[28px] font-light leading-none tracking-tight">{totalToday === 0 ? "—" : <>{f.pct}<span className="text-[0.62em]">%</span></>}</p>
            <p className="mt-1.5 text-[14px] opacity-70">{totalToday === 0 ? "No tasks today" : `${f.completed} of ${totalToday} completed`}</p>
          </div>
        </Card>

        <Card tone="blue" to="/tasks?h=this_week" label="Weekly workload" aria={`Weekly workload: ${weekTotal} tasks due in the next 7 days`} className="min-h-[232px] items-center xl:col-span-4 xl:col-start-5 xl:row-start-1">
          <FanGauge values={week.map((d) => d.count)} size={156} className="mt-6" label={`Open tasks due each of the next 7 days, today first: ${week.map((d) => d.count).join(", ")}. Segment depth is relative to the busiest day.`}>
            <p className="num text-[28px] font-light leading-none tracking-tight">{weekTotal}</p>
          </FanGauge>
          <p className="mt-1.5 text-[12.5px] opacity-75">Upcoming tasks</p>
          <p className="mt-auto pt-3 text-[15px] opacity-85">Next seven days</p>
        </Card>

        <Card tone="butter" label="Task activity" aria={`Task activity, ${range}: ${done} tasks completed`} className="col-span-2 min-h-[160px] xl:col-span-8 xl:col-start-1 xl:row-start-2">
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
          <DotMatrixBars bars={bars} className="mx-auto mt-2.5 max-w-[470px]" label={`Tasks completed per day, ${range}: ${bars.map((b) => `${b.label} ${b.count}`).join(", ")}. ${done} in total.`} />
        </Card>

        <Card tone="charcoal" to="/tasks" label="Tasks" aria={`Tasks: ${dueToday} remaining today, ${f.overdue} overdue. Open all tasks`} className="min-h-[160px] xl:col-span-4 xl:col-start-9 xl:row-start-1">
          <Kpi className="mt-3.5" size={28} value={dueToday} caption="Remaining today" />
          <SplitBar className="mt-3" parts={[{ value: f.completed, color: "var(--g-sage)" }, { value: dueToday, color: "color-mix(in srgb, var(--ink) 20%, transparent)" }, { value: f.overdue, color: "var(--w-terra)" }]} label={totalToday === 0 ? "No tasks due today" : `Today: ${f.completed} done, ${dueToday} remaining, ${f.overdue} overdue`} />
          <div className="mt-auto flex items-baseline justify-between pt-3">
            <span className="text-[14px] text-muted">Overdue</span>
            <span className="num text-[16px]" style={{ color: f.overdue > 0 ? "var(--w-terra)" : "var(--faint)" }}>{pad2(f.overdue)}</span>
          </div>
        </Card>

        <Card tone="charcoal" to="/goals" label="Goals" aria={`Goals: ${activeGoals.length} active${avg !== null ? `, average progress ${avg} percent` : ""}. Open goals`} className="min-h-[160px] xl:col-span-4 xl:col-start-9 xl:row-start-2">
          <div className="mt-3 flex items-start justify-between gap-2">
            <Kpi size={28} value={activeGoals.length} caption="Active goals" />
            <TickRing pct={avg} size={54} label={avg === null ? "No goals yet" : `Average goal progress ${avg} percent`} />
          </div>
          <hr className="mt-auto border-0 border-t" style={{ borderColor: "var(--line)" }} />
          <p className="pt-2.5 text-[14px] text-muted">{activeGoals.length === 0 ? "No goals yet" : "View all objectives"}</p>
        </Card>
      </div>

      {empty && <p className="mt-4 px-1 text-[13px] text-muted">Nothing here yet. Add a task, or let your assistants file their first items; the widgets fill in as records arrive.</p>}
      {adding && <TaskEditor onClose={() => setAdding(false)} />}
    </div>
  );
}
