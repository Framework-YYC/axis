import { ChevronDown, Truck } from "lucide-react";
import { useState } from "react";
import { describeRecurrence } from "../../shared/recurrence";
import { addDays, rotationStatus } from "../../shared/rotation";
import { TOPIC_LABEL, type Topic } from "../../shared/taskTypes";
import type { ModuleId } from "../../shared/modules";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { pretty, relative } from "../lib/dates";
import { byUrgency, isOpen } from "../lib/taskUi";
import { useApi } from "../lib/useApi";
import type { CalEvent, Task } from "../lib/types";
import { TaskEditor } from "./editors";
import { TaskLine } from "./TaskLine";
import { Collapse } from "../lib/motion";
import { Empty, Status, Widget } from "./ui";

const topicLabel = (t: Task) => (t.topic ? TOPIC_LABEL[t.topic as Topic] ?? t.topic : null);
const byDue = (a: Task, b: Task) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || (a.dueTime ?? "").localeCompare(b.dueTime ?? "") || byUrgency(a, b);

/** The one-line detail under a task: delivery arrival and notify-by, or topic and source. Facts only. */
export function taskDetail(t: Task, today: string): string | undefined {
  const bits: string[] = [];
  if (t.topic === "delivery") {
    bits.push(t.relatedDate ? `Arrives ${pretty(t.relatedDate)}${t.relatedTime ? ` ${t.relatedTime}` : ""}` : "Arrival date not confirmed");
    if (t.supplier) bits.push(t.supplier);
  } else {
    const l = topicLabel(t); if (l) bits.push(l);
  }
  if (t.recurrence) bits.push(describeRecurrence(t.recurrence));
  void today;
  return bits.length ? bits.join(" · ") : undefined;
}

const Quiet = ({ children }: { children: string }) => <p className="py-1 text-[13px] text-muted">{children}</p>;

function TaskList({ tasks, today, onToggle, onOpen, limit }: { tasks: Task[]; today: string; onToggle: (t: Task) => void; onOpen: (t: Task) => void; limit?: number }) {
  return <ul>{tasks.slice(0, limit).map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={onToggle} onOpen={onOpen} showModule={false} compact detail={taskDetail(t, today)} />)}</ul>;
}

// ---------- shared plumbing ----------

function useWork(module: ModuleId) {
  const d = useData();
  const mt = d.tasks.filter((t) => t.module === module);
  const open = mt.filter(isOpen);
  const toggle = (t: Task) => void (t.status === "completed" ? d.reopenTask(t.id) : d.completeTask(t.id));
  return { ...d, mt, open, toggle };
}

// ---------- Action items ----------

