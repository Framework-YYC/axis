import { Check, Pencil, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { MODULES_META } from "../../shared/modules";
import { fillTicks, type Tick } from "../../shared/viz";
import { cx } from "../lib/cx";
import { post } from "../lib/api";
import { pretty } from "../lib/dates";
import { useData } from "../lib/data";
import type { CalEvent, Goal, Habit } from "../lib/types";
import { SegBar } from "./charts";
import { ModuleIcon, ProvenanceMark, SyntheticMark } from "./mobile";
import { Btn, isUnverified, Status, Tag, UnverifiedTag } from "./ui";

export const ModuleTag = ({ id }: { id: string }) => <span className="tag">{MODULES_META[id as keyof typeof MODULES_META]?.label ?? id}</span>;
export const DemoMark = () => <span className="tag !h-[18px] !px-1.5 !text-[9px]" title="Synthetic demonstration record">SYNTHETIC</span>;

const TERM_LABEL = { short: "Short-term", medium: "Medium-term", long: "Long-term" } as const;
const fmt = (n: number | null) => (n === null ? "–" : Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export function GoalCard({ g, onEdit, showModule = true }: { g: Goal; onEdit: (g: Goal) => void; showModule?: boolean }) {
  const { mutate } = useData();
  const [val, setVal] = useState("");
  const numeric = g.kind === "numeric";
  const submit = async () => {
    const n = Number(val);
    if (!Number.isFinite(n) || val.trim() === "") return;
    setVal("");
    await mutate(() => post(`/goals/${g.id}/progress`, numeric ? { value: n } : { progress: Math.max(0, Math.min(100, n)) }));
  };
  return (
    <li className="panel-dim p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium leading-snug">{g.title}</p>
          <p className="mono mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {showModule && <span>{MODULES_META[g.module].label}</span>}
            {g.term && <span>{TERM_LABEL[g.term]}{g.termSource === "set" ? "" : " (from date)"}</span>}
            {g.targetDate && <span>target {pretty(g.targetDate, { day: "numeric", month: "short", year: "numeric" })}</span>}
            {isUnverified(g.source) && <UnverifiedTag />}
            {g.demo && <DemoMark />}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {g.status !== "active" && <Status tone={g.status === "achieved" ? "lime" : "idle"}>{g.status}</Status>}
          <span className="num text-[20px] font-light tracking-tight">{Math.round(g.progress)}%</span>
          <button onClick={() => onEdit(g)} aria-label={`Edit ${g.title}`} className="inset grid size-11 place-items-center rounded-full md:size-8"><Pencil size={13} /></button>
        </div>
      </div>
      <SegBar ticks={fillTicks(30, g.progress, 100)} label={`${g.title}: ${Math.round(g.progress)}%`} height={14} className="mt-3" />
      {numeric && <p className="mono mt-2 !normal-case !tracking-normal">{fmt(g.currentValue)} of {fmt(g.targetValue)}{g.unit ? ` ${g.unit}` : ""} · started at {fmt(g.startValue)}</p>}
      {g.milestones.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {g.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 text-[13px]">
              <button aria-pressed={m.done} aria-label={`${m.done ? "Reopen" : "Complete"} milestone ${m.title}`} onClick={() => void mutate(() => post(`/milestones/${m.id}`, { done: !m.done }))} className="hit -my-3 grid shrink-0 place-items-center"><span className={cx("grid size-5 place-items-center rounded-full", m.done ? "bg-ink text-[var(--card-a)]" : "inset text-transparent")}><Check size={11} strokeWidth={3} /></span></button>
              <span className={cx("min-w-0 flex-1 truncate", m.done && "text-muted line-through")}>{m.title}</span>
              {m.targetDate && <span className="mono">{pretty(m.targetDate, { day: "numeric", month: "short" })}</span>}
            </li>
          ))}
        </ul>
      )}
      {g.status === "active" && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="sr-only" htmlFor={`gp-${g.id}`}>{numeric ? "New current value" : "Progress percent"}</label>
          <input id={`gp-${g.id}`} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={numeric ? `New value${g.unit ? ` (${g.unit})` : ""}` : "Progress 0-100"} className="inset h-11 min-w-0 flex-1 rounded-full bg-transparent px-3.5 text-[13px] outline-none placeholder:text-muted md:h-9" />
          <Btn type="submit" variant="soft" icon={Plus} className="!min-h-11 !px-3.5 !text-[12.5px] md:!min-h-9">Log progress</Btn>
        </form>
      )}
    </li>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const scheduleText = (h: Habit) => {
  const per = h.period === "day" ? "day" : h.period;
  const target = h.targetValue !== null ? `${fmt(h.targetValue)}${h.unit ? ` ${h.unit}` : ""}` : h.targetCount > 1 ? `${h.targetCount}×` : "once";
  const days = h.daysOfWeek && h.daysOfWeek.length < 7 ? ` on ${h.daysOfWeek.map((d) => DAYS[d]).join(", ")}` : "";
  const rot = h.rotationMode === "on" ? " · on-rotation days" : h.rotationMode === "off" ? " · off-rotation days" : h.rotationMode === "split" ? " · different on and off rotation" : "";
  return `${target} per ${per}${days}${rot}`;
};

