import { BarChart3, Plus, Sparkles, Spline, Grip } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DotMatrix, SegBar, Spark, type ChartMode } from "../components/charts";
import { TaskLine } from "../components/TaskLine";
import { Btn, IconToggle, LinkBtn, PageHeader, Panel, Segmented, StatLine, Status, Tabs, Tag, Widget, cx } from "../components/ui";
import { accounts, bills, events, goals, netWorthTrend, nextPayday, scheduleLoad, steps, stepsGoal, waterGoalMl, waterStartMl, weight, type EventKind } from "../data/synthetic";
import { categoryName } from "../lib/categories";
import { useData } from "../lib/data";
import { localToday, pretty, relative, shift, ymd } from "../lib/dates";
import { ageLabel, useNow } from "../lib/useNow";
import { formatMoney, sumMinor } from "../../shared/money";
import { DEFAULT_ROTATION, rotationStatus } from "../../shared/rotation";
import { clockLabel, fillTicks, hourFraction, pad2, rotationTicks } from "../../shared/viz";
import { formatVolume, formatWeight } from "../../shared/units";

type Range = "today" | "7d" | "30d";
const KIND_DOT: Record<EventKind, string> = {
  Work: "bg-ink", Personal: "border-2 border-ink", Training: "bg-lime ring-2 ring-ink", Health: "border-2 border-[var(--lime-deep)]", Finance: "bg-amber", Travel: "bg-faint",
};

function split(minor: number) {
  const s = formatMoney(minor);
  const i = s.lastIndexOf(".");
  return [s.slice(0, i), s.slice(i)] as const;
}

interface Attention { key: string; ref: string; age: string; title: string; sub: string; primary: { label: string; run?: () => void; to?: string }; secondary?: { label: string; run?: () => void; to?: string } }