export function ActionItemsView({ module }: { module: ModuleId }) {
  const { open, mt, today, toggle } = useWork(module);
  const [edit, setEdit] = useState<Task | null>(null);
  const items = open.filter((t) => t.type === "action_item");
  const deliveries = items.filter((t) => t.topic === "delivery").sort(byDue);
  const rest = items.filter((t) => t.topic !== "delivery").sort(byDue);
  const topics = [...new Set(rest.map((t) => t.topic ?? "other"))] as string[];
  const closed = mt.filter((t) => t.type === "action_item" && t.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 8);
  return (
    <div className="space-y-3">
      <p className="mono !normal-case !tracking-normal">Tasks your assistants identified from email summaries and conversations. Repeating a review never duplicates them, and anything you complete stays completed.</p>
      {items.length === 0 && <Widget title="Action items"><Empty>No open action items. Your assistant adds them when an email asks something of you.</Empty></Widget>}
      {deliveries.length > 0 && (
        <Widget title="Incoming deliveries" count={deliveries.length} tag="Notify REEF 24 h ahead"><TaskList tasks={deliveries} today={today} onToggle={toggle} onOpen={setEdit} /></Widget>
      )}
      <div className="grid gap-3 @[960px]:grid-cols-2">
        {topics.map((k) => (
          <Widget key={k} title={TOPIC_LABEL[k as Topic] ?? "Other"} count={rest.filter((t) => (t.topic ?? "other") === k).length}>
            <TaskList tasks={rest.filter((t) => (t.topic ?? "other") === k)} today={today} onToggle={toggle} onOpen={setEdit} />
          </Widget>
        ))}
      </div>
      {closed.length > 0 && <Widget title="Recently completed" tag="Last 14 days"><TaskList tasks={closed} today={today} onToggle={toggle} onOpen={setEdit} /></Widget>}
      {edit && <TaskEditor task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ---------- Recurring ----------

interface Series { key: string; next: Task | null; latest: Task; done: Task[] }

export function RecurringView({ module }: { module: ModuleId }) {
  const { tasks, today, toggle } = useWork(module);
  const [edit, setEdit] = useState<Task | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const hist = useApi<{ tasks: Task[] }>(`/tasks/completed?module=${module}&since=${addDays(today, -180)}&limit=500&today=${today}`, tasks.length);
  const all = new Map<string, Task>();
  for (const t of [...(hist.data?.tasks ?? []), ...tasks]) if (t.module === module && t.recurrence) all.set(t.id, t);
  const groups = new Map<string, Task[]>();
  for (const t of all.values()) { const k = t.recurrenceParentId ?? t.id; groups.set(k, [...(groups.get(k) ?? []), t]); }
  const series: Series[] = [...groups.entries()].map(([key, ts]) => {
    const openOne = ts.filter(isOpen).sort(byDue)[0] ?? null;
    const done = ts.filter((t) => t.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return { key, next: openOne, latest: openOne ?? done[0], done };
  }).filter((s) => s.latest && !s.latest.archivedAt).sort((a, b) => (a.next?.dueDate ?? "9").localeCompare(b.next?.dueDate ?? "9") || a.latest.title.localeCompare(b.latest.title));
  return (
    <div className="space-y-3">
      <p className="mono !normal-case !tracking-normal">Responsibilities that repeat. Completing one occurrence schedules the next, never twice; the history of every completion is kept.</p>
      {series.length === 0 ? <Widget title="Recurring tasks"><Empty>No recurring tasks in this module yet.</Empty></Widget> : (
        <div className="grid gap-3 @[960px]:grid-cols-2">
          {series.map((s) => (
            <Widget key={s.key} title={s.latest.title} tag={s.latest.recurrence ? describeRecurrence(s.latest.recurrence) : undefined} className="!p-3.5">
              {s.next ? <ul><TaskLine t={s.next} today={today} onToggle={toggle} onOpen={setEdit} showModule={false} compact detail={`Next ${pretty(s.next.dueDate ?? today)} · ${relative(s.next.dueDate ?? today, today)}`} /></ul> : <Quiet>Series ended. No further occurrences.</Quiet>}
              <button onClick={() => setShown(shown === s.key ? null : s.key)} aria-expanded={shown === s.key} className="hit mono mt-1 inline-flex items-center gap-1 self-start !normal-case md:!min-h-0">
                History · {s.done.length} completed{s.done[0]?.completedAt ? ` · last ${pretty(s.done[0].completedAt.slice(0, 10))}` : ""}
                <ChevronDown size={13} className={cx("transition-transform", shown === s.key && "rotate-180")} aria-hidden />
              </button>
              <Collapse open={shown === s.key}>
                {s.done.length === 0 ? <Quiet>No completions yet.</Quiet> : <ul className="text-[13px]">{s.done.slice(0, 12).map((t) => <li key={t.id} className="flex justify-between gap-3 border-t border-line py-1.5 first:border-t-0"><span>{t.dueDate ? `Due ${pretty(t.dueDate)}` : "Completed"}</span><span className="mono !normal-case">done {t.completedAt ? pretty(t.completedAt.slice(0, 10)) : ""}</span></li>)}</ul>}
              </Collapse>
            </Widget>
          ))}
        </div>
      )}
      {edit && <TaskEditor task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ---------- Work overview: the operational command centre ----------

export function WorkOverview({ module }: { module: ModuleId }) {
  const { open, today, toggle, events, settings } = useWork(module);
  const [edit, setEdit] = useState<Task | null>(null);
  const rot = rotationStatus(today, settings.work_rotation);
  const dueNow = open.filter((t) => t.dueDate && t.dueDate <= today).sort(byDue);
  const overdue = dueNow.filter((t) => t.dueDate! < today).length;
  const actions = open.filter((t) => t.type === "action_item" && t.topic !== "delivery").sort(byDue);
  const deliveries = open.filter((t) => t.topic === "delivery").sort((a, b) => (a.dueDate ? 1 : 0) - (b.dueDate ? 1 : 0) || byDue(a, b));
  const notifySoon = deliveries.filter((t) => !t.dueDate || t.dueDate <= addDays(today, 2)).length;
  const recurring = open.filter((t) => t.type === "recurring" && t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 14)).sort(byDue);
  const manual = open.filter((t) => t.type === "manual" && !(t.dueDate && t.dueDate <= today)).sort(byDue);
  const ev: CalEvent[] = events.filter((e) => e.module === module && e.status === "scheduled" && e.date >= today && e.date <= addDays(today, 14)).slice(0, 5);
  const tiles: Array<[string, number, boolean]> = [["Due today", dueNow.length - overdue, false], ["Overdue", overdue, overdue > 0], ["Notify soon", notifySoon, notifySoon > 0], ["Action items", actions.length, false]];
  return (
    <div className="stagger space-y-3">
      <div className="stagger grid grid-cols-2 gap-3 @[640px]:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]">
        {tiles.map(([l, n, hot]) => <div key={l} className="panel p-3.5"><p className="mono">{l}</p><p className={cx("num mt-1 text-[30px] font-extralight leading-none", hot && "text-red")}>{n}</p></div>)}
        <div className="panel col-span-2 flex items-center justify-between gap-3 p-3.5 @[640px]:col-span-1">
          <div><p className="mono">Rotation</p><p className="mt-1 text-[15px] font-medium">{rot.phase === "on" ? "On" : "Off"} · day {rot.dayInPhase} of {rot.phaseLength}</p></div>
          <Status tone={rot.phase === "on" ? "ok" : "idle"}>{rot.phase === "on" ? `${rot.daysRemaining} to go` : `back ${pretty(rot.nextChange)}`}</Status>
        </div>
      </div>
      <div className="grid gap-3 @[960px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="stagger space-y-3">
          <Widget title="Today's responsibilities" count={dueNow.length}>
            {dueNow.length === 0 ? <Quiet>Nothing due today. Next up is below.</Quiet> : <TaskList tasks={dueNow} today={today} onToggle={toggle} onOpen={setEdit} limit={8} />}
          </Widget>
          <Widget title="Action items" count={actions.length} action={<ViewAll tab="actions" />}>
            {actions.length === 0 ? <Quiet>No open action items.</Quiet> : <TaskList tasks={actions} today={today} onToggle={toggle} onOpen={setEdit} limit={5} />}
          </Widget>
          <Widget title="Manual tasks" count={manual.length} action={<ViewAll tab="tasks" />}>
            {manual.length === 0 ? <Quiet>No other outstanding tasks.</Quiet> : <TaskList tasks={manual} today={today} onToggle={toggle} onOpen={setEdit} limit={5} />}
          </Widget>
        </div>
        <div className="stagger space-y-3">
          <Widget title="Incoming deliveries" count={deliveries.length} tag="Notify 24 h ahead">
            {deliveries.length === 0 ? <Quiet>No deliveries to notify.</Quiet> : (
              <ul>{deliveries.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 border-t border-line py-2 first:border-t-0">
                  <Truck size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <button onClick={() => setEdit(t)} className="hit min-w-0 flex-1 text-left md:!min-h-0"><span className="line-clamp-2 text-[14px]">{t.title}</span><span className="mono mt-0.5 block truncate !normal-case !tracking-normal">{taskDetail(t, today)}</span></button>
                  {t.dueDate ? <Status tone={t.dueDate < today ? "bad" : "neutral"}>{`Notify ${relative(t.dueDate, today)}${t.dueTime ? ` ${t.dueTime}` : ""}`}</Status> : <Status tone="lime">Needs date</Status>}
                </li>))}</ul>
            )}
          </Widget>
          <Widget title="Upcoming recurring" count={recurring.length} action={<ViewAll tab="recurring" />}>
            {recurring.length === 0 ? <Quiet>No recurring deadlines in the next two weeks.</Quiet> : (
              <ul>{recurring.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-t border-line py-1 text-[13.5px] first:border-t-0 md:py-1.5">
                  <span className="mono w-[74px] shrink-0">{pretty(t.dueDate!)}</span>
                  <button onClick={() => setEdit(t)} className="hit min-w-0 flex-1 truncate text-left md:!min-h-0">{t.title}</button>
                </li>))}</ul>
            )}
          </Widget>
          <Widget title="Meetings and events">
            {ev.length === 0 ? <Quiet>No events in the next two weeks.</Quiet> : <ul>{ev.map((e) => <li key={e.id} className="flex items-center gap-3 border-t border-line py-2 text-[13.5px] first:border-t-0"><span className="mono w-[74px] shrink-0">{pretty(e.date)}</span><span className="min-w-0 flex-1 truncate">{e.title}</span>{e.startTime && <span className="mono">{e.startTime}</span>}</li>)}</ul>}
          </Widget>
        </div>
      </div>
      {edit && <TaskEditor task={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

import { useSearchParams } from "react-router-dom";
function ViewAll({ tab }: { tab: string }) {
  const [, setSp] = useSearchParams();
  return <button onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set("tab", tab); return n; }, { replace: true })} className="hit mono !normal-case underline-offset-2 hover:underline md:!min-h-0">View all</button>;
}
