import { Check, Repeat } from "lucide-react";
import { MODULES_META } from "../../shared/modules";
import { priorityLevel } from "../../shared/taskViews";
import type { Tick } from "../../shared/viz";
import { cx } from "../lib/cx";
import { relative } from "../lib/dates";
import type { Task } from "../lib/types";
import { SegBar } from "./charts";
import { isUnverified, Status, UnverifiedTag } from "./ui";

const prioTicks = (p: string): Tick[] => Array.from({ length: 4 }, (_, i) => (i < priorityLevel(p) ? (p === "critical" ? "bad" : "on") : "off"));

export function statusOf(t: Task, today: string) {
  if (t.status === "completed") return <Status tone="ok">Done</Status>;
  if (t.dueDate && t.dueDate < today) return <Status tone="bad">{relative(t.dueDate, today)}</Status>;
  if (t.status === "in_progress") return <Status tone="ok">In progress</Status>;
  if (t.status === "waiting") return <Status tone="lime">Waiting</Status>;
  if (t.dueDate === today) return <Status tone="neutral">{t.dueTime ? `Today ${t.dueTime}` : "Due today"}</Status>;
  return t.dueDate ? <Status tone="neutral">{relative(t.dueDate, today)}{t.dueTime ? ` ${t.dueTime}` : ""}</Status> : <Status tone="idle">Unscheduled</Status>;
}

/** One task: round check, title with mono meta, 4-tick priority, status. Opening the row edits it. */
export function TaskLine({ t, today, onToggle, onOpen, showModule = true }: { t: Task; today: string; onToggle: (t: Task) => void; onOpen?: (t: Task) => void; showModule?: boolean }) {
  const done = t.status === "completed";
  return (
    <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-1">
      <button onClick={() => onToggle(t)} aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} completed`} aria-pressed={done} className={cx("grid size-7 shrink-0 place-items-center rounded-full transition-all", done ? "bg-ink text-[var(--card-a)]" : "inset text-transparent hover:text-faint")}>
        <Check size={14} strokeWidth={2.4} aria-hidden />
      </button>
      <button onClick={() => onOpen?.(t)} className="min-w-0 flex-1 text-left" aria-label={`Open ${t.title}`}>
        <p className={cx("truncate text-[14px]", done && "text-muted line-through")}>{t.title}</p>
        <p className="mono mt-0.5 flex items-center gap-1.5 truncate">
          {showModule && <span>{MODULES_META[t.module].label}</span>}
          {t.recurrence && <Repeat size={11} aria-label="Repeats" />}
          {t.source.assistant && <span>· via {MODULES_META[t.source.assistant as keyof typeof MODULES_META]?.assistant ?? t.source.assistant}</span>}
          {isUnverified(t.source) && <UnverifiedTag />}
          {t.demo && <span className="tag !h-[18px] !px-1.5 !text-[9px]">SYNTHETIC</span>}
        </p>
      </button>
      {!done && <SegBar ticks={prioTicks(t.priority)} label={`Priority ${t.priority}`} height={12} className="hidden w-14 shrink-0 sm:flex" />}
      <div className="shrink-0">{statusOf(t, today)}</div>
    </li>
  );
}
