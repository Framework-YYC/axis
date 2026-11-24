import { useEffect, useRef, useState } from "react";
import { MODULES_META } from "../../shared/modules";
import { priorityLevel } from "../../shared/taskViews";
import type { Tick } from "../../shared/viz";
import { cx } from "../lib/cx";
import { prefersReducedMotion } from "../lib/motion";
import { relative } from "../lib/dates";
import type { Task } from "../lib/types";
import { SegBar } from "./charts";
import { DueChip, ModuleIcon, ProvenanceMark, PRIORITY_BAR, Repeat, SyntheticMark } from "./mobile";
import { isUnverified, Status } from "./ui";

const prioTicks = (p: string): Tick[] => Array.from({ length: 4 }, (_, i) => (i < priorityLevel(p) ? (p === "critical" ? "bad" : "on") : "off"));

export function statusOf(t: Task, today: string) {
  if (t.status === "completed") return <Status tone="ok">Done</Status>;
  if (t.dueDate && t.dueDate < today) return <Status tone="bad">{relative(t.dueDate, today)}</Status>;
  if (t.status === "in_progress") return <Status tone="ok">In progress</Status>;
  if (t.status === "waiting") return <Status tone="lime">Waiting</Status>;
  if (t.dueDate === today) return <Status tone="neutral">{t.dueTime ? `Today ${t.dueTime}` : "Due today"}</Status>;
  return t.dueDate ? <Status tone="neutral">{relative(t.dueDate, today)}{t.dueTime ? ` ${t.dueTime}` : ""}</Status> : <Status tone="idle">Unscheduled</Status>;
}

/** The completion mark: the circle pops and the tick draws itself when a task is completed by the user (not on first render or data refreshes). */
function CheckMark({ done, fresh }: { done: boolean; fresh: boolean }) {
  return (
    <span className={cx("grid size-7 place-items-center rounded-full transition-colors duration-200", done ? "bg-ink text-[var(--card-a)]" : "inset text-transparent", fresh && "check-in")}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" className={fresh ? "check-draw" : undefined} /></svg>
    </span>
  );
}

/**
 * One task. Phone: tap target, wrapped title, module icon and a compact due chip. Wider screens keep the status pill and priority ticks.
 * Completing (or reopening) plays the check animation, then the row eases out before the list updates, so it never just vanishes.
 */
export function TaskLine({ t, today, onToggle, onOpen, showModule = true, compact = false }: { t: Task; today: string; onToggle: (t: Task) => void; onOpen?: (t: Task) => void; showModule?: boolean; compact?: boolean }) {
  const done = t.status === "completed";
  const bar = PRIORITY_BAR[t.priority];
  const assistant = t.source.assistant ? (MODULES_META[t.source.assistant as keyof typeof MODULES_META]?.assistant ?? t.source.assistant) : null;
  const [fresh, setFresh] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const toggle = () => {
    if (leaving) return;
    if (prefersReducedMotion()) { onToggle(t); return; }
    setFresh(true); setLeaving(true);
    timers.current.push(window.setTimeout(() => onToggle(t), 420));
  };
  return (
    <li className={cx("relative flex items-start gap-1 border-t border-line py-0.5 first:border-t-0 md:items-center md:gap-3 md:py-3", leaving && "row-leave")} style={leaving ? { animationDelay: "180ms" } : undefined}>
      {bar && !done && <span aria-hidden className="absolute -left-2 top-3 h-5 w-[3px] rounded-full md:left-[-10px] md:top-1/2 md:-translate-y-1/2" style={{ background: bar }} />}
      <button onClick={toggle} aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} completed`} aria-pressed={leaving ? !done : done} className="hit press grid shrink-0 place-items-center">
        <CheckMark done={leaving ? !done : done} fresh={fresh} />
      </button>
      <button onClick={() => onOpen?.(t)} className="hit min-w-0 flex-1 py-1.5 text-left" aria-label={`Open ${t.title}`}>
        <span className={cx("break-words text-[14.5px] leading-snug [overflow-wrap:anywhere] line-clamp-2", done && "text-muted line-through")}>{t.title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5">
          {showModule && <ModuleIcon id={t.module} size={18} />}
          {showModule && !compact && <span className="mono hidden md:inline">{MODULES_META[t.module].label}</span>}
          {t.recurrence && <Repeat size={11} aria-label="Repeats" className="shrink-0 text-faint" />}
          {isUnverified(t.source) && <ProvenanceMark />}
          {assistant && !compact && <span className="mono hidden truncate md:inline">via {assistant}</span>}
          {t.demo && <SyntheticMark />}
          {t.priority === "critical" || t.priority === "high" ? <span className="sr-only">{t.priority} priority</span> : null}
        </span>
      </button>
      <div className={cx("flex shrink-0 items-center self-center pr-1", !compact && "md:hidden")}><DueChip t={t} today={today} /></div>
      {!done && !compact && <SegBar ticks={prioTicks(t.priority)} label={`Priority ${t.priority}`} height={12} className="hidden w-14 shrink-0 md:flex" />}
      {!compact && <div className="hidden shrink-0 md:block">{statusOf(t, today)}</div>}
    </li>
  );
}
