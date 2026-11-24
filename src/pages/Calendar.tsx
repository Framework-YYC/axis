import { useSearchParams } from "react-router-dom";
import { DemoTag, PageHeader, Panel, Segmented, Status, cx } from "../components/ui";
import { events, type EventKind } from "../data/synthetic";
import { localToday, parse, pretty, shift } from "../lib/dates";
import { DEFAULT_ROTATION, rotationStatus } from "../../shared/rotation";

type View = "day" | "week" | "month";
const VIEWS = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }] as const;
const KIND_DOT: Record<EventKind, string> = { Work: "bg-ink", Personal: "border-2 border-ink", Training: "bg-lime ring-2 ring-ink", Health: "border-2 border-[var(--lime-deep)]", Finance: "bg-amber", Travel: "bg-faint" };

export default function Calendar() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("view");
  const view: View = raw === "day" || raw === "month" ? raw : "week";
  const today = localToday();
  const ev = events();
  const span = view === "day" ? 1 : view === "week" ? 7 : 35;
  const start = view === "month" ? shift(today, -parse(today).getDay()) : today;
  const days = Array.from({ length: span }, (_, i) => shift(start, i));

  return (
    <>
      <PageHeader crumb="CALENDAR" title="Calendar" subtitle="Events, deadlines, paydays and your work rotation" controls={<Segmented<View> label="Calendar view" value={view} onChange={(v) => setSp({ view: v }, { replace: true })} options={VIEWS} />} tag={<DemoTag />} />
      {view === "month" ? (
        <Panel className="p-3 md:p-5">
          <div className="mono mb-2 grid grid-cols-7 gap-1.5 text-center">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const r = rotationStatus(d, DEFAULT_ROTATION);
              const list = ev.filter((e) => e.day === d);
              return (
                <div key={d} aria-label={`${pretty(d)}, ${r.phase === "on" ? "on rotation" : "off"}${list.length ? `, ${list.length} events` : ""}`} className={cx("flex min-h-16 flex-col justify-between rounded-[12px] p-1.5 md:min-h-24 md:p-2.5", d === today ? "bg-lime text-lime-ink ring-2 ring-ink" : r.phase === "on" ? "panel-dim" : "raised")}>
                  <span className="num text-[13px] font-medium">{parse(d).getDate()}</span>
                  <span className="flex gap-1">{list.slice(0, 4).map((e, i) => <i key={i} className={cx("block size-2 rounded-full", d === today ? "bg-ink" : KIND_DOT[e.kind])} />)}</span>
                </div>
              );
            })}
          </div>
          <p className="mono mt-4 !normal-case">Shaded days are on rotation ({DEFAULT_ROTATION.onDays} on / {DEFAULT_ROTATION.offDays} off). Today is lime.</p>
        </Panel>
      ) : (
        <div className="stagger grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {days.map((d) => {
            const r = rotationStatus(d, DEFAULT_ROTATION);
            const list = ev.filter((e) => e.day === d);
            return (
              <Panel key={d} className={cx("p-4 md:p-5", view === "day" && "md:col-span-2 xl:col-span-3")}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[15px] font-medium tracking-tight">{d === today ? "Today" : pretty(d, { weekday: "long" })}<span className="mono ml-2">{pretty(d, { day: "numeric", month: "short" })}</span></h2>
                  <Status tone={r.phase === "on" ? "lime" : "ok"}>{r.phase === "on" ? `Work day ${r.dayInPhase}` : "Off"}</Status>
                </div>
                {list.length === 0 ? <p className="mono !normal-case">No events</p> : (
                  <ul className="space-y-2.5">{list.map((e) => <li key={e.title} className="flex items-center gap-3 text-[13.5px]"><span className="mono num w-11">{e.time}</span><i className={cx("block size-2.5 shrink-0 rounded-full", KIND_DOT[e.kind])} /><span className="min-w-0 flex-1 truncate">{e.title}</span><span className="mono">{e.kind}</span></li>)}</ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}
      <p className="mono mt-4 !normal-case">Next: appointments, recurring events, task deadlines and bill due dates merged into one timeline, and Google Calendar sync.</p>
    </>
  );
}
