import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { HORIZONS, HORIZON_LABELS, horizonOf, type Horizon, type WeekStart } from "../../shared/horizons";
import { cx } from "../lib/cx";
import type { Task } from "../lib/types";
import { TaskLine } from "./TaskLine";

/** Open tasks in mutually exclusive time horizons, computed from the due date and today. Never stored. */
export function groupByHorizon(tasks: Task[], today: string, weekStart: WeekStart): Record<Horizon, Task[]> {
  const out = Object.fromEntries(HORIZONS.map((h) => [h, [] as Task[]])) as Record<Horizon, Task[]>;
  for (const t of tasks) out[horizonOf(t.dueDate, today, weekStart)].push(t);
  return out;
}

export function TaskGroups({ tasks, today, weekStart, onToggle, onOpen, showModule = true, only }: { tasks: Task[]; today: string; weekStart: WeekStart; onToggle: (t: Task) => void; onOpen: (t: Task) => void; showModule?: boolean; only?: Horizon | null }) {
  const groups = groupByHorizon(tasks, today, weekStart);
  const [closed, setClosed] = useState<Set<Horizon>>(new Set());
  const shown = HORIZONS.filter((h) => groups[h].length > 0 && (!only || only === h));
  if (shown.length === 0) return <p className="mono py-10 text-center !normal-case">Nothing here.</p>;
  return (
    <div className="space-y-5">
      {shown.map((h) => {
        const shut = closed.has(h);
        return (
          <section key={h} aria-label={HORIZON_LABELS[h]}>
            <button onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(h)) n.delete(h); else n.add(h); return n; })} aria-expanded={!shut} className="mb-1 flex w-full items-center justify-between gap-3 py-1 text-left">
              <span className="flex items-center gap-2.5">
                <span className={cx("text-[14px] font-medium tracking-tight", h === "overdue" && "text-red")}>{HORIZON_LABELS[h]}</span>
                <span className={cx("mono num grid h-5 min-w-5 place-items-center rounded-full px-1.5", h === "overdue" ? "bg-red/15 !text-red" : "bg-[var(--card-dim)]")}>{groups[h].length}</span>
              </span>
              <ChevronDown size={15} className={cx("text-faint transition-transform", shut && "-rotate-90")} aria-hidden />
            </button>
            {!shut && <ul>{groups[h].map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={onToggle} onOpen={onOpen} showModule={showModule} />)}</ul>}
          </section>
        );
      })}
    </div>
  );
}
