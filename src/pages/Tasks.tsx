import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HORIZONS, HORIZON_LABELS, type Horizon } from "../../shared/horizons";
import { MODULE_IDS, MODULES_META } from "../../shared/modules";
import { TaskEditor } from "../components/editors";
import { TaskGroups } from "../components/TaskGroups";
import { TaskLine } from "../components/TaskLine";
import { Btn, Empty, PageHeader, Panel } from "../components/ui";
import { useData } from "../lib/data";
import { byUrgency, isOpen } from "../lib/taskUi";
import type { Task } from "../lib/types";

const PRIOS = [{ value: "all", label: "Any priority" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];
const SELECT = "inset h-11 w-full min-w-0 rounded-full bg-transparent px-3 text-[13px] outline-none md:h-10 md:w-auto md:px-4";

export default function Tasks() {
  const { tasks, today, weekStart, loading, error, completeTask, reopenTask } = useData();
  const [sp, setSp] = useSearchParams();
  const h = sp.get("h") ?? "all";
  const module = sp.get("module") ?? "all";
  const priority = sp.get("priority") ?? "all";
  const status = sp.get("status") ?? "all";
  const q = sp.get("q") ?? "";
  const [editing, setEditing] = useState<{ task?: Task } | null>(null);
  useEffect(() => { if (sp.get("add")) { setEditing({}); const n = new URLSearchParams(sp); n.delete("add"); setSp(n, { replace: true }); } }, [sp, setSp]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (!v || v === "all") n.delete(k); else n.set(k, v); setSp(n, { replace: true }); };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => (h === "done" ? t.status === "completed" : isOpen(t)))
      .filter((t) => module === "all" || t.module === module)
      .filter((t) => priority === "all" || t.priority === priority)
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => !needle || `${t.title} ${t.description ?? ""} ${t.project ?? ""}`.toLowerCase().includes(needle))
      .sort(h === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : byUrgency);
  }, [tasks, h, module, priority, status, q]);
  const only = (HORIZONS as readonly string[]).includes(h) ? (h as Horizon) : null;
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));

  return (
    <div>
      <PageHeader crumb="TASKS" title={h === "done" ? "Completed" : only ? HORIZON_LABELS[only] : "Tasks"} subtitle={`${shown.length} ${h === "done" ? "completed in the last 14 days" : "open"}${module !== "all" ? ` · ${MODULES_META[module as keyof typeof MODULES_META]?.label ?? module}` : ""}`} />
      <Panel className="p-4 max-md:![background:none] max-md:!p-0 max-md:!shadow-none md:p-5">
        <div className="mb-3 grid grid-cols-3 items-center gap-2 md:mb-4 md:flex md:flex-wrap">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="inset col-span-3 flex h-11 min-w-[180px] flex-1 items-center gap-2 rounded-full px-3.5 md:col-span-1 md:h-10">
            <Search size={14} className="text-muted" aria-hidden />
            <input value={q} onChange={(e) => set("q", e.target.value)} aria-label="Search tasks" placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
          </form>
          <select aria-label="Module" className={SELECT} value={module} onChange={(e) => set("module", e.target.value)}>
            <option value="all">All modules</option>
            {MODULE_IDS.map((m) => <option key={m} value={m}>{MODULES_META[m].label}</option>)}
          </select>
          <select aria-label="Priority" className={SELECT} value={priority} onChange={(e) => set("priority", e.target.value)}>{PRIOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
          <select aria-label="Status" className={SELECT} value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="all">Any status</option><option value="pending">To do</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option>
          </select>
          <Btn variant="primary" icon={Plus} onClick={() => setEditing({})} className="max-md:!hidden">New task</Btn>
        </div>
        {loading ? <Empty>Loading…</Empty> : error && tasks.length === 0 ? <Empty>{error}</Empty> : h === "done" ? (
          shown.length ? <ul>{shown.map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={(x) => setEditing({ task: x })} />)}</ul> : <Empty>Nothing completed recently.</Empty>
        ) : (
          <TaskGroups tasks={shown} today={today} weekStart={weekStart} onToggle={toggle} onOpen={(x) => setEditing({ task: x })} only={only} />
        )}
      </Panel>
      {editing && <TaskEditor task={editing.task} defaults={module !== "all" ? { module: module as Task["module"] } : undefined} onClose={() => setEditing(null)} />}
    </div>
  );
}
