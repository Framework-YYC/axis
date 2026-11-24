import { Bot, CalendarDays, ChevronsUpDown, LayoutDashboard, CheckSquare, MoreHorizontal, Monitor, Moon, Search, Sun, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { useTheme, type ThemeMode } from "../lib/theme";
import { ASSISTANT_NAV, MODULES, moduleOf, useIsActive, useNavModel, type NavGroup } from "./nav";
import { Btn } from "./ui";
import { EnvCard, EnvRailButton, StagingTag, useEnvironment } from "./EnvSwitch";

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[11px] bg-[var(--rail)] text-white shadow-[0_6px_12px_-6px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.16)]" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 12 5l7 14" /><path d="M8.2 14h7.6" /></svg>
    </span>
  );
}

/** Vertical 24-hour scale in the rail: elapsed hours dark, now in lime. Updates every minute. */
function DayScale() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const h = now.getHours();
  return (
    <div className="panel flex min-h-0 flex-1 flex-col items-center rounded-[22px] px-1.5 py-3" aria-label={`Day progress, hour ${h} of 24`} role="img">
      <span className="mono !text-[9px]">24h</span>
      <div className="mt-2 flex min-h-0 w-full flex-1 gap-1">
        <div className="flex flex-1 flex-col items-end justify-between py-0.5">
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} className="block rounded-full" style={{ width: i === h ? 22 : i % 6 === 0 ? 16 : 9, height: i === h ? 5 : 2, background: i === h ? "var(--lime)" : i < h ? "var(--ink)" : "var(--tick-off)", boxShadow: i === h ? "0 0 0 1.5px var(--ink)" : undefined }} />
          ))}
        </div>
        <span className="mono self-center !text-[8.5px] [writing-mode:vertical-rl] rotate-180 tracking-[0.18em] whitespace-nowrap">Axis · by Framework</span>
      </div>
    </div>
  );
}