export function HabitRow({ h, onEdit, showModule = true }: { h: Habit; onEdit: (h: Habit) => void; showModule?: boolean }) {
  const { logHabit } = useData();
  const [val, setVal] = useState("");
  const quant = h.targetValue !== null;
  const t = h.today;
  const ticks: Tick[] = h.recent.map((d, i) => (i === h.recent.length - 1 ? (d.done ? "now" : "off") : !d.applies ? "soft" : d.done ? "on" : "off"));
  return (
    <li className="flex flex-col gap-2.5 border-t border-line py-3.5 first:border-t-0 first:pt-1">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => void logHabit(h.id)} disabled={!quant && t.done} aria-label={quant ? `Log one ${h.title}` : t.done ? `${h.title} done today` : `Mark ${h.title} done today`} className={cx("grid size-9 shrink-0 place-items-center rounded-full", t.done ? "bg-[var(--g-sage)] text-[var(--w-on)]" : t.applies ? "inset text-muted" : "inset text-faint opacity-60")}>
          {quant ? <Plus size={15} /> : <Check size={15} strokeWidth={2.6} />}
        </button>
        <div className="min-w-0">
          <button onClick={() => onEdit(h)} className="block max-w-full truncate text-left text-[14px]" aria-label={`Edit ${h.title}`}>{h.title}</button>
          <p className="mono mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 !normal-case !tracking-normal">
            {showModule && <span className="uppercase tracking-[0.07em]">{MODULES_META[h.module].label}</span>}
            <span>{scheduleText(h)}</span>
            {h.rotationMode !== "any" && <Repeat size={11} aria-label="Rotation-aware" />}
            {isUnverified(h.source) && <UnverifiedTag />}
            {h.demo && <DemoMark />}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 pl-12">
        <SegBar ticks={ticks} label={`${h.title}, last 14 days`} height={20} className="min-w-0 flex-1" />
        <div className="shrink-0 text-right">
          <p className="num text-[13px] font-medium">{t.applies ? (quant ? `${fmt(t.value)} / ${fmt(t.target)}` : `${fmt(t.value)} / ${fmt(t.target)}`) : "Rest day"}</p>
          <p className="mono">{h.streak.current} streak · best {h.streak.best}</p>
        </div>
      </div>
      {quant && (
        <form className="flex gap-2 pl-12 sm:max-w-[260px]" onSubmit={(e) => { e.preventDefault(); const n = Number(val); if (Number.isFinite(n) && val.trim() !== "") { setVal(""); void logHabit(h.id, n); } }}>
          <label className="sr-only" htmlFor={`hl-${h.id}`}>Amount to log{h.unit ? ` in ${h.unit}` : ""}</label>
          <input id={`hl-${h.id}`} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={h.unit ?? "amount"} className="inset h-11 min-w-0 flex-1 rounded-full bg-transparent px-3.5 text-[13px] outline-none placeholder:text-muted md:h-9" />
          <Btn type="submit" variant="soft" className="!min-h-11 !px-3.5 !text-[12.5px] md:!min-h-9">Log</Btn>
        </form>
      )}
    </li>
  );
}

export function EventRow({ e, onOpen, showModule = true }: { e: CalEvent; onOpen: (e: CalEvent) => void; showModule?: boolean }) {
  const time = e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : "All day";
  return (
    <li className="flex items-center gap-3 py-0.5 md:border-t md:border-line md:py-2.5 md:first:border-t-0 md:first:pt-0">
      <ModuleIcon id={e.module} size={28} className="md:hidden" />
      <span className="mono num hidden w-[74px] shrink-0 md:inline">{time}</span>
      <button onClick={() => onOpen(e)} className="hit min-w-0 flex-1 py-1 text-left">
        <p className="break-words text-[14px] leading-snug [overflow-wrap:anywhere] line-clamp-2 md:truncate md:text-[13.5px]">{e.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted md:hidden">{[time, e.location].filter(Boolean).join(" · ")}</p>
        <p className="mono mt-0.5 hidden truncate !normal-case !tracking-normal md:block">{[showModule ? MODULES_META[e.module].label : null, e.location].filter(Boolean).join(" · ")}</p>
      </button>
      {isUnverified(e.source) && <ProvenanceMark />}
      {e.demo && <span className="md:hidden"><SyntheticMark /></span>}
      {e.demo && <span className="hidden md:inline-flex"><DemoMark /></span>}
    </li>
  );
}
export { Tag };
