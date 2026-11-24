import { useState } from "react";
import { Badge, Card, DemoBadge, PageHeader, Segmented } from "../components/ui";
import { events } from "../data/synthetic";
import { localToday, parse, pretty, shift } from "../lib/dates";
import { DEFAULT_ROTATION, rotationStatus } from "../../shared/rotation";

const VIEWS = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }] as const;
type View = (typeof VIEWS)[number]["value"];
const TONE = { Work: "accent", Personal: "neutral", Training: "good", Health: "good", Finance: "warn", Travel: "accent" } as const;

export default function Calendar() {
  const [view, setView] = useState<View>("week");
  const today = localToday();
  const ev = events();
  const span = view === "day" ? 1 : view === "week" ? 7 : 35;
  const start = view === "month" ? shift(today, -parse(today).getDay()) : today;
  const days = Array.from({ length: span }, (_, i) => shift(start, i));

  return (
    <>
      <PageHeader title="Calendar" subtitle="Events, deadlines, paydays and your work rotation" actions={<DemoBadge />} />
      <div className="mb-4"><Segmented label="Calendar view" value={view} onChange={setView} options={VIEWS} /></div>
      {view === "month" ? (
        <Card className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const r = rotationStatus(d, DEFAULT_ROTATION);
              const n = ev.filter((e) => e.day === d).length;
              return (
                <div key={d} className={`flex min-h-14 flex-col items-center rounded-xl p-1 text-sm sm:min-h-20 ${d === today ? "bg-accent text-bg" : r.phase === "on" ? "bg-accent-soft" : "bg-surface-2"}`} aria-label={`${pretty(d)}, ${r.phase === "on" ? "on rotation" : "off"}${n ? `, ${n} events` : ""}`}>
                  <span className="tabular font-medium">{parse(d).getDate()}</span>
                  {n > 0 && <span className="mt-auto text-[10px]">{n} ●</span>}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Tinted days are on rotation (14 on / 7 off). Today is highlighted.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map((d) => {
            const r = rotationStatus(d, DEFAULT_ROTATION);
            const list = ev.filter((e) => e.day === d);
            return (
              <Card key={d} className="p-4">
                <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{d === today ? "Today · " : ""}{pretty(d, { weekday: "long", month: "short", day: "numeric" })}</h2><Badge tone={r.phase === "on" ? "accent" : "good"}>{r.phase === "on" ? `Work day ${r.dayInPhase}` : "Off"}</Badge></div>
                {list.length === 0 ? <p className="text-sm text-muted">No events</p> : <ul className="space-y-2">{list.map((e) => <li key={e.title} className="flex items-center gap-3 text-sm"><span className="tabular w-12 text-muted">{e.time}</span><span className="flex-1">{e.title}</span><Badge tone={TONE[e.kind as keyof typeof TONE] ?? "neutral"}>{e.kind}</Badge></li>)}</ul>}
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Planned next: appointments, recurring events, task deadlines and bill due dates merged into one timeline, and Google Calendar sync.</p>
    </>
  );
}
