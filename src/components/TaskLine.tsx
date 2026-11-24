import { Check } from "lucide-react";
import type { Task } from "../lib/api";
import { categoryName } from "../lib/categories";
import { cx } from "../lib/cx";
import { relative } from "../lib/dates";
import { priorityLevel } from "../../shared/taskViews";
import type { Tick } from "../../shared/viz";
import { SegBar } from "./charts";
import { Status } from "./ui";

const prioTicks = (p: string): Tick[] => Array.from({ length: 4 }, (_, i) => (i < priorityLevel(p) ? (p === "critical" ? "bad" : "on") : "off"));

function statusOf(t: Task, today: string) {
  if (t.status === "completed") return <Status tone="ok">Done</Status>;
  if (t.dueDate && t.dueDate < today) return <Status tone="bad">{relative(t.dueDate, today)}</Status>;
  if (t.status === "in_progress") return <Status tone="ok">In progress</Status>;
  if (t.status === "waiting") return <Status tone="lime">Waiting</Status>;
  if (t.dueDate === today) return <Status tone="neutral">Due today</Status>;
  return t.dueDate ? <Status tone="neutral">{relative(t.dueDate, today)}</Status> : <Status tone="idle">Inbox</Status>;
}

/** One task: round check, title with mono meta, 4-tick priority, status. */
export function TaskLine({ t, today, onToggle }: { t: Task; today: string; onToggle: (t: Task) => void }) {
  const done = t.status === "completed";
  const assistant = t.source.kind === "integration";
  return (
    <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-1">
      <button onClick={() => onToggle(t)} aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} completed`} aria-pressed={done} className={cx("grid size-7 shrink-0 place-items-center rounded-full transition-all", done ? "bg-ink text-[var(--card-a)]" : "inset text-transparent hover:text-faint")}>
        <Check size={14} strokeWidth={2.4} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cx("truncate text-[14px]", done && "text-muted line-through")}>{t.title}</p>
        <p className="mono mt-0.5 truncate">
          {t.category ? categoryName(t.category) : "No category"}
          {assistant ? ` · via ${t.source.name}` : ""}
          {done && t.completedAt ? ` · done ${new Date(t.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
        </p>
      </div>
      {!done && <SegBar ticks={prioTicks(t.priority)} label={`Priority ${t.priority}`} height={12} className="hidden w-14 shrink-0 sm:flex" />}
      <div className="shrink-0">{statusOf(t, today)}</div>
    </li>
  );
}
