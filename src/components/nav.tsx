import { Bot, CalendarDays, CheckSquare, HeartPulse, LayoutDashboard, type LucideIcon, Settings, Target, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { CATEGORIES } from "../lib/categories";
import { cx } from "../lib/cx";
import { localToday } from "../lib/dates";
import { useData } from "../lib/data";
import { countViews } from "../../shared/taskViews";

export interface Module { to: string; label: string; crumb: string; icon: LucideIcon }
export const MODULES: Module[] = [
  { to: "/", label: "Dashboard", crumb: "DASHBOARD", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", crumb: "TASKS", icon: CheckSquare },
  { to: "/finance", label: "Finance", crumb: "FINANCE", icon: Wallet },
  { to: "/health", label: "Health", crumb: "HEALTH", icon: HeartPulse },
  { to: "/calendar", label: "Calendar", crumb: "CALENDAR", icon: CalendarDays },
  { to: "/goals", label: "Goals", crumb: "GOALS", icon: Target },
  { to: "/intelligence", label: "Intelligence", crumb: "INTELLIGENCE", icon: Bot },
  { to: "/settings", label: "Settings", crumb: "SETTINGS", icon: Settings },
];

export interface NavItem { to: string; label: string; count?: number; hot?: boolean; dot?: "ok" | "bad" | "warn" | "idle" }
export interface NavGroup { label: string; items: NavItem[] }

const hashItems = (base: string, items: Array<[string, string]>): NavItem[] => items.map(([id, label]) => ({ to: `${base}#${id}`, label }));

const VIEW_LABELS: Array<[string, string]> = [["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This week"], ["month", "This month"], ["later", "Long-term"], ["inbox", "Inbox"], ["overdue", "Overdue"], ["done", "Completed"]];

/** The contextual navigation for the current module, plus the live status list and (on Tasks) the category folders. */
export function useNavModel(): { module: Module; groups: NavGroup[]; contextual: NavItem[] } {
  const { pathname } = useLocation();
  const { tasks, approvals } = useData();
  const today = localToday();
  const counts = useMemo(() => countViews(tasks, today), [tasks, today]);
  const module = MODULES.find((m) => (m.to === "/" ? pathname === "/" : pathname.startsWith(m.to))) ?? MODULES[0];

  return useMemo(() => {
    let main: NavItem[];
    switch (module.to) {
      case "/tasks": main = VIEW_LABELS.map(([v, l]) => ({ to: `/tasks?view=${v}`, label: l, count: counts[v as keyof typeof counts] })); break;
      case "/finance": main = hashItems("/finance", [["networth", "Net worth"], ["cashflow", "Cash flow"], ["budget", "Budget"], ["accounts", "Accounts"]]); break;
      case "/health": main = hashItems("/health", [["weight", "Weight"], ["today", "Today"], ["steps", "Steps"], ["workouts", "Workouts"]]); break;
      case "/calendar": main = [{ to: "/calendar?view=day", label: "Day" }, { to: "/calendar?view=week", label: "Week" }, { to: "/calendar?view=month", label: "Month" }]; break;
      case "/goals": main = hashItems("/goals", [["goals", "Goals"], ["habits", "Habits"]]); break;
      case "/intelligence": main = [{ to: "/intelligence#approvals", label: "Approvals", count: approvals.length, hot: true }, ...hashItems("/intelligence", [["assistants", "Assistants"], ["activity", "Activity"]])]; break;
      case "/settings": main = hashItems("/settings", [["appearance", "Appearance"], ["units", "Units & currency"], ["rotation", "Work rotation"], ["security", "Security"]]); break;
      default: main = hashItems("/", [["overview", "Overview"], ["priorities", "Priorities"], ["briefing", "Briefing"], ["schedule", "Schedule"], ["finance", "Finance"], ["health", "Health"], ["goals", "Goals"]]);
    }
    const groups: NavGroup[] = [{ label: module.label, items: main }];
    groups.push({
      label: "Live",
      items: [
        { to: "/tasks?view=today", label: "Due today", count: counts.today, dot: "ok" },
        { to: "/tasks?view=overdue", label: "Overdue", count: counts.overdue, dot: "bad" },
        { to: "/tasks?view=active", label: "In progress", count: counts.active, dot: "warn" },
        { to: "/intelligence#approvals", label: "Needs you", count: approvals.length, hot: true },
      ],
    });
    if (module.to === "/tasks") {
      groups.push({ label: "Folders", items: CATEGORIES.map(([id, name]) => ({ to: `/tasks?view=all&category=${id}`, label: name, count: tasks.filter((t) => t.category === id && t.status !== "completed" && !t.archivedAt).length })) });
    }
    return { module, groups, contextual: main };
  }, [module, counts, approvals.length, tasks]);
}

const DEFAULT_VIEW: Record<string, string> = { "/tasks": "today", "/calendar": "week" };

export function useIsActive() {
  const loc = useLocation();
  return (to: string, index = 0) => {
    const u = new URL(to, "http://x");
    if (u.pathname !== loc.pathname) return false;
    if (u.hash) return loc.hash === u.hash || (!loc.hash && index === 0 && u.pathname !== "/tasks");
    if (u.search) {
      const cur = new URLSearchParams(loc.search);
      for (const [k, v] of u.searchParams) if ((cur.get(k) ?? (k === "view" ? DEFAULT_VIEW[u.pathname] : undefined)) !== v) return false;
    }
    return true;
  };
}

/** Contextual navigation as scrollable chips, for iPad and iPhone (the secondary panel only fits on wide screens). */
export function ContextChips() {
  const { module, contextual } = useNavModel();
  const active = useIsActive();
  if (module.to === "/tasks") return null;
  return (
    <nav aria-label={`${module.label} sections`} className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 xl:hidden">
      {contextual.map((it, i) => (
        <Link key={it.to} to={it.to} aria-current={active(it.to, i) ? "true" : undefined} className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium", active(it.to, i) ? "raised text-ink" : "inset text-muted hover:text-ink")}>
          {it.label}
          {it.count ? <span className="mono !text-[10.5px]">{it.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
