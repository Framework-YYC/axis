import { addDays } from "./rotation";

/** The structural subset of a task the views need (so this file has no UI or DOM dependencies). */
export interface ViewTask {
  title: string;
  notes?: string | null;
  status: string;
  priority: string;
  category: string | null;
  dueDate: string | null;
  scheduledDate: string | null;
  archivedAt: string | null;
  completedAt: string | null;
}

export const VIEW_IDS = ["today", "tomorrow", "week", "month", "later", "inbox", "overdue", "done", "all", "active", "waiting"] as const;
export type ViewId = (typeof VIEW_IDS)[number];
export const isView = (v: string | null): v is ViewId => !!v && (VIEW_IDS as readonly string[]).includes(v);

const isOpen = (t: ViewTask) => t.status !== "completed" && !t.archivedAt;

export function inView(t: ViewTask, view: ViewId, today: string): boolean {
  const d = t.dueDate;
  if (view === "done") return t.status === "completed" && !t.archivedAt;
  if (!isOpen(t)) return false;
  switch (view) {
    case "today": return d === today;
    case "tomorrow": return d === addDays(today, 1);
    case "week": return !!d && d >= today && d <= addDays(today, 7);
    case "month": return !!d && d >= today && d <= addDays(today, 30);
    case "later": return !!d && d > addDays(today, 30);
    case "inbox": return !d && !t.scheduledDate;
    case "overdue": return !!d && d < today;
    case "active": return t.status === "in_progress";
    case "waiting": return t.status === "waiting";
    case "all": return true;
  }
}

export function filterTasks<T extends ViewTask>(tasks: T[], view: ViewId, today: string, opts: { category?: string | null; q?: string | null } = {}): T[] {
  const q = opts.q?.trim().toLowerCase();
  const out = tasks.filter((t) => inView(t, view, today) && (!opts.category || t.category === opts.category) && (!q || t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q)));
  if (view === "done") return out.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2));
}

export function countViews(tasks: ViewTask[], today: string): Record<ViewId, number> {
  const out = {} as Record<ViewId, number>;
  for (const v of VIEW_IDS) out[v] = tasks.filter((t) => inView(t, v, today)).length;
  return out;
}

/** 4 = critical ... 1 = low, for the segmented priority indicator. */
export const priorityLevel = (p: string): number => ({ critical: 4, high: 3, medium: 2, low: 1 })[p] ?? 2;
