import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { dateStrip } from "../../shared/overview";
import { addDays } from "../../shared/rotation";
import type { ModuleId } from "../../shared/modules";
import { rotationTicks } from "../../shared/viz";
import { EventEditor, TaskEditor } from "../components/editors";
import { ModuleIcon } from "../components/mobile";
import { EventRow } from "../components/records";
import { TaskLine } from "../components/TaskLine";
import { SegBar } from "../components/charts";
import { Btn, Empty, PageHeader, Panel, Segmented, Widget } from "../components/ui";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { parse, pretty } from "../lib/dates";
import { isOpen } from "../lib/taskUi";
import type { CalEvent, Task } from "../lib/types";

type View = "day" | "week" | "month";
const startOfWeek = (d: string, ws: 0 | 1) => { const dow = parse(d).getDay(); return addDays(d, -((dow - ws + 7) % 7)); };

export default function CalendarPage() { return <Calendar />; }

/** The calendar. Pass a module to see only that module's events and due tasks (used inside module tabs). */
export function Calendar({ module }: { module?: ModuleId } = {}) {
  const data = useData();
  const { today, weekStart, settings, completeTask, reopenTask } = data;
  const events = module ? data.events.filter((e) => e.module === module) : data.events;
  const tasks = module ? data.tasks.filter((t) => t.module === module) : data.tasks;
  const [sp, setSp] = useSearchParams();
  const view: View = (["day", "week", "month"] as const).find((v) => v === sp.get("view")) ?? "week";
  const [focus, setFocus] = useState(today);
  const [edit, setEdit] = useState<{ event?: CalEvent; date?: string } | { task: Task } | null>(null);
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  const step = view === "day" ? 1 : view === "week" ? 7 : 28;
  const first = view === "day" ? focus : view === "week" ? startOfWeek(focus, weekStart) : startOfWeek(`${focus.slice(0, 7)}-01`, weekStart);
  const count = view === "day" ? 1 : view === "week" ? 7 : 42;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const evOn = (d: string) => events.filter((e) => e.date === d && e.status === "scheduled").sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const taskOn = (d: string) => tasks.filter((t) => isOpen(t) && t.dueDate === d);
  const rot = settings.work_rotation;
  const label = view === "month" ? pretty(`${focus.slice(0, 7)}-01`, { month: "long", year: "numeric" }) : view === "week" ? `${pretty(days[0], { day: "numeric", month: "short" })} – ${pretty(days[6], { day: "numeric", month: "short" })}` : pretty(focus, { weekday: "long", day: "numeric", month: "long" });
  const move = (dir: number) => setFocus((f) => (view === "month" ? addDays(`${f.slice(0, 7)}-15`, dir * 30).slice(0, 7) + "-01" : addDays(f, dir * step)));
  const rotTicks = rotationTicks(today, rot);
  const nextEvents = events.filter((e) => e.status === "scheduled" && e.date > focus).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

  return (
    <div>
      {module ? <p className="mono mb-3 px-1 !normal-case !tracking-normal">{label}</p> : <PageHeader crumb="CALENDAR" title="Calendar" subtitle={label} controls={<div className="max-md:hidden"><Segmented label="View" value={view} onChange={(v) => { const n = new URLSearchParams(sp); n.set("view", v); setSp(n, { replace: true }); }} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} /></div>} />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Btn variant="soft" icon={ChevronLeft} label="Previous" onClick={() => move(-1)} />
        <Btn variant="soft" onClick={() => setFocus(today)}>Today</Btn>
        <Btn variant="soft" icon={ChevronRight} label="Next" onClick={() => move(1)} />
        <span className="flex-1" />
        <Btn variant="primary" icon={Plus} onClick={() => setEdit({ date: focus })}>New event</Btn>
      </div>

      <div className="md:hidden">
        <div className={view === "month" ? "hidden" : "block"}>
          <div role="listbox" aria-label="Pick a day" className="no-scrollbar -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1">
            {dateStrip(today).map((d) => {
              const n = evOn(d).length, k = taskOn(d).length, on = d === focus;
              return (
                <button key={d} role="option" aria-selected={on} onClick={() => setFocus(d)} aria-label={`${pretty(d, { weekday: "long", day: "numeric", month: "long" })}: ${n} events, ${k} tasks`} className={cx("hit flex h-[72px] w-[52px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-[18px]", on ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : d === today ? "flat" : "bg-transparent")}>
                  <span className="mono !text-[9.5px]" style={{ color: on ? "inherit" : undefined }}>{pretty(d, { weekday: "short" })}</span>
                  <span className="num text-[19px] font-light leading-none">{parse(d).getDate()}</span>
                  <span className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden>{n > 0 && <i className="size-1.5 rounded-full bg-current" />}{k > 0 && <i className="size-1.5 rounded-[2px] border border-current" />}</span>
                </button>
              );
            })}
          </div>
          <section aria-label="Agenda" className="mt-3">
            <h2 className="mb-1 px-1 text-[15px] font-medium tracking-tight">{focus === today ? "Today" : pretty(focus, { weekday: "long", day: "numeric", month: "long" })}</h2>
            {evOn(focus).length + taskOn(focus).length === 0 ? (
              <p className="flat p-4 text-[13.5px] text-muted">Nothing scheduled.{nextEvents.length > 0 ? " Next up:" : ""}</p>
            ) : (
              <ul className="flat px-3 py-1">
                {evOn(focus).map((e) => <EventRow key={e.id} e={e} onOpen={(x) => setEdit({ event: x })} />)}
                {taskOn(focus).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={(x) => setEdit({ task: x })} />)}
              </ul>
            )}
            {evOn(focus).length + taskOn(focus).length === 0 && nextEvents.length > 0 && (
              <ul className="flat mt-2 px-3 py-1">{nextEvents.map((e) => <li key={e.id} className="flex items-center gap-3 py-2.5 text-[13.5px]"><ModuleIcon id={e.module} size={24} /><button className="min-w-0 flex-1 truncate text-left" onClick={() => setFocus(e.date)}>{e.title}</button><span className="num text-[12px] text-muted">{pretty(e.date, { weekday: "short", day: "numeric" })}</span></li>)}</ul>
            )}
          </section>
        </div>
      </div>
      <div className={view === "month" ? "" : "max-md:hidden"}>
      {view === "day" ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <Widget title="Events" count={evOn(focus).length}>{evOn(focus).length ? <ul>{evOn(focus).map((e) => <EventRow key={e.id} e={e} onOpen={(x) => setEdit({ event: x })} />)}</ul> : <Empty>No events.</Empty>}</Widget>
          <Widget title="Tasks due" count={taskOn(focus).length}>{taskOn(focus).length ? <ul>{taskOn(focus).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={(x) => setEdit({ task: x })} />)}</ul> : <Empty>Nothing due.</Empty>}</Widget>
        </div>
      ) : (
        <Panel className="p-3 md:p-4">
          <div className={cx("grid gap-1.5", "grid-cols-7")} role="grid" aria-label="Calendar">
            {days.slice(0, 7).map((d) => <div key={d} role="columnheader" className="mono pb-1 text-center">{pretty(d, { weekday: "short" })}</div>)}
            {days.map((d) => {
              const ev = evOn(d), tk = taskOn(d);
              const inMonth = view === "week" || d.slice(0, 7) === focus.slice(0, 7);
              return (
                <button key={d} role="gridcell" onClick={() => { setFocus(d); const n = new URLSearchParams(sp); n.set("view", "day"); setSp(n, { replace: true }); }} aria-label={`${pretty(d, { weekday: "long", day: "numeric", month: "long" })}: ${ev.length} events, ${tk.length} tasks`} className={cx("flex min-h-[64px] flex-col items-start gap-1 rounded-[12px] p-1.5 text-left md:min-h-[96px] md:p-2", d === today ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "inset", !inMonth && "opacity-45")}>
                  <span className="num text-[13px] font-medium">{parse(d).getDate()}</span>
                  <span className="hidden w-full min-w-0 space-y-0.5 md:block">
                    {ev.slice(0, 2).map((e) => <span key={e.id} className="block truncate text-[11px] leading-tight">{e.startTime ? `${e.startTime} ` : ""}{e.title}</span>)}
                    {tk.slice(0, 2).map((t) => <span key={t.id} className="block truncate text-[11px] leading-tight opacity-70">☐ {t.title}</span>)}
                  </span>
                  <span className="mono mt-auto flex gap-1 md:hidden">{ev.length > 0 && <i className="size-1.5 rounded-full bg-current" />}{tk.length > 0 && <i className="size-1.5 rounded-[2px] border border-current" />}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      </div>
      <Widget title="Work rotation" tag={`${rot.onDays} on · ${rot.offDays} off`} className="mt-3"><SegBar ticks={rotTicks} label="Work rotation, next weeks" height={18} /></Widget>
      {edit && "task" in edit && <TaskEditor task={edit.task} onClose={() => setEdit(null)} />}
      {edit && !("task" in edit) && <EventEditor event={edit.event} defaultDate={edit.date} onClose={() => setEdit(null)} />}
    </div>
  );
}
