import { Check, ChevronDown, Plus, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { cycleLabel } from "../../shared/progress";
import { outstandingAction, STAGE_LABEL, STAGES } from "../../shared/procurement";
import { focusStats } from "../../shared/overview";
import type { ModuleId } from "../../shared/modules";
import { addDays, phaseWindow, rotationStatus, upcomingTravel } from "../../shared/rotation";
import { cx } from "../lib/cx";
import { post } from "../lib/api";
import { useData } from "../lib/data";
import { pretty, relative } from "../lib/dates";
import { byUrgency, isOpen, taskDetail } from "../lib/taskUi";
import type { CycleView, PartView, ProcItem, Stage, Task, TrackView } from "../lib/types";
import { ProcurementEditor, TaskEditor } from "./editors";
import { Card } from "./InstrumentCard";
import { DueChip } from "./mobile";
import { Btn, Empty, Status, Widget } from "./ui";
import { PartsBar, RadialGauge, RotationDial, SplitBar } from "./viz";
import { ShoppingCard } from "./ShoppingList";
import { TimeClockCard } from "./TimeClock";

const byDue = (a: Task, b: Task) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || (a.dueTime ?? "").localeCompare(b.dueTime ?? "") || byUrgency(a, b);
const STAGE_COLOR: Record<Stage, string> = { requested: "color-mix(in srgb, var(--ink) 22%, transparent)", ordered: "var(--w-butter)", in_transit: "var(--w-blue)", notified: "var(--g-sage)", received: "color-mix(in srgb, var(--g-sage) 45%, var(--tick-off))" };
const TRACK_FILL = ["var(--g-sage)", "var(--w-blue)", "var(--w-butter)"];
const Quiet = ({ children }: { children: string }) => <p className="py-1 text-[13px] opacity-70">{children}</p>;
const dowShort = (d: string) => pretty(d, { weekday: "short", month: "short", day: "numeric" });

function useWork(module: ModuleId) {
  const d = useData();
  const tasks = d.tasks.filter((t) => t.module === module);
  const tracks = d.progress.filter((t) => t.module === module);
  const items = d.procurement.filter((i) => i.module === module && !i.archivedAt);
  const toggle = (t: Task) => void (t.status === "completed" ? d.reopenTask(t.id) : d.completeTask(t.id));
  return { ...d, tasks, tracks, items, toggle };
}

/** The reporting period that is current: the first one not yet past (week ending Sunday), or the last when all are behind. */
function currentPeriod(cycle: CycleView, today: string): PartView | undefined {
  const periods = cycle.parts.filter((p) => p.kind === "period");
  return periods.find((p) => p.dueDate >= today) ?? periods[periods.length - 1];
}

// ---------- Overview: a graphical operational dashboard ----------

export function WorkOverview({ module }: { module: ModuleId }) {
  const { tasks, tracks, items, today, settings } = useWork(module);
  const [edit, setEdit] = useState<{ task?: Task; item?: ProcItem } | null>(null);
  const f = focusStats(tasks, today), totalToday = f.completed + f.remaining;
  const rot = rotationStatus(today, settings.work_rotation), cfg = settings.work_rotation, cycle = cfg.onDays + cfg.offDays;
  const dayIndex = rot.phase === "on" ? rot.dayInPhase - 1 : cfg.onDays + rot.dayInPhase - 1; // the same status the schedule and the recurring tasks use
  const win = phaseWindow(today, cfg), travel = upcomingTravel(today, cfg, 1)[0];
  const open = tasks.filter(isOpen);
  const deadlines = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 14)).sort(byDue).slice(0, 6);
  const active = items.filter((i) => i.status !== "received");
  const stageCounts = STAGES.map((s) => ({ s, n: items.filter((i) => i.status === s).length }));
  const linked = new Set(items.map((i) => i.notificationTaskId).filter(Boolean));
  const notifyRows = active.map((i) => ({ item: i, out: outstandingAction(i, i.status, today) })).filter((r) => r.out && (r.out.by || r.out.text.startsWith("Confirm the delivery date")));
  const looseDeliveries = open.filter((t) => t.topic === "delivery" && !linked.has(t.id));
  const monthly = tracks.map((t, i) => ({ t, c: t.cycles[0], fill: TRACK_FILL[i % TRACK_FILL.length] })).filter((x) => x.c);
  const weekDone = monthly.filter((m) => currentPeriod(m.c, today)?.done).length;
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-12 @[640px]:gap-3">
        <TimeClockCard className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-8" />
        <ShoppingCard className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-4" />
        <Card tone="butter" to="/tasks?module=progressive&h=today" label="Daily completion" aria={`Daily completion: ${f.completed} of ${totalToday} tasks, ${f.pct} percent`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
          <RadialGauge pct={f.pct} size={112} ink="var(--w-butter-on)" hatch="var(--w-butter-on)" fill="var(--w-butter-on)" className="mt-3" label={totalToday === 0 ? "No tasks due today" : `${f.pct} percent of today's tasks complete`} />
          <div className="mt-auto pt-2"><p className="num text-[26px] font-light leading-none tracking-tight">{totalToday === 0 ? "—" : <>{f.pct}<span className="text-[0.6em]">%</span></>}</p><p className="mt-1 text-[12.5px] opacity-75">{totalToday === 0 ? "Nothing due today" : `${f.completed} of ${totalToday} done${f.overdue ? ` · ${f.overdue} overdue` : ""}`}</p></div>
        </Card>
        <Card tone="blue" label="Work rotation" aria={`Work rotation: ${rot.phase === "on" ? "on" : "off"}, day ${rot.dayInPhase} of ${rot.phaseLength}`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
          <RotationDial cycle={cycle} onDays={cfg.onDays} dayIndex={dayIndex} size={112} ink="var(--w-on-blue)" accent="var(--w-blue-ink)" className="mt-3" label={`Rotation day ${dayIndex + 1} of ${cycle}`}>
            <div><p className="num text-[22px] font-light leading-none">{rot.dayInPhase}<span className="text-[0.55em] opacity-70">/{rot.phaseLength}</span></p></div>
          </RotationDial>
          <div className="mt-auto pt-2"><p className="text-[15px] font-medium leading-none">{rot.phase === "on" ? "On rotation" : "Off rotation"} · day {rot.dayInPhase} of {rot.phaseLength}</p><p className="mt-1 text-[12.5px] opacity-75">{rot.daysRemaining} {rot.daysRemaining === 1 ? "day" : "days"} remaining · {pretty(win.start, { day: "numeric", month: "short" })} – {pretty(win.end, { day: "numeric", month: "short" })}</p>{travel && <p className="mt-0.5 text-[12.5px] opacity-75">{travel.kind === "fly_home" ? "Fly home" : "Fly out"} {pretty(travel.date, { weekday: "short", day: "numeric", month: "short" })}{travel.confirmed ? "" : " · to confirm"}</p>}</div>
        </Card>
        {monthly.length === 0 ? (
          <Card tone="charcoal" label="KPI progress" className="col-span-2 min-h-[120px] @[640px]:col-span-12"><Quiet>Set up the REEF and RIPET KPI tracks in Settings to see them here.</Quiet></Card>
        ) : monthly.map(({ t, c, fill }) => (
          <Card key={t.key} tone="charcoal" to="/m/progressive?tab=progress" label={`${t.stream ?? t.title} KPIs`} aria={`${t.title}: ${c.progress.percent} percent for ${c.label}, ${c.progress.periodsDone} of ${c.progress.periodsTotal} reporting periods`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
            <RadialGauge pct={c.progress.percent} size={112} fill={fill} className="mt-3" label={`${t.title}: ${c.progress.percent} percent complete`} />
            <div className="mt-auto pt-2"><p className="num text-[26px] font-light leading-none tracking-tight">{c.progress.percent}<span className="text-[0.6em]">%</span></p><p className="mt-1 text-[12.5px] opacity-75">{c.progress.periodsDone} of {c.progress.periodsTotal} periods · {c.label.split(" ")[0]}</p></div>
          </Card>
        ))}
        <Card tone="charcoal" to="/m/progressive?tab=progress" label="Reporting progress" className="col-span-2 @[640px]:col-span-6">
          {monthly.length === 0 ? <Quiet>No reporting tracks yet.</Quiet> : (
            <div className="mt-3 space-y-3.5">
              {monthly.map(({ t, c }) => { const cur = currentPeriod(c, today); return (
                <div key={t.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]"><span>{t.stream ?? t.title} · {c.label.split(" ")[0]}</span><span className="num opacity-75">{c.parts.filter((p) => p.done).length} of {c.parts.length}</span></div>
                  <PartsBar parts={c.parts} label={`${t.title} ${c.label}: ${c.progress.percent} percent`} />
                  {cur && <p className="mt-1.5 text-[12px] opacity-70">This week · {cur.label.replace(/^Week ending /, "ending ")} · {cur.done ? "done" : cur.state === "overdue" ? "overdue" : `due ${relative(cur.dueDate, today)}`}</p>}
                </div>); })}
              <p className="text-[12px] opacity-70">Weekly: {weekDone} of {monthly.length} streams reported this week</p>
            </div>
          )}
        </Card>
        <Card tone="charcoal" to="/m/progressive?tab=procurement" label="Procurement pipeline" className="col-span-2 @[640px]:col-span-6">
          <SplitBar className="mt-4" height={12} parts={stageCounts.map(({ s, n }) => ({ value: n, color: STAGE_COLOR[s] }))} label={`${items.length} procurement items by stage`} />
          <ul className="mt-3 grid grid-cols-5 gap-1 text-center">
            {stageCounts.map(({ s, n }) => <li key={s}><p className="num text-[20px] font-light leading-none">{n}</p><p className="mt-1 text-[10.5px] leading-tight opacity-70">{STAGE_LABEL[s]}</p></li>)}
          </ul>
          <p className="mt-3 text-[12.5px] opacity-75">{active.length === 0 ? "Nothing outstanding" : `${active.length} outstanding · ${notifyRows.length} need a REEF notification`}</p>
        </Card>
        <Card tone="charcoal" label="Upcoming deadlines" className="col-span-2 @[640px]:col-span-6">
          {deadlines.length === 0 ? <Quiet>Nothing due in the next two weeks.</Quiet> : (
            <ul className="mt-2">{deadlines.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 border-t border-line py-0.5 first:border-t-0">
                <button onClick={() => setEdit({ task: t })} className="hit min-w-0 flex-1 py-1.5 text-left md:!min-h-0"><span className="block truncate text-[14px]">{t.title}</span>{taskDetail(t) && <span className="mono block truncate !normal-case !tracking-normal">{taskDetail(t)}</span>}</button>
                <DueChip t={t} today={today} />
              </li>))}</ul>
          )}
        </Card>
        <Card tone="charcoal" to="/m/progressive?tab=procurement" label="Delivery notifications" className="col-span-2 @[640px]:col-span-6">
          {notifyRows.length === 0 && looseDeliveries.length === 0 ? <Quiet>No notifications waiting.</Quiet> : (
            <ul className="mt-2">
              {notifyRows.slice(0, 5).map(({ item, out }) => (
                <li key={item.id} className="flex items-center gap-2.5 border-t border-line py-2 first:border-t-0">
                  <Truck size={15} strokeWidth={1.5} className="shrink-0 opacity-60" aria-hidden />
                  <div className="min-w-0 flex-1"><p className="truncate text-[14px]">{item.material}</p><p className="mono truncate !normal-case !tracking-normal">{item.expectedDate ? `Arrives ${dowShort(item.expectedDate)}` : "No date yet"}{item.supplier ? ` · ${item.supplier}` : ""}</p></div>
                  <Status tone={out!.tone === "bad" ? "bad" : out!.tone === "warn" ? "lime" : "neutral"}>{out!.by ? `Notify ${relative(out!.by, today)}` : "Needs date"}</Status>
                </li>))}
              {looseDeliveries.slice(0, 3).map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 border-t border-line py-2 first:border-t-0">
                  <Truck size={15} strokeWidth={1.5} className="shrink-0 opacity-60" aria-hidden />
                  <button onClick={() => setEdit({ task: t })} className="hit min-w-0 flex-1 text-left md:!min-h-0"><span className="block truncate text-[14px]">{t.title}</span></button>
                  {t.dueDate ? <Status tone={t.dueDate < today ? "bad" : "neutral"}>{`Notify ${relative(t.dueDate, today)}`}</Status> : <Status tone="lime">Needs date</Status>}
                </li>))}
            </ul>
          )}
        </Card>
      </div>
      {edit?.task && <TaskEditor task={edit.task} onClose={() => setEdit(null)} />}
      {edit?.item && <ProcurementEditor item={edit.item} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ---------- Progress: deliverables made of reporting periods and final steps ----------

function PartRow({ track, cycle, part, parts, today, busy, onAct }: { track: TrackView; cycle: CycleView; part: PartView; parts: PartView[]; today: string; busy: boolean; onAct: (p: PartView) => void }) {
  const blockers = part.kind === "step" ? parts.filter((p) => p.key !== part.key && !p.done && (p.kind === "period" || (part.key === "submit" && p.kind === "step"))) : [];
  const locked = !part.done && blockers.length > 0;
  const tone = part.state === "overdue" ? "text-red" : part.state === "due" ? "" : "text-muted";
  void track; void cycle;
  return (
    <li className="flex items-center gap-2.5 border-t border-line py-0.5 first:border-t-0">
      <button onClick={() => onAct(part)} disabled={busy || locked} aria-pressed={part.done} aria-label={`${part.done ? "Reopen" : "Mark done"}: ${part.label}`} title={locked ? "Finish the earlier parts first" : undefined} className="hit press grid shrink-0 place-items-center disabled:opacity-40">
        <span className={cx("grid size-7 place-items-center rounded-full transition-colors duration-200", part.done ? "bg-ink text-[var(--card-a)]" : "inset text-transparent")}><Check size={14} strokeWidth={2.6} aria-hidden /></span>
      </button>
      <div className="min-w-0 flex-1 py-1.5"><p className={cx("truncate text-[14px]", part.done && "text-muted line-through")}>{part.label}</p>{part.viaTask && <p className="mono !normal-case !tracking-normal">Completed through its weekly task</p>}</div>
      <span className={cx("mono shrink-0 !normal-case", tone)}>{part.done ? "Done" : part.kind === "step" ? `Due ${dowShort(part.dueDate)}` : part.state === "overdue" ? "Overdue" : relative(part.dueDate, today)}</span>
    </li>
  );
}

function TrackCard({ track, fill }: { track: TrackView; fill: string }) {
  const { today, mutate } = useData();
  const [sel, setSel] = useState(track.cycles[0]?.cycle);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cycle = track.cycles.find((c) => c.cycle === sel) ?? track.cycles[0];
  const act = async (p: PartView) => {
    setBusy(true); setErr(null);
    const r = await mutate(() => post(`/progress/${p.done ? "reopen" : "complete"}`, { track: track.key, cycle: cycle.cycle, part: p.key, today }));
    setBusy(false);
    if (r && !r.success) setErr(r.error.message);
  };
  if (!cycle) return null;
  const pr = cycle.progress;
  return (
    <Widget title={track.title} tag={cycle.label} className="!p-4">
      <div className="flex items-center gap-4">
        <RadialGauge pct={pr.percent} size={104} fill={fill} label={`${track.title} ${cycle.label}: ${pr.percent} percent`} />
        <div className="min-w-0">
          <p className="num text-[34px] font-extralight leading-none tracking-tight">{pr.percent}<span className="text-[0.55em]">%</span></p>
          <p className="mt-1.5 text-[13px] text-muted">{pr.periodsDone} of {pr.periodsTotal} reporting periods</p>
          <p className="text-[13px] text-muted">{pr.stepsDone} of {pr.stepsTotal} final steps · due {dowShort(cycle.dueDate)}</p>
          {pr.complete && <div className="mt-2"><Status tone="ok">Submitted</Status></div>}
        </div>
      </div>
      <PartsBar className="mt-4" parts={cycle.parts} label={`${cycle.parts.filter((p) => p.done).length} of ${cycle.parts.length} parts done`} />
      {err && <p role="alert" className="mt-2 text-[12.5px] text-red">{err}</p>}
      <p className="mono mb-0.5 mt-4">Reporting periods</p>
      <ul>{cycle.parts.filter((p) => p.kind === "period").map((p) => <PartRow key={p.id} track={track} cycle={cycle} part={p} parts={cycle.parts} today={today} busy={busy} onAct={act} />)}</ul>
      <p className="mono mb-0.5 mt-4">Monthly verification and submission</p>
      <ul>{cycle.parts.filter((p) => p.kind === "step").map((p) => <PartRow key={p.id} track={track} cycle={cycle} part={p} parts={cycle.parts} today={today} busy={busy} onAct={act} />)}</ul>
      {track.cycles.length > 1 && (
        <>
          <p className="mono mb-1 mt-4">History</p>
          <ul>{track.cycles.map((c) => (
            <li key={c.cycle} className="border-t border-line first:border-t-0">
              <button onClick={() => setSel(c.cycle)} aria-current={c.cycle === cycle.cycle ? "true" : undefined} className={cx("hit flex w-full items-center gap-3 py-1.5 text-left md:!min-h-0 md:py-2", c.cycle === cycle.cycle && "font-medium")}>
                <span className="w-[112px] shrink-0 truncate text-[13.5px]">{cycleLabel(c.cycle)}</span>
                <SplitBar className="min-w-0 flex-1" height={6} parts={[{ value: c.progress.percent, color: fill }]} label={`${c.progress.percent} percent`} />
                <span className="num w-10 shrink-0 text-right text-[12.5px] text-muted">{c.progress.percent}%</span>
              </button>
            </li>))}</ul>
        </>
      )}
    </Widget>
  );
}

export function ProgressView({ module }: { module: ModuleId }) {
  const { tracks, loading } = useWork(module);
  if (loading && tracks.length === 0) return <Empty>Loading…</Empty>;
  if (tracks.length === 0) return <Widget title="Progress"><Empty>No deliverable tracks yet. Use "Set up Work recurring tasks" in Settings to add the REEF and RIPET KPI tracks.</Empty></Widget>;
  return (
    <div className="@container">
      <p className="mono mb-3 !normal-case !tracking-normal">Each month is made of its actual reporting periods plus a final verification and submission. Completing a weekly KPI task completes its period automatically.</p>
      <div className="grid gap-3 @[960px]:grid-cols-2">{tracks.map((t, i) => <TrackCard key={t.key} track={t} fill={TRACK_FILL[i % TRACK_FILL.length]} />)}</div>
    </div>
  );
}

// ---------- Procurement: request to receipt ----------

export function ProcurementView({ module }: { module: ModuleId }) {
  const { items, today } = useWork(module);
  const [edit, setEdit] = useState<{ item?: ProcItem } | null>(null);
  const [stage, setStage] = useState<Stage | "all">("all");
  const [showReceived, setShowReceived] = useState(false);
  const counts = STAGES.map((s) => ({ s, n: items.filter((i) => i.status === s).length }));
  const shown = useMemo(() => items.filter((i) => stage === "all" ? i.status !== "received" || showReceived : i.status === stage), [items, stage, showReceived]);
  const groups = STAGES.map((s) => ({ s, rows: shown.filter((i) => i.status === s).sort((a, b) => (a.expectedDate ?? "9").localeCompare(b.expectedDate ?? "9")) })).filter((g) => g.rows.length);
  return (
    <div className="@container">
      <div data-cascade className="panel mb-3 p-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-medium tracking-tight">Pipeline</h2><Btn variant="primary" icon={Plus} onClick={() => setEdit({})}>New request</Btn></div>
        <SplitBar className="mt-3" height={12} parts={counts.map(({ s, n }) => ({ value: n, color: STAGE_COLOR[s] }))} label={`${items.length} items by stage`} />
        <ul className="mt-3 grid grid-cols-5 gap-1">
          {counts.map(({ s, n }) => (
            <li key={s}><button onClick={() => setStage(stage === s ? "all" : s)} aria-pressed={stage === s} className={cx("hit press w-full rounded-xl px-1 py-1.5 text-center md:!min-h-0", stage === s && "bg-[var(--card-dim)]")}><span className="num block text-[20px] font-light leading-none">{n}</span><span className="mt-1 block text-[10.5px] leading-tight text-muted">{STAGE_LABEL[s]}</span></button></li>
          ))}
        </ul>
      </div>
      {groups.length === 0 ? <Widget title="Procurement"><Empty>No procurement items{stage !== "all" ? " in this stage" : " yet"}. Datum adds them from email summaries, or add a request yourself.</Empty></Widget> : (
        <div className="space-y-3">
          {groups.map(({ s, rows }) => (
            <Widget key={s} title={STAGE_LABEL[s]} count={rows.length}>
              <ul>{rows.map((i) => { const out = outstandingAction(i, i.status, today); return (
                <li key={i.id} className="border-t border-line first:border-t-0">
                  <button onClick={() => setEdit({ item: i })} className="hit flex w-full items-center gap-3 py-2 text-left md:py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[14.5px] leading-snug">{i.material}</p>
                      <p className="mono mt-0.5 truncate !normal-case !tracking-normal">{[i.quantity != null ? `${i.quantity}${i.unit ? " " + i.unit : ""}` : null, i.supplier, i.orderRef].filter(Boolean).join(" · ") || "No details yet"}</p>
                      {out && <p className={cx("mt-0.5 truncate text-[12.5px]", out.tone === "bad" ? "text-red" : "text-muted")}>{out.text}</p>}
                    </div>
                    <div className="shrink-0 text-right">{i.expectedDate ? <Status tone="neutral">{`${relative(i.expectedDate, today)}${i.expectedTime ? " " + i.expectedTime : ""}`}</Status> : <Status tone="idle">No date</Status>}</div>
                  </button>
                </li>); })}</ul>
            </Widget>
          ))}
        </div>
      )}
      {stage === "all" && counts.find((c) => c.s === "received")!.n > 0 && (
        <button onClick={() => setShowReceived((x) => !x)} aria-expanded={showReceived} className="hit mono mt-3 inline-flex items-center gap-1 !normal-case">{showReceived ? "Hide" : "Show"} received ({counts.find((c) => c.s === "received")!.n})<ChevronDown size={13} className={cx("transition-transform", showReceived && "rotate-180")} aria-hidden /></button>
      )}
      {edit && <ProcurementEditor item={edit.item} onClose={() => setEdit(null)} />}
    </div>
  );
}
