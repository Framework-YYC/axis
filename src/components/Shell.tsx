import { Bot, CalendarDays, CheckSquare, HeartPulse, LayoutDashboard, type LucideIcon, Monitor, MoreHorizontal, Moon, Settings, Sun, Target, Wallet, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cx } from "./ui";
import { useTheme, type ThemeMode } from "../lib/theme";

interface Item { to: string; label: string; icon: LucideIcon }
export const NAV: Item[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/finance", label: "Finance", icon: Wallet },
  { to: "/health", label: "Health", icon: HeartPulse },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/intelligence", label: "Intelligence", icon: Bot },
  { to: "/settings", label: "Settings", icon: Settings },
];
const PRIMARY = NAV.slice(0, 4);
const MORE = NAV.slice(4);

const THEME_ICON: Record<ThemeMode, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };
function ThemeButton({ compact }: { compact?: boolean }) {
  const { mode, cycle } = useTheme();
  const Icon = THEME_ICON[mode];
  return (
    <button onClick={cycle} aria-label={`Appearance: ${mode}. Tap to change.`} className={cx("flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:text-ink", compact && "justify-center px-0")}>
      <Icon size={18} aria-hidden />
      {!compact && <span className="capitalize">{mode}</span>}
    </button>
  );
}

function SideLink({ item, compact }: { item: Item; compact: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", compact && "flex-col justify-center gap-0.5 px-1 py-2 text-[10px]", isActive ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")
      }
    >
      <item.icon size={compact ? 20 : 18} aria-hidden />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Shell({ children, who }: { children: ReactNode; who: string }) {
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMore(false), [pathname]);
  const moreActive = MORE.some((m) => pathname.startsWith(m.to));

  return (
    <div className="flex min-h-full">
      {/* iPad portrait: icon rail. iPad landscape and desktop: full sidebar. Phone: bottom bar. */}
      <aside className="safe-t sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-line bg-bg px-2 py-5 md:flex lg:w-60 lg:px-3" aria-label="Primary">
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-ink text-sm text-bg">A</span>
          <span className="hidden lg:inline">Axis</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <div key={n.to}>
              <div className="lg:hidden"><SideLink item={n} compact /></div>
              <div className="hidden lg:block"><SideLink item={n} compact={false} /></div>
            </div>
          ))}
        </nav>
        <div className="lg:hidden"><ThemeButton compact /></div>
        <div className="hidden lg:block">
          <ThemeButton />
          <p className="mt-2 truncate px-3 text-xs text-muted" title={who}>{who}</p>
        </div>
      </aside>

      <main className="safe-t min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:pt-8 md:pb-10 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <nav aria-label="Primary" className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === "/"} className={({ isActive }) => cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium", isActive ? "text-accent" : "text-muted")}>
                <n.icon size={22} aria-hidden />
                {n.label}
              </NavLink>
            </li>
          ))}
          <li>
            <button onClick={() => setMore(true)} aria-haspopup="dialog" className={cx("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium", moreActive ? "text-accent" : "text-muted")}>
              <MoreHorizontal size={22} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      {more && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setMore(false)} />
          <div className="safe-b rise absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">More</span>
              <button onClick={() => setMore(false)} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-surface-2"><X size={18} /></button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {MORE.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-sm font-medium">
                    <n.icon size={20} aria-hidden />
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between px-1"><span className="truncate text-xs text-muted">{who}</span><ThemeButton /></div>
          </div>
        </div>
      )}
    </div>
  );
}