function ThemeButton({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();
  const Icon = THEME_ICON[mode];
  return (
    <button onClick={cycle} aria-label={`Appearance: ${mode}. Tap to change.`} title={`Appearance: ${mode}`} className={cx("grid place-items-center", className)}>
      <Icon size={18} aria-hidden />
    </button>
  );
}

function RailStagingDot() {
  const { env } = useEnvironment();
  return env === "staging" ? <i aria-hidden className="absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-[var(--rail)]" style={{ background: "var(--amber)" }} /> : null;
}

function Rail() {
  return (
    <aside aria-label="Primary" className="sticky top-4 z-30 hidden h-[calc(100dvh-2rem)] w-[60px] shrink-0 flex-col gap-3 md:flex">
      <div className="flex flex-col items-center gap-0.5 rounded-[22px] bg-[var(--rail)] px-1.5 py-3 shadow-[0_22px_34px_-16px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.12),0_0_0_1px_rgb(255_255_255/0.04)]">
        <Link to="/" aria-label="Axis home" className="relative mb-1.5"><LogoMark size={36} /><RailStagingDot /></Link>
        {MODULES.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.to === "/"} aria-label={m.label} title={m.label} className={({ isActive }) => cx("relative grid size-10 place-items-center rounded-[13px] transition-colors", isActive ? "bg-white/12 text-white" : "text-[var(--rail-ink)] hover:text-white")}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-[7px] top-3 h-5 w-[3px] rounded-full bg-lime" />}
                <m.icon size={18} strokeWidth={1.7} aria-hidden />
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div className="hidden min-h-0 flex-1 tall:flex"><DayScale /></div>
      <div className="flex-1 tall:hidden" />
      <EnvRailButton />
      <ThemeButton className="h-12 w-full rounded-[18px] bg-[var(--rail)] text-white shadow-[0_14px_24px_-12px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.12)]" />
    </aside>
  );
}

function NavGroupView({ group, gi }: { group: NavGroup; gi: number }) {
  const active = useIsActive();
  return (
    <div className="mt-4 first:mt-0">
      <p className="mono mb-1.5 px-2.5 !text-[9.5px]">{group.label}</p>
      <ul className="space-y-0.5">
        {group.items.map((it, i) => {
          const on = gi === 0 && active(it.to, i);
          return (
            <li key={it.to}>
              <Link to={it.to} aria-current={on ? "page" : undefined} className={cx("flex h-9 items-center gap-2.5 rounded-[12px] px-2.5 text-[13px]", on ? "raised font-medium text-ink" : "text-muted hover:text-ink")}>
                {it.dot && <i className={cx("block size-2 rounded-[3px]", it.dot === "ok" && "border-2 border-[var(--lime-deep)]", it.dot === "bad" && "bg-red", it.dot === "warn" && "bg-amber", it.dot === "idle" && "border-2 border-faint")} />}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.count !== undefined && (it.hot ? (it.count > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1.5 text-[11px] font-semibold text-lime-ink num">{it.count}</span> : null) : <span className="mono num !text-[10.5px]">{it.count}</span>)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Identity({ compact }: { compact?: boolean }) {
  const { me } = useData();
  const initials = me.signedIn ? me.label.slice(0, 2).toUpperCase() : "··";
  return (
    <div className={cx("flex items-center gap-2.5", !compact && "panel-dim p-2.5")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[var(--rail)] text-[12px] font-semibold text-white">{initials}</span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium">{me.label}</p>
        <p className="mono truncate !text-[9.5px]">{me.signedIn ? `Signed in · ${me.environment}` : me.environment === "preview" ? "Local preview · demo data" : "Checking sign-in…"}</p>
      </div>
    </div>
  );
}

function SecondaryPanel({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const { groups } = useNavModel();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v) navigate(`/tasks?h=all&q=${encodeURIComponent(v)}`);
  };
  return (
    <aside aria-label="Section" className="panel sticky top-4 hidden h-[calc(100dvh-2rem)] w-[240px] shrink-0 flex-col rounded-[22px] p-3 xl:flex">
      <div className="raised flex items-center gap-2.5 rounded-[14px] p-2">
        <LogoMark size={34} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14px] font-medium leading-tight">Axis<StagingTag /></p>
          <p className="mono truncate !text-[9.5px]">By Framework</p>
        </div>
        <ChevronsUpDown size={14} className="text-faint" aria-hidden />
      </div>
      <form onSubmit={submit} role="search" className="inset mt-3 flex h-10 items-center gap-2 rounded-[12px] px-3">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
        <kbd className="kbd text-muted">⌘K</kbd>
      </form>
      <nav className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto">
        {groups.map((g, gi) => <NavGroupView key={g.label} group={g} gi={gi} />)}
      </nav>
      <div className="mb-2.5"><EnvCard compact /></div>
      <Identity />
    </aside>
  );
}

function Dock() {
  const [sheet, setSheet] = useState<null | "assistants" | "more">(null);
  const { pathname } = useLocation();
  const { me, approvals } = useData();
  useEffect(() => setSheet(null), [pathname]);
  const here = moduleOf(pathname);
  const Item = ({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Sun; end?: boolean }) => (
    <NavLink to={to} end={end} className={({ isActive }) => cx("relative flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[22px] text-[10px] font-medium", isActive ? "bg-white/12 text-white" : "text-[var(--rail-ink)]")}>
      <Icon size={20} strokeWidth={1.7} aria-hidden />
      {label}
    </NavLink>
  );
  const SheetBtn = ({ id, label, icon: Icon, on }: { id: "assistants" | "more"; label: string; icon: typeof Sun; on: boolean }) => (
    <button onClick={() => setSheet(id)} aria-haspopup="dialog" className={cx("relative flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[22px] text-[10px] font-medium", on ? "bg-white/12 text-white" : "text-[var(--rail-ink)]")}>
      <Icon size={20} strokeWidth={1.7} aria-hidden />{label}
      {id === "more" && approvals.length > 0 && <span className="absolute right-3 top-2 size-2 rounded-full bg-lime" />}
    </button>
  );
  const onAssistant = !!here.assistant;
  const onMore = here.to === "/goals" || here.to === "/settings";
  return (
    <>
      <nav aria-label="Primary" className="safe-b fixed inset-x-3 bottom-3 z-30 md:hidden">
        <ul className="grid grid-cols-5 gap-1 rounded-[30px] bg-[var(--rail)] p-1.5 shadow-[0_24px_40px_-14px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.12)]">
          <li><Item to="/" label="Overview" icon={LayoutDashboard} end /></li>
          <li><Item to="/tasks" label="Tasks" icon={CheckSquare} /></li>
          <li><SheetBtn id="assistants" label="Assistants" icon={Bot} on={onAssistant} /></li>
          <li><Item to="/calendar" label="Calendar" icon={CalendarDays} /></li>
          <li><SheetBtn id="more" label="More" icon={MoreHorizontal} on={onMore} /></li>
        </ul>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={sheet === "more" ? "More" : "Assistants"}>
          <button className="absolute inset-0 bg-black/45" aria-label="Close" onClick={() => setSheet(null)} />
          <div className="panel safe-b rise absolute inset-x-2 bottom-2 max-h-[85dvh] overflow-y-auto rounded-[28px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="mono">{sheet === "more" ? "More" : "Assistant modules"}</span>
              <button onClick={() => setSheet(null)} aria-label="Close" className="inset grid size-9 place-items-center rounded-full"><X size={16} /></button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {(sheet === "more" ? MODULES.filter((m) => m.to === "/goals" || m.to === "/settings") : ASSISTANT_NAV).map((m) => (
                <li key={m.to}>
                  <NavLink to={m.to} className="raised flex h-14 items-center gap-3 rounded-[18px] px-4 text-[14px] font-medium"><m.icon size={19} strokeWidth={1.7} aria-hidden />{m.label}</NavLink>
                </li>
              ))}
            </ul>
            {sheet === "more" && <div className="mt-4 flex items-center justify-between gap-3"><Identity compact /><ThemeSwitch /></div>}
            {sheet === "more" && <div className="mt-5"><EnvCard /></div>}
            <p className="sr-only">{me.label}</p>
          </div>
        </div>
      )}
    </>
  );
}

function ThemeSwitch() {
  const { mode, cycle } = useTheme();
  const Icon = THEME_ICON[mode as ThemeMode];
  return <Btn onClick={cycle} icon={Icon} variant="soft" label={`Appearance: ${mode}`}><span className="capitalize">{mode}</span></Btn>;
}

function PhoneStagingRow() {
  const { env } = useEnvironment();
  if (env !== "staging") return null;
  return <div className="mb-1 flex items-center gap-2 px-1 md:hidden"><LogoMark size={22} /><span className="mono !text-[10px]">Axis</span><StagingTag /></div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { source, error } = useData();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchRef.current && searchRef.current.offsetParent !== null) searchRef.current.focus();
        else navigate("/tasks?h=all");
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="safe-t mx-auto flex w-full max-w-[1800px] gap-3 p-3 pb-[calc(7.75rem+env(safe-area-inset-bottom))] md:gap-4 md:p-4 md:pb-4 lg:p-5">
      <Rail />
      <SecondaryPanel searchRef={searchRef} />
      <main className="min-w-0 flex-1 rounded-[28px] md:min-h-[calc(100dvh-2rem)] md:bg-[var(--sheet)] md:p-5 md:shadow-[var(--sh-sheet)] lg:min-h-[calc(100dvh-2.5rem)] lg:p-7">
        {source === "offline" && (
          <div role="alert" className="panel-dim mb-4 flex flex-wrap items-center justify-between gap-3 p-3.5 text-[13px]">
            <span><i className="mr-2 inline-block size-2 rounded-full bg-red align-middle" />{error}</span>
            <Btn variant="primary" onClick={() => location.reload()}>Reload</Btn>
          </div>
        )}
        <PhoneStagingRow />
        {children}
      </main>
      <Dock />
    </div>
  );
}
