import { CalendarClock, ChevronLeft, ChevronRight, Clock3, Coffee, Pencil, Plus, Square } from "lucide-react";
import { useState } from "react";
import { clockTime, dayTotals, fmtDecimal, fmtHM, fmtHMS, fromLocalInput, jobLabel, nextDay, startOfDay, toLocalInput, weekStartOf, weekTotals, type PunchAction, type TimeJob } from "../../shared/timeclock";
import { cx } from "../lib/cx";
import { pretty } from "../lib/dates";
import { dayBefore, useTimeclock } from "../lib/timeclock";
import { useNow } from "../lib/useNow";
import { Field, FormError, Modal, Select, TextInput } from "./forms";
import { Card } from "./InstrumentCard";
import { Btn, Empty, Segmented } from "./ui";
import { SplitBar } from "./viz";

const JOB_COLORS = ["var(--g-sage)", "var(--w-blue-ink)", "var(--w-butter-on)", "var(--w-terra)", "var(--muted)"];
type Clock = ReturnType<typeof useTimeclock>;

/** The status in words (colour never carries it alone). */
function statusOf(c: Clock) {
  const o = c.clock?.open;
  if (!o) return { text: "Off shift", tone: "off" as const };
  return o.kind === "break" ? { text: "On break", tone: "break" as const } : { text: "On shift", tone: "on" as const };
}