export default function Dashboard() {
  const { tasks, approvals, source, complete, reopen, decide } = useData();
  const now = useNow();
  const today = localToday();
  const [range, setRange] = useState<Range>("today");
  const [mode, setMode] = useState<ChartMode>("dots");
  const [tab, setTab] = useState<"today" | "overdue" | "done">("today");
  const [water, setWater] = useState(waterStartMl);
  const demoSuffix = source === "demo";

  const open = useMemo(() => tasks.filter((t) => t.status !== "completed" && !t.archivedAt), [tasks]);
  const dueToday = open.filter((t) => t.dueDate === today);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const active = open.filter((t) => t.status === "in_progress");
  const doneToday = tasks.filter((t) => t.status === "completed" && t.completedAt && ymd(new Date(t.completedAt)) === today);
  const outstanding = dueToday.length + overdue.length;

  const evs = events();
  const todayEvents = evs.filter((e) => e.day === today && e.time !== "—").sort((a, b) => a.time.localeCompare(b.time));
  const clock = clockLabel(now);
  const nextEvent = todayEvents.find((e) => e.time >= clock) ?? evs.find((e) => e.day > today && e.time !== "—");
  const payday = nextPayday();
  const paydayIn = Math.round((new Date(payday).getTime() - new Date(today).getTime()) / 86_400_000);

  // Hero chart data per range. Today = synthetic schedule load by hour; 7 and 30 days = real tasks due per day plus synthetic events.
  const hero = useMemo(() => {
    if (range === "today") {
      const sum = scheduleLoad.Work.map((_, i) => scheduleLoad.Work[i] + scheduleLoad.Personal[i] + scheduleLoad.Training[i]);
      const idx = nextEvent && nextEvent.day === today ? Number(nextEvent.time.slice(0, 2)) : undefined;
      return {
        values: sum, series: Object.entries(scheduleLoad).map(([name, values]) => ({ name, values })), labels: Array.from({ length: 24 }, (_, i) => pad2(i)), labelEvery: 3,
        now: hourFraction(now), nowLabel: `NOW ${clock}`, unit: "items", big: outstanding, caption: `open today · ${overdue.length} overdue`, annotation: idx !== undefined && nextEvent ? { index: idx, text: `${nextEvent.time} · ${nextEvent.title.toUpperCase()}`.slice(0, 26) } : undefined, aria: "Schedule load by hour for today",
      };
    }
    const days = range === "7d" ? 7 : 30;
    const dates = Array.from({ length: days }, (_, i) => shift(today, i));
    const taskCounts = dates.map((d) => open.filter((t) => t.dueDate === d).length);
    const evCounts = dates.map((d) => evs.filter((e) => e.day === d).length);
    return {
      values: taskCounts.map((c, i) => c + evCounts[i]), series: [{ name: "Tasks", values: taskCounts }, { name: "Events", values: evCounts }],
      labels: dates.map((d) => (range === "7d" ? pretty(d, { weekday: "narrow" }) : String(Number(d.slice(8)))), ), labelEvery: range === "7d" ? 1 : 5,
      now: undefined, nowLabel: undefined, unit: "items", big: taskCounts.reduce((a, b) => a + b, 0), caption: `tasks due in the next ${days} days`, annotation: undefined, aria: `Items per day, next ${days} days`,
    };
  }, [range, now, clock, nextEvent, today, open, evs, outstanding, overdue.length]);

  // Items that need the owner: pending approvals, overdue tasks, bills due soon.
  const attention: Attention[] = [
    ...approvals.map((a) => ({ key: a.id, ref: "APR", age: ageLabel(a.createdAt, now), title: a.summary, sub: `Requested by ${a.requestedBy}`, primary: { label: "Approve", run: () => void decide(a.id, true) }, secondary: { label: "Decline", run: () => void decide(a.id, false) } })),
    ...overdue.slice(0, 2).map((t) => ({ key: t.id, ref: "TSK", age: relative(t.dueDate!, today).replace(" days overdue", "d"), title: t.title, sub: `${categoryName(t.category) || "Task"} · overdue`, primary: { label: "Complete", run: () => void complete(t.id) }, secondary: { label: "Open", to: "/tasks?view=overdue" } })),
    ...bills().filter((b) => b.due <= shift(today, 3)).map((b) => ({ key: b.name, ref: "BILL", age: relative(b.due, today), title: `${b.name} · ${formatMoney(b.amount)}`, sub: "Finance · synthetic", primary: { label: "View", to: "/finance#cashflow" } })),
  ];
  const first = attention[0];

  const netWorth = sumMinor(accounts.map((a) => a.balance));
  const assets = sumMinor(accounts.filter((a) => a.balance > 0).map((a) => a.balance));
  const debts = -sumMinor(accounts.filter((a) => a.balance < 0).map((a) => a.balance));
  const [nwDollars, nwCents] = split(netWorth);
  const rot = rotationStatus(today, DEFAULT_ROTATION);
  const priorityList = [...overdue, ...dueToday, ...active.filter((t) => t.dueDate !== today && !(t.dueDate && t.dueDate < today))];
  const list = tab === "today" ? priorityList : tab === "overdue" ? overdue : doneToday;
  const lastWeight = weight[weight.length - 1].kg;

  const timeline = todayEvents.filter((e) => e.time < clock);
  const upcoming = [...todayEvents.filter((e) => e.time >= clock), ...evs.filter((e) => e.day === shift(today, 1))];

  return (
    <>
      <PageHeader
        crumb="OVERVIEW"
        title="Overview"
        subtitle={`${pretty(today, { weekday: "long", day: "numeric", month: "long" })} · ${clock}`}
        controls={<Segmented<Range> label="Chart range" value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />}
        tag={<Tag>{source === "live" ? "Tasks live · finance, health, schedule, goals synthetic" : source === "demo" ? "Local preview · all data synthetic" : "Offline"}</Tag>}
      />

      <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-6 md:gap-4 lg:grid-cols-12">
        {/* Hero */}
        <Panel id="overview" className="flex flex-col p-4 md:col-span-6 md:p-5 lg:col-span-8">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <h2 className="text-[15px] font-medium tracking-tight">{range === "today" ? "Today" : range === "7d" ? "Next 7 days" : "Next 30 days"}</h2>
              <span className="mono flex flex-wrap items-center gap-x-3"><span><i className="mr-1.5 inline-block size-2 rounded-full bg-ink align-middle" />Elapsed</span><span><i className="mr-1.5 inline-block size-2 rounded-full border border-faint align-middle" />Upcoming</span></span>
            </div>
            <div className="flex items-center gap-2">
              <IconToggle<ChartMode> label="Chart type" value={mode} onChange={setMode} options={[{ value: "dots", icon: Grip, label: "Dot matrix" }, { value: "lines", icon: Spline, label: "Fine lines" }, { value: "bars", icon: BarChart3, label: "Bars" }]} />
              <LinkBtn to="/calendar">Open calendar</LinkBtn>
            </div>
          </header>
          <div className="mb-4 grid gap-4 lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-5">
            <div className="flex flex-col">
              <p className="display num text-[84px] md:text-[92px]">{hero.big}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="pill pill-lime">↑ {doneToday.length} done today</span>
              </div>
              <p className="mono mt-2 !normal-case !tracking-[0.02em]">{hero.caption}</p>
              <div className="mt-4">
                <StatLine label="Done today" value={doneToday.length} />
                <StatLine label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : undefined} />
                <StatLine label="In progress" value={active.length} />
              </div>
            </div>
            <div className="min-w-0 self-end">
              <DotMatrix values={hero.values} series={hero.series} mode={mode} now={hero.now} nowLabel={hero.nowLabel} labels={hero.labels} labelEvery={hero.labelEvery} unit={hero.unit} annotation={hero.annotation} ariaLabel={hero.aria} maxDots={13} />
            </div>
          </div>
          <div className="panel-dim mt-auto flex flex-wrap items-center gap-3 p-2.5 pr-3 lg:mt-auto">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[var(--rail)] text-white"><Sparkles size={16} aria-hidden /></span>
            <p className="min-w-[200px] flex-1 text-[13px] leading-snug">
              <strong className="font-semibold">{nextEvent ? `${nextEvent.title} at ${nextEvent.time}.` : "Nothing else scheduled today."}</strong>{" "}
              <span className="text-muted">Payday is {paydayIn <= 0 ? "today" : `in ${paydayIn} days`}.{overdue.length ? ` ${overdue.length} overdue.` : " Nothing overdue."}</span>
            </p>
            <div className="flex items-center gap-2">
              <Link to="/tasks?view=today" className="btn btn-primary !min-h-9 !px-4 !text-[12.5px]">Plan the day</Link>
              <Link to="/calendar" className="btn btn-soft !min-h-9 !px-3.5 !text-[12.5px]">Schedule →</Link>
            </div>
          </div>
        </Panel>

        {/* Needs you */}
        <Panel label="Needs you" tabIndex={0} onKeyDown={(e) => { if (e.target !== e.currentTarget || !first) return; if (e.key === "Enter") first.primary.run?.(); if (e.key === "Escape") first.secondary?.run?.(); }} className="flex flex-col p-4 outline-offset-4 md:col-span-6 md:p-5 lg:col-span-4">
          <header className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><h2 className="text-[15px] font-medium tracking-tight">Needs you</h2>{attention.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1.5 text-[11px] font-semibold text-lime-ink num">{attention.length}</span>}</div>
            <LinkBtn to="/intelligence#approvals">Open queue</LinkBtn>
          </header>
          {attention.length === 0 ? <p className="mono flex-1 py-10 text-center !normal-case">Nothing needs you right now.</p> : (
            <ul className="flex flex-1 flex-col gap-2.5">
              {attention.slice(0, 3).map((a, i) => (
                <li key={a.key} className={cx("rounded-[16px] p-3.5", i === 0 ? "raised" : "panel-dim")}>
                  <div className="flex items-center justify-between gap-3"><span className="tag">{a.ref}</span><span className="mono">{a.age}</span></div>
                  <p className="mt-2 text-[14px] font-medium leading-snug">{a.title}</p>
                  <p className="mono mt-0.5 !normal-case !tracking-[0.02em]">{a.sub}</p>
                  {i === 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {a.primary.to ? <Link to={a.primary.to} className="btn btn-primary !min-h-9 !px-4 !text-[12.5px]">{a.primary.label}</Link> : <Btn variant="primary" kbd="↵" onClick={a.primary.run} className="!min-h-9 !px-4 !text-[12.5px]">{a.primary.label}</Btn>}
                      {a.secondary && (a.secondary.to ? <Link to={a.secondary.to} className="btn btn-soft !min-h-9 !px-4 !text-[12.5px]">{a.secondary.label}</Link> : <Btn variant="soft" kbd="Esc" onClick={a.secondary.run} className="!min-h-9 !px-4 !text-[12.5px]">{a.secondary.label}</Btn>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mono mt-3 !normal-case">{approvals.length ? "↵ approve · Esc decline" : demoSuffix ? "Local preview · synthetic items" : "Approvals, overdue tasks and bills due soon"}</p>
        </Panel>

        {/* Priorities */}
        <Widget id="priorities" title="Today's priorities" tag={source === "live" ? "Live" : source === "demo" ? "Synthetic" : undefined} className="md:col-span-6 lg:col-span-7" action={<LinkBtn to="/tasks?view=today">All tasks</LinkBtn>}>
          <div className="mb-2 border-b border-line">
            <Tabs<"today" | "overdue" | "done"> label="Priority views" value={tab} onChange={setTab} options={[{ value: "today", label: "Priorities", count: priorityList.length }, { value: "overdue", label: "Overdue", count: overdue.length }, { value: "done", label: "Done", count: doneToday.length }]} />
          </div>
          {list.length === 0 ? <p className="mono py-8 text-center !normal-case">{tab === "today" ? "Clear. Nothing urgent." : tab === "overdue" ? "Nothing overdue." : "Nothing completed yet today."}</p> : (
            <ul>{list.slice(0, 6).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={(x) => (x.status === "completed" ? void reopen(x.id) : void complete(x.id))} />)}</ul>
          )}
        </Widget>

        {/* Briefing */}
        <Widget id="briefing" title="Daily briefing" tag="Synthetic" className="md:col-span-3 lg:col-span-5">
          <p className="text-[22px] font-light leading-[1.2] tracking-tight">{outstanding === 0 ? "A clear day." : `${outstanding} ${outstanding === 1 ? "task needs" : "tasks need"} you today.`} {todayEvents.length} events{nextEvent && nextEvent.day === today ? `, next at ${nextEvent.time}` : ""}.</p>
          <dl className="mt-4 divide-y divide-[var(--line)] text-[13px]">
            {[
              ["Schedule", todayEvents.map((e) => `${e.time} ${e.title}`).slice(0, 2).join(" · ") || "Nothing scheduled"],
              ["Money", `${bills()[0].name} ${relative(bills()[0].due, today).toLowerCase()} · ${formatMoney(bills()[0].amount)}`],
              ["Rotation", `Day ${rot.dayInPhase} of ${rot.phaseLength} · ${rot.daysRemaining} days left`],
              ["Health", `Water ${formatVolume(water, "metric")} of ${formatVolume(waterGoalMl, "metric")} · ${steps[steps.length - 1].s.toLocaleString()} steps`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2"><dt className="mono w-16 shrink-0 pt-0.5">{k}</dt><dd className="min-w-0 flex-1">{v}</dd></div>
            ))}
          </dl>
          <p className="mono mt-auto pt-3 !normal-case">Briefings an assistant imports appear here after your review.</p>
        </Widget>

        {/* Schedule */}
        <Widget id="schedule" title="Upcoming schedule" tag="Synthetic" className="md:col-span-3 lg:col-span-5" action={<LinkBtn to="/calendar?view=day">Day view</LinkBtn>}>
          <ol className="relative space-y-0.5 text-[13.5px]">
            {timeline.map((e) => (
              <li key={e.title} className="flex items-center gap-3 py-1.5 opacity-55"><span className="mono num w-11">{e.time}</span><i className={cx("block size-2.5 shrink-0 rounded-full", KIND_DOT[e.kind])} /><span className="min-w-0 flex-1 truncate">{e.title}</span></li>
            ))}
            <li className="flex items-center gap-3 py-1" aria-label={`Now ${clock}`}>
              <span className="mono num w-11 !text-ink">{clock}</span>
              <i className="live-dot block size-2.5 shrink-0 rounded-full bg-lime ring-2 ring-ink" />
              <span className="h-px flex-1 border-t border-dashed border-ink/40" />
              <span className="mono !text-ink">Now</span>
            </li>
            {upcoming.slice(0, 5).map((e, i) => (
              <li key={`${e.day}${e.title}`} className="flex items-center gap-3 py-1.5">
                <span className="mono num w-11">{e.day === today ? e.time : i === 0 || upcoming[i - 1].day !== e.day ? "TMR" : ""}</span>
                <i className={cx("block size-2.5 shrink-0 rounded-full", KIND_DOT[e.kind])} />
                <span className="min-w-0 flex-1 truncate">{e.title}{e.day !== today ? <span className="mono ml-2">{e.time}</span> : null}</span>
                <span className="mono hidden sm:inline">{e.kind}</span>
              </li>
            ))}
          </ol>
        </Widget>

        {/* Finance */}
        <Widget id="finance" title="Financial overview" tag="Synthetic · CAD" className="md:col-span-6 lg:col-span-7" action={<LinkBtn to="/finance">Open finance</LinkBtn>}>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="mono">Net worth</p>
              <p className="display num mt-1.5 text-[52px] md:text-[60px]">{nwDollars}<span className="text-[26px] text-faint">{nwCents}</span></p>
              <div className="mt-2 flex items-center gap-2"><span className="pill pill-lime">↑ 2.8% this month</span></div>
              <Spark values={netWorthTrend.map((p) => p.v)} label="Net worth over six months, rising" className="mt-3 max-w-[220px]" />
              <div className="mt-2 max-w-[260px]">
                <StatLine label="Assets" value={formatMoney(assets, { compact: true })} />
                <StatLine label="Liabilities" value={formatMoney(debts, { compact: true })} />
                <StatLine label="Next payday" value={pretty(payday, { weekday: "short", day: "numeric", month: "short" })} />
              </div>
            </div>
            <div>
              <p className="mono mb-2">Bills due</p>
              <ul>
                {bills().slice(0, 4).map((b) => (
                  <li key={b.name} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                    <div className="min-w-0 flex-1"><p className="truncate text-[13.5px]">{b.name}</p><p className="mono mt-0.5">{relative(b.due, today)}</p></div>
                    {b.due <= shift(today, 2) && <Status tone="bad">Soon</Status>}
                    <span className="num text-[13.5px] font-medium">{formatMoney(b.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Widget>

        {/* Rotation */}
        <Widget id="rotation" title="Work rotation" className="md:col-span-3 lg:col-span-4" action={<Status tone={rot.phase === "on" ? "lime" : "ok"}>{rot.phase === "on" ? "Working" : "Off"}</Status>}>
          <p className="display num text-[56px]">{rot.dayInPhase}<span className="ml-2 text-[20px] font-light tracking-normal text-muted">of {rot.phaseLength}</span></p>
          <p className="mono mt-2">{rot.phase === "on" ? "On rotation" : "Time off"} · {rot.daysRemaining === 0 ? "last day" : `${rot.daysRemaining} days left`}</p>
          <SegBar ticks={rotationTicks(today, DEFAULT_ROTATION)} label={`Rotation: day ${rot.dayInPhase} of ${rot.phaseLength}, ${DEFAULT_ROTATION.onDays} on and ${DEFAULT_ROTATION.offDays} off`} height={26} className="mt-4" />
          <p className="mono mt-3 !normal-case">Changes {pretty(rot.nextChange, { weekday: "short", day: "numeric", month: "short" })} · {DEFAULT_ROTATION.onDays} on / {DEFAULT_ROTATION.offDays} off</p>
        </Widget>

        {/* Health */}
        <Widget id="health" title="Health & hydration" tag="Synthetic" className="md:col-span-3 lg:col-span-4" action={<LinkBtn to="/health">Open</LinkBtn>}>
          <div className="flex items-end justify-between gap-3">
            <div><p className="mono">Weight</p><p className="display num mt-1 text-[40px]">{lastWeight.toFixed(1)}<span className="ml-1.5 text-[16px] font-light tracking-normal text-muted">kg</span></p></div>
            <Spark values={weight.map((w) => w.kg)} label={`Weight ${formatWeight(lastWeight, "metric")}, trending down`} className="w-28" />
          </div>
          <div className="mt-4 space-y-3.5">
            <div><div className="mb-1.5 flex justify-between"><span className="mono">Steps</span><span className="mono num !text-ink">{steps[steps.length - 1].s.toLocaleString()} / {stepsGoal.toLocaleString()}</span></div><SegBar ticks={fillTicks(20, steps[steps.length - 1].s, stepsGoal)} label="Steps against goal" height={14} /></div>
            <div><div className="mb-1.5 flex items-center justify-between"><span className="mono">Water</span><span className="mono num !text-ink">{formatVolume(water, "metric")} / {formatVolume(waterGoalMl, "metric")}</span></div><SegBar ticks={fillTicks(10, water, waterGoalMl, "now")} label="Water intake against goal" height={14} /></div>
          </div>
          <Btn variant="primary" icon={Plus} onClick={() => setWater((w) => Math.min(w + 250, 5000))} label="Add 250 millilitres of water" className="mt-4 !min-h-9 self-start !px-4 !text-[12.5px]">250 ml</Btn>
        </Widget>

        {/* Goals */}
        <Widget id="goals" title="Goals" tag="Synthetic" className="md:col-span-6 lg:col-span-4" action={<LinkBtn to="/goals">Open goals</LinkBtn>}>
          <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2 lg:grid-cols-1">
            {goals.map((g) => (
              <li key={g.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="truncate text-[13.5px]">{g.name}</span><span className="num text-[13px] font-medium">{g.progress}%</span></div>
                <SegBar ticks={fillTicks(24, g.progress, 100)} label={`${g.name}: ${g.progress}%`} height={14} />
                <p className="mono mt-1.5">{g.area} · target {g.due}</p>
              </li>
            ))}
          </ul>
        </Widget>
      </div>
    </>
  );
}
