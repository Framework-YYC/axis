import { BarChart3, Grip, Spline } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DotMatrix, SegBar, type ChartMode } from "../components/charts";
import { DemoTag, IconToggle, PageHeader, Row, StatLine, Widget } from "../components/ui";
import { steps, stepsGoal, waterGoalMl, waterStartMl, weight, workouts } from "../data/synthetic";
import { fillTicks } from "../../shared/viz";
import { formatVolume, formatWeight } from "../../shared/units";

const AXIS = { fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" } as const;

export default function Health() {
  const [mode, setMode] = useState<ChartMode>("dots");
  const last = weight[weight.length - 1];
  const today = steps[steps.length - 1];
  return (
    <>
      <PageHeader crumb="HEALTH" title="Health" subtitle="Metric units · switchable in Settings" tag={<DemoTag />} />
      <div className="stagger grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
        <Widget id="weight" title="Weight trend" tag="Synthetic" className="lg:col-span-8">
          <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div><p className="display num text-[56px]">{last.kg.toFixed(1)}<span className="ml-1.5 text-[20px] font-light tracking-normal text-muted">kg</span></p><span className="pill pill-lime mt-2">↓ 1.4 kg in 8 weeks</span><p className="mono mt-2 !normal-case">{formatWeight(last.kg, "imperial")}</p></div>
            <div className="h-44 min-w-0" role="img" aria-label="Weight over eight weeks, trending down">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weight} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="d" tickLine={false} axisLine={false} tick={AXIS} />
                  <YAxis domain={["dataMin - 0.4", "dataMax + 0.4"]} tickLine={false} axisLine={false} width={40} tick={AXIS} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Line dataKey="kg" stroke="var(--ink)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  <ReferenceDot x={last.d} y={last.kg} r={5} fill="var(--lime)" stroke="var(--ink)" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Widget>

        <Widget id="today" title="Today" tag="Synthetic" className="lg:col-span-4">
          <div className="space-y-4">
            <div><div className="mb-1.5 flex justify-between"><span className="mono">Water</span><span className="mono num !text-ink">{formatVolume(waterStartMl, "metric")} / {formatVolume(waterGoalMl, "metric")}</span></div><SegBar ticks={fillTicks(10, waterStartMl, waterGoalMl, "now")} label="Water intake against goal" height={14} /></div>
            <div><div className="mb-1.5 flex justify-between"><span className="mono">Steps</span><span className="mono num !text-ink">{today.s.toLocaleString()} / {stepsGoal.toLocaleString()}</span></div><SegBar ticks={fillTicks(20, today.s, stepsGoal)} label="Steps against goal" height={14} /></div>
            <div className="pt-1"><StatLine label="Sleep" value="7 h 20" /><StatLine label="Calories" value="1,940 kcal" /><StatLine label="Protein" value="142 g" /><StatLine label="Resting heart rate" value="58 bpm" /></div>
          </div>
        </Widget>

        <Widget id="steps" title="Steps this week" tag="Synthetic" className="lg:col-span-7" action={<IconToggle<ChartMode> label="Chart type" value={mode} onChange={setMode} options={[{ value: "dots", icon: Grip, label: "Dot matrix" }, { value: "lines", icon: Spline, label: "Fine line" }, { value: "bars", icon: BarChart3, label: "Bars" }]} />}>
          <DotMatrix values={steps.map((s) => s.s)} series={[{ name: "Steps", values: steps.map((s) => s.s) }]} mode={mode} labels={steps.map((s) => s.d)} labelEvery={1} unit="steps" ariaLabel="Daily steps for the last seven days" maxDots={12} />
        </Widget>

        <Widget id="workouts" title="Recent workouts" tag="Synthetic" className="lg:col-span-5">
          <ul>{workouts.map((w) => <Row key={w.name} left={w.name} sub={w.detail} right={w.when} />)}</ul>
        </Widget>
      </div>
      <p className="mono mt-4 !normal-case">Apple Health data will arrive through an Apple Shortcut or a future companion app using the authenticated ingestion API (a browser cannot read HealthKit). Next: workout logging with sets, reps and personal records, nutrition, sleep, appointments and medications.</p>
    </>
  );
}