type Tab = "history" | "week" | "jobs" | "schedule";
/** Quick punching between jobs, directly on Work Overview. The server keeps the timestamps, so tracking continues when Orbis is closed. */
export function TimeClockCard({ className }: { className?: string }) {
  const c = useTimeclock();
  const [sheet, setSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState<Tab>("history");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const open = c.clock?.open ?? null;
  const now = useNow(open ? 1000 : 60_000);
  const nowMs = now.getTime();
  const jobs = (c.clock?.jobs ?? []).filter((j) => j.active);
  const byId = new Map((c.clock?.jobs ?? []).map((j) => [j.id, j]));
  const today = c.clock ? dayTotals(c.clock.entries, c.today, c.today, nowMs, c.tz)[0] : null;
  const st = statusOf(c);
  const busy = c.pending?.status === "saving";
  const runningLabel = open ? (open.kind === "break" ? `Break · back to ${jobLabel(byId.get(open.resumeJobId ?? ""))}` : jobLabel(byId.get(open.jobId ?? ""))) : "No job running";
  const entries = Object.entries(today?.byJob ?? {});
  const punchBtn = "hit press flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-[16px] px-3 text-[15px] font-medium disabled:opacity-60";
  const go = (a: PunchAction, id: string | null, label: string) => { setConfirmEnd(false); void c.tap(a, id, label); };
  return (
    <Card tone="charcoal" label="Time clock" aria={`Time clock: ${st.text}. ${runningLabel}`} className={cx("min-h-[220px]", className)}>
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <span className="pill">{st.text}</span>
        <button onClick={() => { setSheetTab("history"); setSheet(true); }} className="hit press inline-flex items-center gap-1.5 rounded-full px-3 text-[12.5px] text-muted" style={{ boxShadow: "0 0 0 1px var(--line)" }}><Pencil size={13} aria-hidden />History</button>
      </div>

      {(c.pending?.status === "failed" || c.loadError) && (
        <div role="alert" className="mt-11 rounded-[14px] p-3 text-[13px]" style={{ boxShadow: "0 0 0 1.5px var(--w-terra)" }}>
          {c.pending?.status === "failed" && (
            <>
              <p className="font-medium" style={{ color: "var(--w-terra)" }}>Not saved: {c.pending.label} at {clockTime(c.pending.at, c.tz)}</p>
              <p className="mt-0.5 opacity-80">{c.pending.message}</p>
              <div className="mt-2 flex gap-2">{c.pending.retryable !== false && <Btn variant="primary" onClick={c.retry}>Retry (keeps {clockTime(c.pending.at, c.tz)})</Btn>}<Btn onClick={c.discard}>Discard</Btn></div>
            </>
          )}
          {c.loadError && c.pending?.status !== "failed" && <p>{c.loadError}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="num text-[44px] font-extralight leading-none tracking-tight" aria-live="off" aria-label={open ? `Elapsed ${fmtHM(nowMs - Date.parse(open.startAt))}` : "Not running"}>{open ? fmtHMS(nowMs - Date.parse(open.startAt)) : "0:00:00"}</p>
          <p className="mt-1.5 truncate text-[15px]">{runningLabel}</p>
          <p className="text-[12.5px] opacity-70">{open ? `since ${clockTime(open.startAt, c.tz)}${open.source === "scheduled" ? " · scheduled clock-in" : ""}` : c.clock ? "Tap a job to start" : "Loading…"}{busy ? " · saving…" : ""}</p>
        </div>
        <div className="text-right">
          <p className="num text-[26px] font-light leading-none">{today ? fmtHM(today.workMs) : "–"}</p>
          <p className="mt-1 text-[12.5px] opacity-70">worked today{today && today.breakMs > 0 ? ` · ${fmtHM(today.breakMs)} break` : ""}</p>
        </div>
      </div>

      {entries.length > 0 && today && (
        <div className="mt-3">
          <SplitBar height={8} parts={entries.map(([, ms], i) => ({ value: ms, color: JOB_COLORS[i % JOB_COLORS.length] }))} label={`Today by job: ${entries.map(([id, ms]) => `${jobLabel(byId.get(id))} ${fmtHM(ms)}`).join(", ")}`} />
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">{entries.map(([id, ms], i) => <li key={id} className="flex items-center gap-1.5"><i aria-hidden className="size-2 rounded-full" style={{ background: JOB_COLORS[i % JOB_COLORS.length] }} />{jobLabel(byId.get(id))} <span className="num opacity-80">{fmtHM(ms)}</span></li>)}</ul>
        </div>
      )}

      <div className="mt-3 flex gap-2" role="group" aria-label="Jobs">
        {jobs.map((j) => {
          const active = open?.kind === "job" && open.jobId === j.id;
          return (
            <button key={j.id} aria-pressed={active} disabled={busy || !c.clock} onClick={() => go("job", j.id, `switch to ${jobLabel(j)}`)} className={cx(punchBtn, active ? "bg-[var(--orbis-lime)] text-[var(--orbis-forest)]" : "inset")}>
              <span>{j.name}{j.number ? ` — ${j.number}` : ""}</span><span className="text-[11px] font-normal opacity-70">{active ? "Running" : "Tap to switch"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {open?.kind === "break"
          ? <button disabled={busy} onClick={() => go("resume", null, "resume")} className={cx(punchBtn, "bg-[var(--orbis-lime)] text-[var(--orbis-forest)] min-h-[48px]")}><span className="inline-flex items-center gap-2"><Clock3 size={16} aria-hidden />Resume</span></button>
          : <button disabled={busy || !open} onClick={() => go("break", null, "start break")} className={cx(punchBtn, "inset min-h-[48px]")}><span className="inline-flex items-center gap-2"><Coffee size={16} aria-hidden />Break</span></button>}
        {confirmEnd
          ? <div className="flex flex-1 gap-2"><button disabled={busy} onClick={() => go("end", null, "end shift")} className={cx(punchBtn, "min-h-[48px] text-white")} style={{ background: "var(--w-terra)" }}>End shift now</button><button onClick={() => setConfirmEnd(false)} className="hit press rounded-[16px] px-3 text-[13px]">Cancel</button></div>
          : <button disabled={busy || !open} onClick={() => setConfirmEnd(true)} className={cx(punchBtn, "inset min-h-[48px]")}><span className="inline-flex items-center gap-2"><Square size={14} aria-hidden />End shift</span></button>}
      </div>
      {c.notice && <p role="status" className="mt-2 text-[12.5px] opacity-80">{c.notice}</p>}
      {c.clock && <ScheduleLine c={c} open={!!open} onSettings={() => { setSheetTab("schedule"); setSheet(true); }} />}
      {sheet && <TimeClockSheet c={c} initial={sheetTab} onClose={() => { setSheet(false); setSheetTab("history"); }} />}
    </Card>
  );
}

function TimeClockSheet({ c, initial, onClose }: { c: Clock; initial: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <Modal title="Time clock" onClose={onClose} wide>
      <div className="mb-4"><Segmented label="Time clock sections" value={tab} onChange={setTab} options={[{ value: "history", label: "Punch history" }, { value: "week", label: "Weekly totals" }, { value: "jobs", label: "Jobs" }, { value: "schedule", label: "Schedule" }]} /></div>
      {!c.clock ? <Empty>{c.loadError ?? "Loading…"}</Empty> : tab === "history" ? <History c={c} /> : tab === "week" ? <Week c={c} /> : tab === "jobs" ? <Jobs c={c} /> : <Schedule c={c} />}
    </Modal>
  );
}

function History({ c }: { c: Clock }) {
  const [day, setDay] = useState(c.today);
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const clock = c.clock!;
  const now = useNow(1000).getTime();
  const byId = new Map(clock.jobs.map((j) => [j.id, j]));
  const lo = startOfDay(day, c.tz), hi = startOfDay(nextDay(day), c.tz);
  const list = clock.entries.filter((e) => Date.parse(e.startAt) < hi && (e.endAt ? Date.parse(e.endAt) : Infinity) > lo);
  const total = dayTotals(clock.entries, day, day, now, c.tz)[0];
  const go = (d: string) => { setDay(d); if (d < c.from) c.setFrom(dayBefore(d)); };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Btn variant="soft" icon={ChevronLeft} label="Previous day" onClick={() => go(dayBefore(day))} />
        <p className="min-w-0 flex-1 text-center text-[14px] font-medium">{day === c.today ? "Today · " : ""}{pretty(day, { weekday: "long", day: "numeric", month: "long" })}</p>
        <Btn variant="soft" icon={ChevronRight} label="Next day" onClick={() => go(nextDay(day))} disabled={day >= c.today} />
      </div>
      <p className="mb-2 text-[13px] text-muted">{total.workMs > 0 || total.breakMs > 0 ? <>Worked <b className="num text-ink">{fmtHM(total.workMs)}</b> ({fmtDecimal(total.workMs)} h){total.breakMs ? ` · break ${fmtHM(total.breakMs)}` : ""}{total.firstStart ? ` · ${clockTime(new Date(total.firstStart).toISOString(), c.tz)} to ${total.running ? "now" : clockTime(new Date(total.lastEnd!).toISOString(), c.tz)}` : ""}. Nothing is deducted automatically.</> : "No punches this day."}</p>
      {list.length > 0 && (
        <ul className="flat px-3.5 py-0.5">
          {list.map((e) => (
            <li key={e.id} className="border-t border-line first:border-t-0">
              <button onClick={() => setEdit({ id: e.id })} className="hit flex w-full items-center gap-3 py-2 text-left text-[14px]">
                <span className="min-w-0 flex-1 truncate">{e.kind === "break" ? "Break" : jobLabel(byId.get(e.jobId ?? ""))}{e.source === "scheduled" && <span className="mono ml-2 !normal-case">scheduled in</span>}{e.endSource === "scheduled" && <span className="mono ml-2 !normal-case">scheduled out</span>}{e.edited && <span className="mono ml-2 !normal-case">edited</span>}{!e.endAt && <span className="mono ml-2 !normal-case">running</span>}</span>
                <span className="num shrink-0 text-muted">{clockTime(e.startAt, c.tz)} – {e.endAt ? clockTime(e.endAt, c.tz) : "now"}</span>
                <span className="num w-[52px] shrink-0 text-right">{fmtHM((e.endAt ? Date.parse(e.endAt) : now) - Date.parse(e.startAt))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3"><Btn variant="soft" icon={Plus} onClick={() => setEdit({})}>Add a missed punch</Btn></div>
      {edit && <EntryEditor c={c} id={edit.id} day={day} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EntryEditor({ c, id, day, onClose }: { c: Clock; id?: string; day: string; onClose: () => void }) {
  const clock = c.clock!;
  const e = id ? clock.entries.find((x) => x.id === id) : undefined;
  const jobs = clock.jobs.filter((j) => j.active || j.id === e?.jobId || j.id === e?.resumeJobId);
  const [kind, setKind] = useState<"job" | "break">(e?.kind ?? "job");
  const [jobId, setJobId] = useState((e ? (e.kind === "job" ? e.jobId : e.resumeJobId) : clock.jobs.find((j) => j.active)?.id) ?? "");
  const [start, setStart] = useState(e ? toLocalInput(e.startAt, c.tz) : `${day}T06:00`);
  const [end, setEnd] = useState(e?.endAt ? toLocalInput(e.endAt, c.tz) : e ? "" : `${day}T07:00`);
  const [note, setNote] = useState(e?.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const save = async () => {
    const s = fromLocalInput(start, c.tz), en = end ? fromLocalInput(end, c.tz) : null;
    if (!s || (end && !en)) { setErr("Enter the start and end times."); return; }
    setSaving(true); setErr(null);
    const msg = e
      ? await c.editEntry(e.id, { ...(start !== toLocalInput(e.startAt, c.tz) ? { startAt: s } : {}), ...(e.endAt && end !== toLocalInput(e.endAt, c.tz) ? { endAt: en } : {}), ...(!e.endAt && en ? { endAt: en } : {}), jobId: jobId || undefined, note })
      : await c.addEntry({ kind, jobId: jobId || undefined, startAt: s, endAt: en, note: note || undefined });
    setSaving(false);
    if (msg) setErr(msg); else onClose();
  };
  const del = async () => { setSaving(true); const msg = await c.deleteEntry(e!.id); setSaving(false); if (msg) setErr(msg); else onClose(); };
  return (
    <Modal title={e ? "Edit punch" : "Add a missed punch"} onClose={onClose}>
      <div className="space-y-3.5">
        {!e && <Field label="Type">{(fid) => <Select id={fid} value={kind} onChange={setKind} options={[{ value: "job", label: "Job" }, { value: "break", label: "Break" }]} />}</Field>}
        {(kind === "job" || e) && <Field label={kind === "break" ? "Returns to job" : "Job"}>{(fid) => <Select id={fid} value={jobId} onChange={setJobId} options={jobs.map((j) => ({ value: j.id, label: jobLabel(j) }))} />}</Field>}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Start">{(fid) => <TextInput id={fid} type="datetime-local" value={start} onChange={setStart} />}</Field>
          <Field label="End" hint={e && !e.endAt ? "Leave blank while it is still running." : undefined}>{(fid) => <TextInput id={fid} type="datetime-local" value={end} onChange={setEnd} />}</Field>
        </div>
        <Field label="Note">{(fid) => <TextInput id={fid} value={note} onChange={setNote} maxLength={200} />}</Field>
        {e && (e.source === "scheduled" || e.endSource === "scheduled") && <p className="mono !normal-case !tracking-normal">{e.source === "scheduled" ? "Started automatically by the schedule. " : ""}{e.endSource === "scheduled" ? "Ended automatically by the schedule. " : ""}Change the times if they were different.</p>}
        {e?.edited && e.origStartAt && <p className="mono !normal-case !tracking-normal">Originally punched {clockTime(e.origStartAt, c.tz)} to {e.origEndAt ? clockTime(e.origEndAt, c.tz) : "running"}.</p>}
        <FormError message={err} />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div>{e && (confirmDel ? <span className="inline-flex gap-2"><Btn onClick={() => void del()} disabled={saving}>Yes, delete</Btn><Btn variant="ghost" onClick={() => setConfirmDel(false)}>Keep</Btn></span> : <Btn variant="ghost" onClick={() => setConfirmDel(true)}>Delete punch</Btn>)}</div>
          <div className="flex gap-2"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn></div>
        </div>
      </div>
    </Modal>
  );
}

function Week({ c }: { c: Clock }) {
  const clock = c.clock!;
  const now = useNow(60_000).getTime();
  const [start, setStart] = useState(weekStartOf(c.today, c.wk));
  const w = weekTotals(clock.entries, start, now, c.tz);
  const jobs = clock.jobs.filter((j) => w.byJob[j.id]);
  const step = (n: number) => { let d = start; for (let i = 0; i < Math.abs(n) * 7; i++) d = n < 0 ? dayBefore(d) : nextDay(d); setStart(d); if (d < c.from) { let f = d; for (let i = 0; i < 7; i++) f = dayBefore(f); c.setFrom(f); } };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Btn variant="soft" icon={ChevronLeft} label="Previous week" onClick={() => step(-1)} />
        <p className="min-w-0 flex-1 text-center text-[14px] font-medium">{pretty(w.from, { day: "numeric", month: "short" })} – {pretty(w.to, { day: "numeric", month: "short" })}</p>
        <Btn variant="soft" icon={ChevronRight} label="Next week" onClick={() => step(1)} disabled={w.to >= c.today} />
      </div>
      <p className="mb-3 text-[15px]">Total <b className="num">{fmtHM(w.workMs)}</b> <span className="text-muted">({fmtDecimal(w.workMs)} h{w.breakMs ? `, break ${fmtHM(w.breakMs)}` : ""})</span></p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[13.5px]">
          <thead><tr className="mono text-left"><th className="py-1.5 pr-2 font-normal">Day</th>{jobs.map((j) => <th key={j.id} className="px-2 text-right font-normal">{j.name}</th>)}<th className="pl-2 text-right font-normal">Total</th></tr></thead>
          <tbody>
            {w.days.map((d) => (
              <tr key={d.date} className="border-t border-line">
                <td className="py-2 pr-2">{pretty(d.date, { weekday: "short", day: "numeric" })}{d.running ? <span className="mono ml-1.5 !normal-case">running</span> : null}</td>
                {jobs.map((j) => <td key={j.id} className="num px-2 text-right text-muted">{d.byJob[j.id] ? fmtHM(d.byJob[j.id]) : "–"}</td>)}
                <td className="num pl-2 text-right font-medium">{d.workMs ? fmtHM(d.workMs) : "–"}</td>
              </tr>
            ))}
            <tr className="border-t border-ink/40 font-medium"><td className="py-2 pr-2">Week</td>{jobs.map((j) => <td key={j.id} className="num px-2 text-right">{fmtHM(w.byJob[j.id])}</td>)}<td className="num pl-2 text-right">{fmtHM(w.workMs)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mono mt-3 !normal-case !tracking-normal">Hours are exactly what you punched. Breaks are counted only when you tap Break; no lunch is deducted and no shift is ended automatically.</p>
    </div>
  );
}

function Jobs({ c }: { c: Clock }) {
  const clock = c.clock!;
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(""), [num, setNum] = useState("");
  const save = async (body: Record<string, unknown>) => { setErr(null); const m = await c.saveJob(body); if (m) setErr(m); return !m; };
  return (
    <div className="space-y-3">
      <ul className="flat px-3.5 py-1">{clock.jobs.map((j) => <JobRow key={j.id} job={j} onSave={save} />)}</ul>
      <div className="flat grid gap-2 p-3.5 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <Field label="New job name">{(fid) => <TextInput id={fid} value={name} onChange={setName} maxLength={40} placeholder="e.g. Camp" />}</Field>
        <Field label="Number">{(fid) => <TextInput id={fid} value={num} onChange={setNum} maxLength={20} inputMode="numeric" />}</Field>
        <Btn variant="primary" icon={Plus} onClick={() => void save({ name, number: num || undefined }).then((ok) => { if (ok) { setName(""); setNum(""); } })}>Add job</Btn>
      </div>
      <FormError message={err} />
      <p className="mono !normal-case !tracking-normal">Renaming or renumbering a job updates past punches too. A job you stop using can be archived; its history stays.</p>
    </div>
  );
}
function JobRow({ job, onSave }: { job: TimeJob; onSave: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [name, setName] = useState(job.name), [num, setNum] = useState(job.number ?? "");
  const dirty = name !== job.name || num !== (job.number ?? "");
  return (
    <li className="grid gap-2 border-t border-line py-2.5 first:border-t-0 sm:grid-cols-[1fr_9rem_auto] sm:items-center">
      <TextInput id={`jn-${job.id}`} aria-label="Job name" value={name} onChange={setName} maxLength={40} />
      <TextInput id={`jx-${job.id}`} aria-label="Job number" value={num} onChange={setNum} maxLength={20} inputMode="numeric" />
      <div className="flex gap-2">{dirty && <Btn variant="primary" onClick={() => void onSave({ id: job.id, name, number: num || null })}>Save</Btn>}<Btn variant="soft" onClick={() => void onSave({ id: job.id, active: !job.active })}>{job.active ? "Archive" : "Restore"}</Btn></div>
    </li>
  );
}


/** The automatic punches in one place on the card: what is set up, what happened today, and today's two choices. */
function ScheduleLine({ c, open, onSettings }: { c: Clock; open: boolean; onSettings: () => void }) {
  const v = c.clock!.schedule, cfg = v.config;
  const [msg, setMsg] = useState<string | null>(null);
  const jobName = jobLabel(c.clock!.jobs.find((j) => j.id === cfg.jobId));
  const act = async (a: "skip_in" | "overtime") => setMsg(await c.scheduleAction(a));
  if (!cfg.timezone || !cfg.enabled) return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px] text-muted">
      <CalendarClock size={14} aria-hidden /><span className="min-w-0 flex-1">{cfg.enabled ? "Automatic punches are off until you choose the worksite time zone." : "Automatic punches are turned off."}</span>
      <button onClick={onSettings} className="hit press rounded-full px-3 text-[12.5px] text-ink" style={{ boxShadow: "0 0 0 1px var(--line)" }}>Set up</button>
    </div>
  );
  const t = v.today;
  const inText = !t ? "" : !t.onRotation ? "" : t.inOutcome === "punched" ? `Clocked in automatically at ${cfg.startTime}.` : t.inOutcome === "skipped" ? (t.inReason ?? "Automatic clock-in skipped.") : t.inOutcome === "missed" ? "Automatic clock-in missed: Orbis was not running then, and nothing was backfilled." : `Clock-in ${cfg.startTime} to ${jobName}.`;
  const outText = !t || !t.onRotation ? "" : t.outOutcome === "punched" ? `Clocked out automatically at ${cfg.endTime}.` : t.outOutcome === "overtime" ? "Overtime today: no automatic clock-out." : t.outOutcome === "none" || t.outOutcome === "skipped" ? "" : `Clock-out ${cfg.endTime}.`;
  return (
    <div className="mt-3 border-t border-line pt-3 text-[12.5px]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted"><CalendarClock size={14} aria-hidden /><span className="min-w-0 flex-1">Auto punches · {cfg.startTime} to {cfg.endTime} · {cfg.timezone.replace("_", " ")} · on-rotation days only</span><button onClick={onSettings} className="hit press rounded-full px-3 text-ink" style={{ boxShadow: "0 0 0 1px var(--line)" }}>Edit</button></p>
      {t && !t.onRotation && <p className="mt-1.5">Off rotation today: no automatic punches.{v.nextRunDate ? ` Next: ${pretty(v.nextRunDate, { weekday: "short", day: "numeric", month: "short" })}.` : ""}</p>}
      {t?.onRotation && <p className="mt-1.5">{[inText, outText].filter(Boolean).join(" ")}</p>}
      {v.status && <p role="alert" className="mt-1.5 font-medium" style={{ color: "var(--w-terra)" }}>{v.status.message}</p>}
      {t?.onRotation && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!t.inOutcome && !open && <button onClick={() => void act("skip_in")} className="hit press rounded-full px-3.5" style={{ boxShadow: "0 0 0 1px var(--line)" }}>Skip today's clock-in</button>}
          {!t.outOutcome && open && <button onClick={() => void act("overtime")} className="hit press rounded-full px-3.5" style={{ boxShadow: "0 0 0 1px var(--line)" }}>Work overtime today</button>}
        </div>
      )}
      {msg && <p role="status" className="mt-1.5" style={{ color: "var(--w-terra)" }}>{msg}</p>}
    </div>
  );
}

const ZONES = ["America/Vancouver", "America/Edmonton", "America/Regina", "America/Winnipeg", "America/Toronto", "America/Halifax", "America/St_Johns"];
function Schedule({ c }: { c: Clock }) {
  const v = c.clock!.schedule, cfg = v.config;
  const known = !cfg.timezone || ZONES.includes(cfg.timezone);
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [zone, setZone] = useState(cfg.timezone ? (known ? cfg.timezone : "other") : "");
  const [other, setOther] = useState(known ? "" : cfg.timezone ?? "");
  const [start, setStart] = useState(cfg.startTime), [end, setEnd] = useState(cfg.endTime), [job, setJob] = useState(cfg.jobId);
  const [err, setErr] = useState<string | null>(null), [saved, setSaved] = useState(false), [saving, setSaving] = useState(false);
  const tz = zone === "other" ? other.trim() : zone;
  const save = async () => { setSaving(true); setErr(null); setSaved(false); const m = await c.saveSchedule({ enabled, timezone: tz || null, startTime: start, endTime: end, jobId: job }); setSaving(false); if (m) setErr(m); else setSaved(true); };
  return (
    <div className="space-y-3.5">
      <p className="text-[13px] text-muted">At the clock-in time on on-rotation days Orbis punches you into the job below; at the clock-out time it ends whatever is running (job or break). Orbis does this on its own server, so it works while the app is closed. Manual punches always win, nothing is backfilled and no lunch is deducted.</p>
      <Field label="Automatic punches">{(fid) => <Select id={fid} value={enabled ? "on" : "off"} onChange={(x) => setEnabled(x === "on")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />}</Field>
      <Field label="Worksite time zone" hint="The site's zone, not this device's. Nothing runs until it is set.">{(fid) => <Select id={fid} value={zone} onChange={setZone} options={[{ value: "", label: "Choose…" }, ...ZONES.map((z) => ({ value: z, label: z.replace("America/", "").replace("_", " ") })), { value: "other", label: "Other…" }]} />}</Field>
      {zone === "other" && <Field label="IANA zone name">{(fid) => <TextInput id={fid} value={other} onChange={setOther} placeholder="e.g. America/Denver" />}</Field>}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Clock in at">{(fid) => <TextInput id={fid} type="time" value={start} onChange={setStart} />}</Field>
        <Field label="Clock out at">{(fid) => <TextInput id={fid} type="time" value={end} onChange={setEnd} />}</Field>
      </div>
      <Field label="Clock into">{(fid) => <Select id={fid} value={job} onChange={setJob} options={c.clock!.jobs.filter((j) => j.active || j.id === job).map((j) => ({ value: j.id, label: jobLabel(j) }))} />}</Field>
      <FormError message={err} />
      {saved && <p role="status" className="text-[13px]">Saved.</p>}
      <div className="flex justify-end"><Btn variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn></div>
    </div>
  );
}
