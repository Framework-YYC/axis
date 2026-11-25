import { ArrowLeftRight, CalendarDays, LayoutDashboard, PlusCircle, Search, Settings, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { ENVIRONMENTS } from "../../shared/environments";
import { cx } from "../lib/cx";
import { prefersReducedMotion } from "../lib/motion";
import { EnvDot, useEnvironment } from "./EnvSwitch";
import { GlobalSearch } from "./GlobalSearch";
import { OrbitSymbol } from "./OrbitSymbol";
import { QuickAdd } from "./QuickAdd";

interface Orbis { openQuickAdd: () => void; openSearch: () => void }
const Ctx = createContext<Orbis>({ openQuickAdd: () => {}, openSearch: () => {} });
export const useOrbis = () => useContext(Ctx);

/** Owns the two global sheets (Quick Add and Search) so the dock, the rail and the keyboard shortcut all open the same ones. */
export function OrbisProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<"add" | "search" | null>(null);
  const openQuickAdd = useCallback(() => setSheet("add"), []);
  const openSearch = useCallback(() => setSheet("search"), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSheet("search"); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  return (
    <Ctx.Provider value={{ openQuickAdd, openSearch }}>
      {children}
      {sheet === "add" && <QuickAdd onClose={() => setSheet(null)} />}
      {sheet === "search" && <GlobalSearch onClose={() => setSheet(null)} />}
    </Ctx.Provider>
  );
}

/** Mount while open, keep mounted through the close transition, then unmount. Reduced motion closes at once. */
function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : 260);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted, shown };
}

const ROW = "hit press flex w-full items-center gap-3 rounded-[14px] px-3 text-left text-[14.5px] hover:bg-[var(--card-dim)] focus-visible:bg-[var(--card-dim)]";

function Item({ icon: Icon, label, hint, onClick, to, active }: { icon: LucideIcon; label: string; hint?: string; onClick?: () => void; to?: string; active?: boolean }) {
  const inner = <><Icon size={18} strokeWidth={1.4} aria-hidden className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{label}</span>{hint && <kbd className="kbd max-md:hidden">{hint}</kbd>}</>;
  return to ? <Link to={to} role="menuitem" aria-current={active ? "page" : undefined} onClick={onClick} className={cx(ROW, active && "bg-[var(--card-dim)] font-medium")}>{inner}</Link> : <button role="menuitem" onClick={onClick} className={ROW}>{inner}</button>;
}

/**
 * The central Orbis button and its floating glass menu. `dock` opens above the bar (phones), `rail` opens beside the rail (iPad, desktop).
 * Home, Quick Add, Calendar, Search, Settings and the environment switch live here.
 */
export function OrbisButton({ variant }: { variant: "dock" | "rail" }) {
  const [open, setOpen] = useState(false);
  const { mounted, shown } = usePresence(open);
  const { pathname } = useLocation();
  const { openQuickAdd, openSearch } = useOrbis();
  const { env, target, href } = useEnvironment();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);
  const lastPath = useRef(pathname);
  useEffect(() => { if (lastPath.current !== pathname) { lastPath.current = pathname; setOpen(false); } }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    addEventListener("keydown", key);
    const t = setTimeout(() => menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 60);
    return () => { removeEventListener("keydown", key); clearTimeout(t); };
  }, [open, close]);
  const run = (fn: () => void) => () => { setOpen(false); setTimeout(fn, prefersReducedMotion() ? 0 : 140); };
  const here = pathname === "/";
  const dock = variant === "dock";
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!open || dock) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.right + 14, top: Math.min(Math.max(r.top + r.height / 2, 190), innerHeight - 190) });
    const off = () => setOpen(false);
    addEventListener("resize", off);
    return () => removeEventListener("resize", off);
  }, [open, dock]);
  return (
    <>
      <button ref={btn} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Orbis menu" className={cx("orbis-btn relative z-30 grid place-items-center", dock ? "mx-auto size-[58px] rounded-full" : "size-11 rounded-full")}>
        <OrbitSymbol size={dock ? 30 : 25} stroke={dock ? 36 : 40} />
        {here && <i aria-hidden className="absolute -bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[var(--orbis-forest)]" />}
      </button>
      {mounted && createPortal(
        <>
          <button aria-label="Close menu" tabIndex={-1} onClick={() => close(false)} data-shown={shown} className="orbis-scrim fixed inset-0 z-[29] cursor-default bg-black/20" />
          <div className={cx("fixed z-[31]", dock ? "inset-x-3 bottom-[calc(5.9rem+env(safe-area-inset-bottom))] mx-auto w-[min(320px,calc(100vw-1.5rem))]" : "w-[272px] -translate-y-1/2")} style={dock ? undefined : { left: anchor.left, top: anchor.top }}>
            <ul ref={menu} role="menu" aria-label="Orbis" data-shown={shown} data-side={dock ? "top" : "right"} className="orbis-pop glass rounded-[24px] p-1.5">
              <li role="none" style={{ "--i": 0 } as React.CSSProperties}><Item icon={LayoutDashboard} label="Home" to="/" active={here} onClick={() => setOpen(false)} /></li>
              <li role="none" style={{ "--i": 1 } as React.CSSProperties}><Item icon={PlusCircle} label="Quick Add" onClick={run(openQuickAdd)} /></li>
              <li role="none" style={{ "--i": 2 } as React.CSSProperties}><Item icon={CalendarDays} label="Calendar" to="/calendar" active={pathname.startsWith("/calendar")} onClick={() => setOpen(false)} /></li>
              <li role="none" style={{ "--i": 3 } as React.CSSProperties}><Item icon={Search} label="Search" hint="⌘K" onClick={run(openSearch)} /></li>
              <li role="none" style={{ "--i": 4 } as React.CSSProperties}><Item icon={Settings} label="Settings" to="/settings" active={pathname.startsWith("/settings")} onClick={() => setOpen(false)} /></li>
              {env && (
                <li role="none" style={{ "--i": 5 } as React.CSSProperties} className="mt-1 border-t border-line pt-1">
                  {href && target ? (
                    <a role="menuitem" href={href} rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Switch to ${ENVIRONMENTS[target].label}. Opens the same page there; you may be asked to sign in.`} className={ROW}>
                      <ArrowLeftRight size={18} strokeWidth={1.4} aria-hidden className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">Switch to {ENVIRONMENTS[target].label}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted"><EnvDot env={env} size={7} />{env === "staging" ? "Staging" : "Production"}</span>
                    </a>
                  ) : (
                    <p className="flex min-h-11 items-center gap-3 px-3 text-[13px] text-muted"><EnvDot env={env} size={8} />Local development: no switch</p>
                  )}
                </li>
              )}
            </ul>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
