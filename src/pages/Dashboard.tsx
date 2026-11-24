import { Bot, CalendarDays, CheckSquare, Droplets, Footprints, Plus, Receipt, Scale, Target, TrendingUp, Briefcase, Wallet, Dumbbell } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Badge, Button, DemoBadge, PageHeader, Progress, Row, Stat, Widget } from "../components/ui";
import { TaskRow } from "./Tasks";
import { accounts, bills, events, goals, netWorthTrend, nextPayday, steps, waterGoalMl, waterStartMl, weight } from "../data/synthetic";
import { localToday, pretty, relative } from "../lib/dates";
import { useTasks } from "../lib/useTasks";
import { formatMoney, sumMinor } from "../../shared/money";
import { DEFAULT_ROTATION, rotationStatus } from "../../shared/rotation";
import { formatVolume, formatWeight } from "../../shared/units";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

export default function Dashboard() {
  const { tasks, source, complete, reopen } = useTasks();
  const [water, setWater] = useState(waterStartMl);
  const today = localToday();
  const open = tasks.filter((t) => t.status !== "completed" && !t.archivedAt);
  const priorities = open.filter((t) => (t.dueDate && t.dueDate <= today) || t.priority === "critical").slice(0, 4);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const netWorth = sumMinor(accounts.map((a) => a.balance));
  const rot = rotationStatus(today, DEFAULT_ROTATION);
  const todayEvents = events().filter((e) => e.day === today);

  return (
    <>
      <PageHeader title={greeting()} subtitle={pretty(today, { weekday: "long", month: "long", day: "numeric" })} actions={<DemoBadge text="Finance, health, calendar: synthetic demo data" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Widget title="Today's priorities" icon={CheckSquare} className="sm:col-span-2 lg:col-span-4" action={<Link to="/tasks" className="text-sm text-accent">All tasks</Link>}>
          {priorities.length === 0 ? <p className="py-4 text-sm text-muted">Nothing urgent. Enjoy the clear day.</p> : (
            <ul>{priorities.map((t) => <TaskRow key={t.id} t={t} today={today} onToggle={(x) => (x.status === "completed" ? reopen(x.id) : complete(x.id))} />)}</ul>
          )}
          <div className="mt-2 text-xs text-muted">{source === "live" ? "Live from Axis" : "Demo tasks"}{overdue > 0 && <> · <span className="font-medium text-bad">{overdue} overdue</span></>}</div>
        </Widget>

        <Widget title="Work rotation" icon={Briefcase} className="lg:col-span-2">
          <div className="flex items-end justify-between">
            <Stat label={rot.phase === "on" ? "On rotation" : "Time off"} value={`Day ${rot.dayInPhase} of ${rot.phaseLength}`} hint={`${rot.daysRemaining === 0 ? "Last day" : `${rot.daysRemaining} days left`} · changes ${pretty(rot.nextChange)}`} />
            <Badge tone={rot.phase === "on" ? "accent" : "good"}>{rot.phase === "on" ? "Working" : "Off"}</Badge>
          </div>
          <div className="mt-3"><Progress label="Rotation progress" value={(rot.dayInPhase / rot.phaseLength) * 100} tone={rot.phase === "on" ? "accent" : "good"} /></div>
        </Widget>

        <Widget title="Daily briefing" icon={Bot} className="sm:col-span-2 lg:col-span-3" action={<Badge>Demo</Badge>}>
          <p className="text-[15px] leading-relaxed">You have {todayEvents.length} events today, {open.filter((t) => t.dueDate === today).length} tasks due and one bill due in 2 days. Payday is {relative(nextPayday(), today).toLowerCase()}. Energy plan: training at 17:30.</p>
          <p className="mt-2 text-xs text-muted">Briefings imported from an assistant appear here after you review them.</p>
        </Widget>

        <Widget title="Calendar" icon={CalendarDays} className="lg:col-span-3" action={<Link to="/calendar" className="text-sm text-accent">Open</Link>}>
          <ul>{todayEvents.map((e) => <Row key={e.title} left={e.title} sub={e.kind} right={e.time} />)}</ul>
        </Widget>

        <Widget title="Financial position" icon={Wallet} className="sm:col-span-2 lg:col-span-3" action={<Link to="/finance" className="text-sm text-accent">Open</Link>}>
          <div className="flex items-end justify-between gap-4">
            <Stat label="Net worth (CAD)" value={formatMoney(netWorth)} hint="Up 2.8% this month" tone="good" />
            <div className="h-14 w-32" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorthTrend}><YAxis hide domain={["dataMin - 800", "dataMax + 300"]} /><Area dataKey="v" type="monotone" stroke="var(--c-accent)" fill="var(--c-accent-soft)" strokeWidth={2} isAnimationActive={false} /></AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Widget>

        <Widget title="Upcoming bills" icon={Receipt} className="lg:col-span-3">
          <ul>{bills().slice(0, 3).map((b) => <Row key={b.name} left={b.name} sub={relative(b.due, today)} right={formatMoney(b.amount)} />)}</ul>
        </Widget>

        <Widget title="Water" icon={Droplets} className="lg:col-span-2">
          <Stat label={`of ${formatVolume(waterGoalMl, "metric")}`} value={formatVolume(water, "metric")} />
          <div className="my-3"><Progress label="Water intake" value={(water / waterGoalMl) * 100} /></div>
          <Button icon={Plus} onClick={() => setWater((w) => Math.min(w + 250, 6000))} label="Add 250 millilitres of water">250 ml</Button>
        </Widget>

        <Widget title="Health" icon={Scale} className="lg:col-span-2" action={<Link to="/health" className="text-sm text-accent">Open</Link>}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Weight" value={formatWeight(weight[weight.length - 1].kg, "metric")} hint="−1.4 kg in 8 wks" />
            <Stat label="Steps" value={steps[steps.length - 1].s.toLocaleString()} hint={<span className="inline-flex items-center gap-1"><Footprints size={12} aria-hidden />Goal 8,000</span>} />
          </div>
        </Widget>

        <Widget title="Goals" icon={Target} className="lg:col-span-2" action={<Link to="/goals" className="text-sm text-accent">Open</Link>}>
          <ul className="space-y-3">
            {goals.slice(0, 3).map((g) => (
              <li key={g.name}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{g.name}</span><span className="tabular text-muted">{g.progress}%</span></div><Progress label={g.name} value={g.progress} tone="good" /></li>
            ))}
          </ul>
        </Widget>

        <Widget title="Quick actions" icon={TrendingUp} className="sm:col-span-2 lg:col-span-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link to="/tasks" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-medium"><Plus size={16} aria-hidden />Task</Link>
            <Link to="/finance" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-medium"><Receipt size={16} aria-hidden />Expense</Link>
            <Link to="/health" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-medium"><Dumbbell size={16} aria-hidden />Workout</Link>
            <Link to="/intelligence" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-medium"><Bot size={16} aria-hidden />Import</Link>
          </div>
        </Widget>
      </div>
    </>
  );
}
