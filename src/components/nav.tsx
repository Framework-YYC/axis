import { CalendarDays, CheckSquare, LayoutDashboard, type LucideIcon, Settings, Target } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { HORIZONS, HORIZON_LABELS, horizonOf } from "../../shared/horizons";
import { ALL_TABS, MODULE_ONLY_TABS, MORE_TABS, NAV_MEMBERS, NAV_META, NAV_MODULE_IDS, PRIMARY_TABS, type NavModuleId, type TabId } from "../../shared/modules";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { NAV_ICONS } from "../lib/moduleStyle";

export interface Module { to: string; label: string; crumb: string; icon: LucideIcon; /** Set for the four navigable screens (Personal, Finance, Framework, Work). */ nav?: NavModuleId }
export { ASSISTANT_ICONS, NAV_ICONS } from "../lib/moduleStyle";

const moduleNav = (id: NavModuleId): Module => ({ to: `/m/${id}`, label: NAV_META[id].label, crumb: NAV_META[id].label.toUpperCase(), icon: NAV_ICONS[id], nav: id });
export const HOME: Module = { to: "/", label: "Home", crumb: "OVERVIEW", icon: LayoutDashboard };
/** The four module destinations (Daily and Health are one: Personal). The dock puts Orbis between the second and third; Home lives in the Orbis menu. */
export const MODULE_DESTINATIONS: Module[] = NAV_MODULE_IDS.map(moduleNav);
export const DESTINATIONS: Module[] = [HOME, ...MODULE_DESTINATIONS];
/** Cross-module screens. Reached from Home, from module tabs and, on wider screens, from the rail. */
export const UTILITY: Module[] = [
  { to: "/tasks", label: "Tasks", crumb: "TASKS", icon: CheckSquare },
  { to: "/goals", label: "Goals & Habits", crumb: "GOALS & HABITS", icon: Target },
  { to: "/calendar", label: "Calendar", crumb: "CALENDAR", icon: CalendarDays },
  { to: "/settings", label: "Settings", crumb: "SETTINGS", icon: Settings },
];
export const MODULES: Module[] = [...DESTINATIONS, ...UTILITY];

export interface NavItem { to: string; label: string; count?: number; hot?: boolean; dot?: "ok" | "bad" | "warn" | "idle" }
export interface NavGroup { label: string; items: NavItem[] }

export type { TabId };
export const TAB_LABEL: Record<TabId, string> = { health: "Health", appointments: "Appointments", overview: "Overview", tasks: "Tasks", goals: "Goals", habits: "Habits", calendar: "Calendar", progress: "Progress", procurement: "Procurement", transactions: "Transactions", bills: "Bills", accounts: "Accounts", budgets: "Budgets", reports: "Reports", briefing: "Briefing", activity: "Activity", metrics: "Metrics" };
export { ALL_TABS };
export const primaryTabs = (m: NavModuleId): TabId[] => [...PRIMARY_TABS[m]];
/** Everything else stays reachable from the tab bar's More menu. */
export const moreTabs = (m: NavModuleId): TabId[] => (MORE_TABS[m] ? [...MORE_TABS[m]!] : ALL_TABS.filter((t) => !PRIMARY_TABS[m].includes(t) && (!MODULE_ONLY_TABS[t] || MODULE_ONLY_TABS[t] === m)));
export const isTab = (v: string | null): v is TabId => !!v && (ALL_TABS as string[]).includes(v);

const hashItems = (base: string, items: Array<[string, string]>): NavItem[] => items.map(([id, label]) => ({ to: `${base}#${id}`, label }));

export function moduleOf(pathname: string): Module {
  return MODULES.find((m) => (m.to === "/" ? pathname === "/" : pathname === m.to || pathname.startsWith(`${m.to}/`))) ?? HOME;
}
/** The dock highlights the module being viewed; on every other screen (Home, Tasks, Calendar, Settings) no module is selected and the Orbis button carries the state. */
export const dockActive = (pathname: string): string | null => { const m = moduleOf(pathname); return m.nav ? m.to : null; };

