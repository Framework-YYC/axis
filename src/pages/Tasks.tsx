import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { TaskLine } from "../components/TaskLine";
import { Btn, DemoTag, PageHeader, Panel, Segmented, Tag, cx } from "../components/ui";
import { CATEGORIES, categoryName } from "../lib/categories";
import { useData } from "../lib/data";
import { localToday, pretty } from "../lib/dates";
import { countViews, filterTasks, isView, type ViewId } from "../../shared/taskViews";

const MAIN_VIEWS: Array<[ViewId, string]> = [["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This week"], ["month", "This month"], ["later", "Long-term"], ["inbox", "Inbox"], ["overdue", "Overdue"], ["done", "Completed"]];
const EXTRA: Partial<Record<ViewId, string>> = { all: "All open", active: "In progress", waiting: "Waiting" };

export default function Tasks() {
  const { tasks, source, loading, error, complete, reopen, add } = useData();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("view");
  const view: ViewId = isView(raw) ? raw : "today";
  const category = sp.get("category");
  const q = sp.get("q");
  const today = localToday();
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("add");
    setSp(next, { replace: true });
  };
  useEffect(() => { if (sp.get("add")) input.current?.focus(); }, [sp]);

  const shown = useMemo(() => filterTasks(tasks, view, today, { category, q }), [tasks, view, today, category, q]);
  const counts = useMemo(() => countViews(tasks, today), [tasks, today]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    setTitle("");
    await add(v);
  };

  return (
    <>
      <PageHeader
        crumb="TASKS"
        title="Tasks"
        subtitle={pretty(today, { weekday: "long", day: "numeric", month: "long" })}
        controls={<Segmented<ViewId> label="Task views" value={view} onChange={(v) => set("view", v)} options={MAIN_VIEWS.map(([value, label]) => ({ value, label: value === "overdue" && counts.overdue ? `Overdue · ${counts.overdue}` : label }))} />}
        tag={source === "demo" ? <DemoTag text="Local preview · synthetic data" /> : source === "live" ? <Tag>Live from Axis</Tag> : undefined}
      />

      <form onSubmit={submit} className="mb-3 flex gap-2">
        <label className="sr-only" htmlFor="new-task">New task</label>
        <div className="inset flex h-12 flex-1 items-center gap-3 rounded-full px-4">
          <Plus size={16} className="shrink-0 text-muted" aria-hidden />
          <input id="new-task" ref={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task to your inbox" maxLength={300} className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted" />
        </div>
        <Btn type="submit" variant="primary" kbd="↵" className="!min-h-12 !px-5">Add</Btn>
      </form>

      <nav aria-label="Categories" className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1 xl:hidden">
        {[["", "All categories"] as const, ...CATEGORIES].map(([id, name]) => (
          <button key={id || "all"} onClick={() => set("category", id || null)} className={cx("h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium", (category ?? "") === id ? "raised text-ink" : "inset text-muted")}>{name}</button>
        ))}
      </nav>

      {(EXTRA[view] || category || q) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {EXTRA[view] && <span className="pill">{EXTRA[view]}<button aria-label="Clear view filter" onClick={() => set("view", "today")}><X size={12} /></button></span>}
          {category && <span className="pill">{categoryName(category)}<button aria-label="Clear category filter" onClick={() => set("category", null)}><X size={12} /></button></span>}
          {q && <span className="pill"><Search size={12} aria-hidden />“{q}”<button aria-label="Clear search" onClick={() => set("q", null)}><X size={12} /></button></span>}
        </div>
      )}

      {error && <p role="alert" className="panel-dim mb-3 p-3 text-[13px] text-red">{error}</p>}
      <Panel className="p-4 md:p-5">
        <div className="mb-1 flex items-center justify-between"><span className="mono">{shown.length} {shown.length === 1 ? "task" : "tasks"}</span><span className="mono">Priority · status</span></div>
        {loading ? <p className="mono py-8 text-center">Loading…</p> : shown.length === 0 ? <p className="mono py-10 text-center !normal-case">Nothing here.</p> : (
          <ul>{shown.map((t) => <TaskLine key={t.id} t={t} today={today} onToggle={(x) => (x.status === "completed" ? void reopen(x.id) : void complete(x.id))} />)}</ul>
        )}
      </Panel>
      <p className="mono mt-3 !normal-case">Tasks an assistant adds or completes appear here automatically. Recurring tasks, subtasks and reminders arrive in the next phase.</p>
    </>
  );
}
