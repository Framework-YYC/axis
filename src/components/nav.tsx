import { CalendarDays, CheckSquare, LayoutDashboard, type LucideIcon, Settings, Target } from "lucide-react";
import { ASSISTANT_ICONS } from "../lib/moduleStyle";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { HORIZONS, HORIZON_LABELS, horizonOf } from "../../shared/horizons";
import { MODULE_IDS, MODULES_META, type ModuleId } from "../../shared/modules";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";

export interface Module { to: string; label: string; crumb: string; icon: LucideIcon; assistant?: ModuleId }
export { ASSISTANT_ICONS } from "../lib/moduleStyle";

const assistantNav = (id: ModuleId): Module => ({ to: `/m/${id}`, label: MODULES_META[id].label, crumb: MODULES_META[id].label.toUpperCase(), icon: ASSISTANT_ICONS[id], assistant: id });
/** Overview, Tasks, the five assistant modules, Calendar, Goals & Habits, Settings. */
export const MODULES: Module[] = [
  { to: "/", label: "Overview", crumb: "OVERVIEW", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", crumb: "TASKS", icon: CheckSquare },
  ...MODULE_IDS.map(assistantNav),
  { to: "/calendar", label: "Calendar", crumb: "CALENDAR", icon: CalendarDays },
  { to: "/goals", label: "Goals & Habits", crumb: "GOALS & HABITS", icon: Target },
  { to: "/settings", label: "Settings", crumb: "SETTINGS", icon: Settings },
];
export const ASSISTANT_NAV = MODULES.filter((m) => m.assistant);

export interface NavItem { to: string; label: string; count?: number; hot?: boolean; dot?: "ok" | "bad" | "warn" | "idle" }
export interface NavGroup { label: string; items: NavItem[] }

export const MODULE_TABS: Array<[string, string]> = [["overview", "Overview"], ["tasks", "Tasks"], ["goals", "Goals"], ["habits", "Habits"], ["briefing", "Briefing"], ["activity", "Activity"], ["metrics", "Metrics"]];
const hashItems = (base: string, items: Array<[string, string]>): NavItem[] => items.map(([id, label]) => ({ to: `${base}#${id}`, label }));

export function moduleOf(pathname: string): Module {
  return MODULES.find((m) => (m.to === "/" ? pathname === "/" : pathname === m.to || pathname.startsWith(`${m.to}/`))) ?? MODULES[0];
}

/** The contextual navigation for the current page, plus the live status list and the assistant shortcuts. */
export function useNavModel(): { module: Module; groups: NavGroup[]; contextual: NavItem[] } {
  const { pathname } = useLocation();
  const { tasks, approvals, today, weekStart } = useData();
  const module = moduleOf(pathname);

  return useMemo(() => {
    const open = tasks.filter((t) => t.status !== "completed" && !t.archivedAt);
    const hz = Object.fromEntries(HORIZONS.map((h) => [h, 0])) as Record<(typeof HORIZONS)[number], number>;
    for (const t of open) hz[horizonOf(t.dueDate, today, weekStart)]++;
    const modCount = (id: string) => open.filter((t) => t.module === id).length;
    let main: NavItem[];
    if (module.assistant) main = MODULE_TABS.map(([t, l]) => ({ to: `${module.to}?tab=${t}`, label: l, count: t === "tasks" ? modCount(module.assistant!) : undefined }));
    else if (module.to === "/tasks") main = [{ to: "/tasks?h=all", label: "All open", count: open.length }, ...HORIZONS.map((h) => ({ to: `/tasks?h=${h}`, label: HORIZON_LABELS[h], count: hz[h] })), { to: "/tasks?h=done", label: "Completed" }];
    else if (module.to === "/calendar") main = [{ to: "/calendar?view=week", label: "Week" }, { to: "/calendar?view=month", label: "Month" }, { to: "/calendar?view=day", label: "Day" }];
    else if (module.to === "/goals") main = hashItems("/goals", [["goals", "Goals"], ["habits", "Habits"]]);
    else if (module.to === "/settings") main = hashItems("/settings", [["preferences", "Preferences"], ["rotation", "Work rotation"], ["approvals", "Approvals"], ["assistants", "Assistants"], ["activity", "Activity"], ["connections", "Connections"], ["data", "Demo data"], ["security", "Security"]]);
    else main = hashItems("/", [["priorities", "Priorities"], ["schedule", "Schedule"], ["goals", "Goals"], ["habits", "Habits"], ["modules", "Modules"], ["activity", "Assistant activity"]]);
    const groups: NavGroup[] = [{ label: module.label, items: main }];
    groups.push({
      label: "Live",
      items: [
        { to: "/tasks?h=today", label: "Due today", count: hz.today, dot: "ok" },
        { to: "/tasks?h=overdue", label: "Overdue", count: hz.overdue, dot: "bad" },
        { to: "/settings#approvals", label: "Needs you", count: approvals.length, hot: true },
      ],
    });
    groups.push({ label: "Assistants", items: ASSISTANT_NAV.map((m) => ({ to: m.to, label: m.label, count: modCount(m.assistant!) })) });
    return { module, groups, contextual: main };
  }, [module, tasks, approvals.length, today, weekStart]);
}

const DEFAULTS: Record<string, string> = { tab: "overview", h: "all", view: "week" };

export function useIsActive() {
  const loc = useLocation();
  return (to: string, index = 0) => {
    const u = new URL(to, "http://x");
    if (u.pathname !== loc.pathname) return false;
    if (u.hash) return loc.hash === u.hash || (!loc.hash && index === 0);
    if (u.search) {
      const cur = new URLSearchParams(loc.search);
      for (const [k, v] of u.searchParams) if ((cur.get(k) ?? DEFAULTS[k]) !== v) return false;
    }
    return true;
  };
}

/** Contextual navigation as scrollable chips, for iPad and iPhone (the secondary panel only fits on wide screens). */
export function ContextChips() {
  const { module, contextual } = useNavModel();
  const active = useIsActive();
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
