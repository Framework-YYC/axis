import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HORIZONS, HORIZON_LABELS, type Horizon } from "../../shared/horizons";
import { isModule, MODULE_IDS, MODULES_META, type ModuleId } from "../../shared/modules";
import { useData } from "../lib/data";
import { byUrgency, isOpen, taskDetail } from "../lib/taskUi";
import type { Task } from "../lib/types";
import { TaskEditor } from "./editors";
import { Chips, Field, Modal, Select } from "./forms";
import { TaskGroups, TypeGroups } from "./TaskGroups";
import { TaskLine } from "./TaskLine";
import { Btn, Empty, Segmented } from "./ui";

const PRIORITIES = [{ value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];
const STATUSES = [{ value: "all", label: "Open, any status" }, { value: "pending", label: "To do" }, { value: "in_progress", label: "In progress" }, { value: "waiting", label: "Waiting" }, { value: "completed", label: "Completed" }];

/** A compact outlined selector: the native control (accessible, keyboard and touch friendly) under a styled label. */
function Pick({ label, value, display, onChange, children }: { label: string; value: string; display: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="relative inline-flex h-11 min-w-0 flex-1 items-center rounded-full pl-3.5 pr-8 text-[13px] md:h-10 md:flex-none" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none rounded-full bg-transparent pl-3.5 pr-8 text-transparent outline-none">{children}</select>
      <span aria-hidden className="truncate">{display}</span>
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}

/**
 * The one task screen. The module and time-horizon filters work together; secondary filters (priority, status, project) live in a menu.
 * Opened from Home it shows every module; opened from a module it starts on that module. All views read the same task records.
 */
export function TasksView({ module: defaultModule, scope }: { module?: ModuleId; scope?: readonly ModuleId[]; embedded?: boolean }) {
  const { tasks, today, weekStart, loading, error, completeTask, reopenTask } = useData();
  const [sp, setSp] = useSearchParams();
  const rawModule = sp.get("module");
  const choices = scope ?? MODULE_IDS;
  const module: ModuleId | "all" = rawModule === "all" ? "all" : isModule(rawModule) && choices.includes(rawModule) ? rawModule : defaultModule ?? "all";
  const rawH = sp.get("h") ?? "all";
  const legacyDone = rawH === "done";
  const h = (HORIZONS as readonly string[]).includes(rawH) ? (rawH as Horizon) : null;
  const priority = sp.get("priority") ?? "all";
  const status = legacyDone ? "completed" : sp.get("status") ?? "all";
  const project = sp.get("project") ?? "all";
  const q = sp.get("q") ?? "";
  const type = (["recurring", "action_item", "manual"] as const).find((x) => x === sp.get("type")) ?? "all";
  const group = sp.get("group") === "type" ? "type" : "due";
  const [editing, setEditing] = useState<{ task?: Task } | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (sp.get("add")) { setEditing({}); const n = new URLSearchParams(sp); n.delete("add"); setSp(n, { replace: true }); } }, [sp, setSp]);
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (!v || (v === "all" && k !== "module")) n.delete(k); else n.set(k, v); if (k === "status") n.delete("h_done"); if (legacyDone && k !== "h") n.delete("h"); return n; }, { replace: true });

  const inModule = useMemo(() => tasks.filter((t) => (module === "all" ? !scope || scope.includes(t.module) : t.module === module)), [tasks, module, scope]);
  const projects = useMemo(() => [...new Set(inModule.map((t) => t.project).filter((p): p is string => !!p))].sort(), [inModule]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const completed = status === "completed";
    return inModule
      .filter((t) => (completed ? t.status === "completed" : isOpen(t)))
      .filter((t) => (completed || status === "all" ? true : t.status === status))
      .filter((t) => type === "all" || t.type === type)
      .filter((t) => priority === "all" || t.priority === priority)
      .filter((t) => project === "all" || t.project === project)
      .filter((t) => !needle || `${t.title} ${t.description ?? ""} ${t.project ?? ""}`.toLowerCase().includes(needle))
      .sort(completed ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : byUrgency);
  }, [inModule, status, type, priority, project, q]);
  const typeCount = (k: string) => inModule.filter((t) => isOpen(t) && (k === "all" || t.type === k)).length;
  const toggle = (t: Task) => void (t.status === "completed" ? reopenTask(t.id) : completeTask(t.id));
  const secondary = [priority !== "all" && ["priority", `Priority: ${priority}`], status !== "all" && ["status", STATUSES.find((s) => s.value === status)?.label ?? status], project !== "all" && ["project", `Project: ${project}`]].filter(Boolean) as Array<[string, string]>;
  const moduleLabel = module === "all" ? (scope ? "Personal" : "All modules") : MODULES_META[module].label;
  const horizonLabel = h ? HORIZON_LABELS[h] : "All times";

  return (
    <div>
      <div data-cascade className="mb-2.5 flex items-center gap-2">
        <Pick label="Module" value={module} display={moduleLabel} onChange={(v) => set("module", v)}>
          <option value="all">{scope ? "Personal" : "All modules"}</option>
          {choices.map((m) => <option key={m} value={m}>{MODULES_META[m].label}</option>)}
        </Pick>
        <Pick label="Time horizon" value={h ?? "all"} display={horizonLabel} onChange={(v) => set("h", v)}>
          <option value="all">All times</option>
          {HORIZONS.map((x) => <option key={x} value={x}>{HORIZON_LABELS[x]}</option>)}
        </Pick>
        <button onClick={() => setMenu(true)} aria-label={`Filters${secondary.length ? `, ${secondary.length} applied` : ""}`} className="hit relative grid shrink-0 place-items-center rounded-full" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
          <SlidersHorizontal size={17} strokeWidth={1.4} aria-hidden />
          {secondary.length > 0 && <span className="num absolute -right-0.5 -top-0.5 grid size-[18px] place-items-center rounded-full bg-[var(--pill-bg)] text-[10.5px] font-medium text-[var(--pill-ink)]">{secondary.length}</span>}
        </button>
      </div>
      <div data-cascade className="mb-2.5 flex flex-wrap items-center gap-2">
        <Segmented label="Task type" value={type} onChange={(v) => set("type", v)} options={[{ value: "all", label: `All ${typeCount("all")}` }, { value: "recurring", label: `Recurring ${typeCount("recurring")}` }, { value: "action_item", label: `Action items ${typeCount("action_item")}` }, { value: "manual", label: `Manual ${typeCount("manual")}` }]} />
        {status !== "completed" && <Segmented label="Group by" value={group} onChange={(v) => set("group", v === "due" ? "" : v)} options={[{ value: "due", label: "By due date" }, { value: "type", label: "By type" }]} />}
      </div>
      <form data-cascade role="search" onSubmit={(e) => e.preventDefault()} className="mb-3 flex h-11 items-center gap-2 rounded-full px-3.5 md:h-10" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
        <Search size={15} strokeWidth={1.4} className="text-muted" aria-hidden />
        <input value={q} onChange={(e) => set("q", e.target.value)} aria-label="Search tasks" placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted" />
        {q && <button type="button" onClick={() => set("q", "")} aria-label="Clear search" className="hit -mr-2.5 grid place-items-center text-muted"><X size={15} aria-hidden /></button>}
      </form>
      {secondary.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {secondary.map(([k, text]) => <button key={k} onClick={() => set(k, "all")} aria-label={`Remove filter ${text}`} className="inline-flex h-7 items-center gap-1.5 rounded-full pl-3 pr-2 text-[12px] text-muted" style={{ boxShadow: "0 0 0 1px var(--line)" }}>{text}<X size={12} aria-hidden /></button>)}
        </div>
      )}
      <p className="mono mb-1 px-1 !normal-case !tracking-normal" aria-live="polite">{shown.length} {status === "completed" ? "completed (last 14 days)" : "open"}{module !== "all" ? ` · ${MODULES_META[module].label}` : ""}{h ? ` · ${HORIZON_LABELS[h]}` : ""}</p>

      {loading ? <Empty>Loading…</Empty> : error && tasks.length === 0 ? <Empty>{error}</Empty> : status === "completed" ? (
        shown.length ? <ul>{shown.map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={toggle} onOpen={(x) => setEditing({ task: x })} showModule={module === "all"} />)}</ul> : <Empty>Nothing completed recently.</Empty>
      ) : (
        group === "type" ? <TypeGroups tasks={shown} today={today} onToggle={toggle} onOpen={(x) => setEditing({ task: x })} showModule={module === "all"} detail={taskDetail} /> : <TaskGroups tasks={shown} today={today} weekStart={weekStart} onToggle={toggle} onOpen={(x) => setEditing({ task: x })} only={h} showModule={module === "all"} detail={taskDetail} />
      )}

      {menu && (
        <Modal title="Filters" onClose={() => setMenu(false)} footer={<><Btn variant="ghost" onClick={() => { set("priority", "all"); set("status", "all"); set("project", "all"); }}>Clear all</Btn><Btn variant="primary" onClick={() => setMenu(false)}>Done</Btn></>}>
          <div className="space-y-5">
            <Field label="Priority">{() => <Chips label="Priority" value={priority === "all" ? [] : [priority]} onChange={(v) => set("priority", v[v.length - 1] ?? "all")} options={PRIORITIES} />}</Field>
            <Field label="Status">{(id) => <Select id={id} value={status} onChange={(v) => set("status", v)} options={STATUSES} />}</Field>
            <Field label="Project" hint={projects.length === 0 ? "No projects in this view yet." : undefined}>{(id) => <Select id={id} value={project} onChange={(v) => set("project", v)} options={[{ value: "all", label: "Any project" }, ...projects.map((p) => ({ value: p, label: p }))]} />}</Field>
          </div>
        </Modal>
      )}
      {editing && <TaskEditor task={editing.task} defaults={module !== "all" ? { module } : undefined} onClose={() => setEditing(null)} />}
    </div>
  );
}
