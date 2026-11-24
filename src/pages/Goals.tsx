import { SegBar } from "../components/charts";
import { DemoTag, PageHeader, Widget } from "../components/ui";
import { goals, habits } from "../data/synthetic";
import { fillTicks, type Tick } from "../../shared/viz";

export default function Goals() {
  return (
    <>
      <PageHeader crumb="GOALS" title="Goals & habits" subtitle="Targets, milestones and daily consistency" tag={<DemoTag />} />
      <div className="stagger grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-2">
        <Widget id="goals" title="Goals" tag="Synthetic">
          <ul className="space-y-5">
            {goals.map((g) => (
              <li key={g.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="text-[14px]">{g.name}</span><span className="num text-[13px] font-medium">{g.progress}%</span></div>
                <SegBar ticks={fillTicks(32, g.progress, 100)} label={`${g.name}: ${g.progress}% complete`} height={16} />
                <p className="mono mt-1.5">{g.area} · target {g.due}</p>
              </li>
            ))}
          </ul>
        </Widget>
        <Widget id="habits" title="Habits" tag="Last 7 days · synthetic">
          <ul className="space-y-5">
            {habits.map((h) => (
              <li key={h.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="text-[14px]">{h.name}</span><span className="mono">{h.streak}-day streak</span></div>
                <SegBar ticks={h.week.map((d): Tick => (d ? "on" : "off"))} label={`${h.name}: ${h.week.filter(Boolean).length} of 7 days`} height={22} />
              </li>
            ))}
          </ul>
        </Widget>
      </div>
    </>
  );
}
