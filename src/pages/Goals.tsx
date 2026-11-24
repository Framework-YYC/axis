import { Badge, DemoBadge, PageHeader, Progress, Widget } from "../components/ui";
import { goals, habits } from "../data/synthetic";

export default function Goals() {
  return (
    <>
      <PageHeader title="Goals & habits" subtitle="Targets, milestones and daily consistency" actions={<DemoBadge />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Goals">
          <ul className="space-y-4">{goals.map((g) => <li key={g.name}><div className="mb-1 flex items-center justify-between gap-2"><span className="text-sm font-medium">{g.name}</span><Badge>{g.area}</Badge></div><Progress label={g.name} value={g.progress} tone="good" /><div className="mt-1 flex justify-between text-xs text-muted"><span>{g.progress}% complete</span><span>Target {g.due}</span></div></li>)}</ul>
        </Widget>
        <Widget title="Habits · last 7 days">
          <ul className="space-y-4">{habits.map((h) => <li key={h.name}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{h.name}</span><span className="text-xs text-muted">{h.streak}-day streak</span></div><div className="flex gap-1.5" role="img" aria-label={`${h.week.filter(Boolean).length} of 7 days completed`}>{h.week.map((d, i) => <span key={i} className={`h-7 flex-1 rounded-lg ${d ? "bg-good" : "bg-surface-2"}`} />)}</div></li>)}</ul>
        </Widget>
      </div>
    </>
  );
}