/** The contextual navigation for the current page, the live status list and the cross-module shortcuts. */
export function useNavModel(): { module: Module; groups: NavGroup[]; contextual: NavItem[] } {
  const { pathname } = useLocation();
  const { tasks, approvals, today, weekStart } = useData();
  const module = moduleOf(pathname);

  return useMemo(() => {
    const open = tasks.filter((t) => t.status !== "completed" && !t.archivedAt);
    const hz = Object.fromEntries(HORIZONS.map((h) => [h, 0])) as Record<(typeof HORIZONS)[number], number>;
    for (const t of open) hz[horizonOf(t.dueDate, today, weekStart)]++;
    const modCount = (id: NavModuleId) => open.filter((t) => (NAV_MEMBERS[id] as readonly string[]).includes(t.module)).length;
    let main: NavItem[];
    const groups: NavGroup[] = [];
    if (module.nav) {
      const id = module.nav;
      const item = (t: TabId): NavItem => ({ to: `${module.to}?tab=${t}`, label: TAB_LABEL[t], count: t === "tasks" ? modCount(id) : undefined });
      main = primaryTabs(id).map(item);
      groups.push({ label: module.label, items: main }, { label: "More", items: moreTabs(id).map(item) });
    } else if (module.to === "/tasks") { main = [{ to: "/tasks?h=all", label: "All open", count: open.length }, ...HORIZONS.map((h) => ({ to: `/tasks?h=${h}`, label: HORIZON_LABELS[h], count: hz[h] })), { to: "/tasks?status=completed", label: "Completed" }]; groups.push({ label: module.label, items: main }); }
    else if (module.to === "/calendar") { main = [{ to: "/calendar?view=week", label: "Week" }, { to: "/calendar?view=month", label: "Month" }, { to: "/calendar?view=day", label: "Day" }]; groups.push({ label: module.label, items: main }); }
    else if (module.to === "/goals") { main = hashItems("/goals", [["goals", "Goals"], ["habits", "Habits"]]); groups.push({ label: module.label, items: main }); }
    else if (module.to === "/settings") { main = hashItems("/settings", [["environment", "Environment"], ["preferences", "Preferences"], ["rotation", "Work rotation"], ["approvals", "Approvals"], ["assistants", "Assistants"], ["connections", "Connections"], ["activity", "Activity"], ["data", "Demo data"], ["security", "Security"]]); groups.push({ label: module.label, items: main }); }
    else { main = [{ to: "/", label: "Overview" }, { to: "/tasks", label: "Tasks", count: open.length }, { to: "/goals", label: "Goals" }, { to: "/calendar", label: "Calendar" }]; groups.push({ label: module.label, items: main }); }
    groups.push({
      label: "Live",
      items: [
        { to: "/tasks?h=today", label: "Due today", count: hz.today, dot: "ok" },
        { to: "/tasks?h=overdue", label: "Overdue", count: hz.overdue, dot: "bad" },
        { to: "/settings#approvals", label: "Needs you", count: approvals.length, hot: true },
      ],
    });
    if (module.to !== "/") groups.push({ label: "Go to", items: [{ to: "/", label: "Home" }, { to: "/tasks", label: "All tasks", count: open.length }, { to: "/goals", label: "Goals & habits" }, { to: "/calendar", label: "Calendar" }, { to: "/settings", label: "Settings" }] });
    return { module, groups, contextual: main };
  }, [module, tasks, approvals.length, today, weekStart]);
}

const DEFAULTS: Record<string, string> = { tab: "overview", h: "all", view: "week", module: "all", status: "all" };

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

/** Contextual navigation as scrollable chips for the cross-module screens on iPad and iPhone. Module pages use their own tab bar. */
export function ContextChips() {
  const { module, contextual } = useNavModel();
  const active = useIsActive();
  if (module.nav || module.to === "/" || module.to === "/tasks") return null; // modules have their own tab bar; Tasks has its selectors
  return (
    <nav aria-label={`${module.label} sections`} className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 xl:hidden">
      {contextual.map((it, i) => (
        <Link key={it.to} to={it.to} aria-current={active(it.to, i) ? "true" : undefined} className={cx("hit inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px]", active(it.to, i) ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "text-muted")} style={active(it.to, i) ? undefined : { boxShadow: "0 0 0 1px var(--line)" }}>
          {it.label}
          {it.count ? <span className="mono !text-[10.5px] !text-current opacity-70">{it.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
