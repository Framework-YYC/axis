import { Check, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, DemoBadge, Empty, PageHeader, Segmented } from "../components/ui";
import type { Task } from "../lib/api";
import { localToday, pretty, relative, shift } from "../lib/dates";
import { useTasks } from "../lib/useTasks";

const VIEWS = [
  { value: "today", label: "Today" }, { value: "tomorrow", label: "Tomorrow" }, { value: "week", label: "This week" },
  { value: "month", label: "This month" }, { value: "later", label: "Long-term" }, { value: "inbox", label: "Inbox" },
  { value: "overdue", label: "Overdue" }, { value: "done", label: "Completed" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const PRIORITY_TONE = { critical: "bad", high: "warn", medium: "neutral", low: "neutral" } as const;
const STATUS_LABEL = { pending: "Pending", in_progress: "In progress", waiting: "Waiting", completed: "Completed" } as const;

export function filterTasks(tasks: Task[], view: View, today: string): Task[] {
  const open = tasks.filter((t) => t.status !== "completed" && !t.archivedAt);
  const d = (t: Task) => t.dueDate;
  switch (view) {
    case "today": return open.filter((t) => d(t) === today);
    case "tomorrow": return open.filter((t) => d(t) === shift(today, 1));
    case "week": return open.filter((t) => d(t) && d(t)! >= today && d(t)! <= shift(today, 7));
    case "month": return open.filter((t) => d(t) && d(t)! >= today && d(t)! <= shift(today, 30));
    case "later": return open.filter((t) => d(t) && d(t)! > shift(today, 30));
    case "inbox": return open.filter((t) => !t.dueDate && !t.scheduledDate);
    case "overdue": return open.filter((t) => d(t) && d(t)! < today);
    case "done": return tasks.filter((t) => t.status === "completed" && !t.archivedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }
}

export function TaskRow({ t, onToggle, today }: { t: Task; onToggle: (t: Task) => void; today: string }) {
  const done = t.status === "completed";
  const fromAssistant = t.source.kind === "integration";
  return (
    <li className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
      <button
        onClick={() => onToggle(t)}
        aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} completed`}
        aria-pressed={done}
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? "border-good bg-good text-bg" : "border-line text-transparent hover:border-muted"}`}
      >
        <Check size={16} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] ${done ? "text-muted line-through" : ""}`}>{t.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {t.dueDate && <span className={t.dueDate < today && !done ? "font-medium text-bad" : ""}>{relative(t.dueDate, today)}</span>}
          {t.category && <Badge>{t.category}</Badge>}
          {!done && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
          {t.status === "in_progress" || t.status === "waiting" ? <Badge tone="accent">{STATUS_LABEL[t.status]}</Badge> : null}
          {fromAssistant && <Badge tone="accent">via {t.source.name}</Badge>}
          {done && t.completedAt && <span>Completed {pretty(t.completedAt.slice(0, 10))}</span>}
        </div>
      </div>
    </li>
  );
}

export default function Tasks() {
  const { tasks, source, loading, error, complete, reopen, add } = useTasks();
  const [view, setView] = useState<View>("today");
  const [title, setTitle] = useState("");
  const today = localToday();
  const shown = useMemo(() => filterTasks(tasks, view, today), [tasks, view, today]);
  const counts = useMemo(() => ({ overdue: filterTasks(tasks, "overdue", today).length }), [tasks, today]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    setTitle("");
    await add(v);
  };

  return (
    <>
      <PageHeader title="Tasks" subtitle={pretty(today, { weekday: "long", month: "long", day: "numeric" })} actions={source === "demo" ? <DemoBadge /> : <Badge tone="good">Live</Badge>} />
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <label className="sr-only" htmlFor="new-task">New task</label>
        <input id="new-task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task to your inbox" maxLength={300} className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none placeholder:text-muted focus:border-accent" />
        <Button type="submit" variant="primary" icon={Plus} label="Add task">Add</Button>
      </form>
      <div className="mb-4"><Segmented label="Task views" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: v.value === "overdue" && counts.overdue ? `Overdue · ${counts.overdue}` : v.label }))} /></div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <Card className="p-4 sm:p-5">
        {loading ? <Empty>Loading…</Empty> : shown.length === 0 ? <Empty>Nothing here.</Empty> : (
          <ul>{shown.map((t) => <TaskRow key={t.id} t={t} today={today} onToggle={(x) => (x.status === "completed" ? reopen(x.id) : complete(x.id))} />)}</ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Tasks added or completed by an assistant appear here automatically. Recurring tasks, subtasks and reminders arrive in the next phase.</p>
    </>
  );
}
