import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DemoBadge, PageHeader, Row, Stat, Widget } from "../components/ui";
import { steps, waterGoalMl, waterStartMl, weight, workouts } from "../data/synthetic";
import { formatVolume, formatWeight } from "../../shared/units";

export default function Health() {
  return (
    <>
      <PageHeader title="Health" subtitle="Metric units · switchable in Settings" actions={<DemoBadge />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Widget title="Weight trend" className="lg:col-span-2">
          <Stat label="Latest" value={formatWeight(weight[weight.length - 1].kg, "metric")} hint="8-week change −1.4 kg" />
          <div className="mt-3 h-44" role="img" aria-label="Weight over eight weeks, trending down">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={weight}><CartesianGrid vertical={false} stroke="var(--c-line)" /><XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={12} stroke="var(--c-muted)" /><YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tickLine={false} axisLine={false} fontSize={12} width={36} stroke="var(--c-muted)" /><Line dataKey="kg" stroke="var(--c-accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
          </div>
        </Widget>
        <Widget title="Today"><div className="grid grid-cols-2 gap-4"><Stat label="Water" value={formatVolume(waterStartMl, "metric")} hint={`Goal ${formatVolume(waterGoalMl, "metric")}`} /><Stat label="Sleep" value="7 h 20" hint="Demo" /><Stat label="Calories" value="1,940" hint="Protein 142 g" /><Stat label="Resting HR" value="58 bpm" hint="Demo" /></div></Widget>
        <Widget title="Steps this week" className="lg:col-span-2">
          <div className="h-40" role="img" aria-label="Daily steps for the last seven days">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={steps}><XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={12} stroke="var(--c-muted)" /><Bar dataKey="s" fill="var(--c-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>
          </div>
        </Widget>
        <Widget title="Recent workouts"><ul>{workouts.map((w) => <Row key={w.name} left={w.name} sub={w.detail} right={w.when} />)}</ul></Widget>
      </div>
      <p className="mt-4 text-xs text-muted">Apple Health data will arrive through an Apple Shortcut or a future companion app using the authenticated ingestion API (a browser cannot read HealthKit). Planned next: workout logging with sets, reps and personal records, nutrition, sleep, appointments and medications.</p>
    </>
  );
}
