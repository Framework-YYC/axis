import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { useSlidingIndicator } from "../lib/motion";
import { useTheme } from "../lib/theme";
import { DESTINATIONS, dockActive, moduleOf, UTILITY, useIsActive, useNavModel, type NavGroup } from "./nav";
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
  const { pathname } = useLocation();
  const active = moduleOf(pathname).to;
  const { host, indicator } = useSlidingIndicator<HTMLDivElement>(active, { className: "glass-bubble rounded-[13px]" });
  const { env } = useEnvironment();
  return (
    <aside aria-label="Primary" className="sticky top-4 z-30 hidden h-[calc(100dvh-2rem)] w-[60px] shrink-0 flex-col gap-3 md:flex">
      <div ref={host} className="glass relative flex flex-col items-center gap-0.5 rounded-[22px] px-1.5 py-3">
        {indicator}
        <Link to="/" aria-label="Axis home" className="press relative z-10 mb-1.5"><LogoMark size={36} /><RailStagingDot /></Link>
        {env === "staging" && <span className="relative z-10 -mt-0.5 mb-1.5 font-mono text-[7.5px] font-medium tracking-[0.1em]" style={{ color: "var(--amber)" }}>STAGING</span>}
        {[...DESTINATIONS, null, ...UTILITY].map((m, i) => m === null ? <i key={`sep${i}`} aria-hidden className="my-1.5 block h-px w-6" style={{ background: "var(--glass-border)" }} /> : (
          <Link key={m.to} to={m.to} data-ikey={m.to} aria-label={m.label} title={m.label} aria-current={active === m.to ? "page" : undefined} className={cx("nav-item press relative z-10 grid size-10 place-items-center rounded-[13px]", active === m.to ? "text-[var(--dock-ink-on)]" : "text-[var(--dock-ink)] hover:text-[var(--dock-ink-on)]")}>
            <m.icon size={18} strokeWidth={1.4} aria-hidden />
          </Link>
        ))}
      </div>
      <div className="hidden min-h-0 flex-1 tall:flex"><DayScale /></div>
      <div className="flex-1 tall:hidden" />
      <EnvRailButton />
      <ThemeButton className="glass h-12 w-full rounded-[18px] text-[var(--dock-ink-on)]" />
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
      <form onSubmit={submit} role="search" className="inset flex h-10 items-center gap-2 rounded-[12px] px-3">
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

/** The persistent floating dock: six permanent destinations on a glass material with one animated selection bubble. Icon-only below 360 px. */
function Dock() {
  const { pathname } = useLocation();
  const { approvals } = useData();
  const here = dockActive(pathname);
  const { host, indicator } = useSlidingIndicator<HTMLUListElement>(here, { inset: 0, className: "glass-bubble rounded-[20px]" });
  return (
    <nav aria-label="Primary" className="safe-b fixed inset-x-2.5 bottom-2.5 z-30 md:hidden">
      <ul ref={host} className="glass relative grid grid-cols-6 gap-0.5 rounded-[26px] p-1">
        {indicator}
        {DESTINATIONS.map((m) => {
          const on = here === m.to;
          return (
            <li key={m.to} className="relative z-10">
              <Link to={m.to} data-ikey={m.to} aria-label={m.label} aria-current={on ? "page" : undefined} className={cx("nav-item press relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-[20px]", on ? "text-[var(--dock-ink-on)]" : "text-[var(--dock-ink)]")}>
                <m.icon size={19} strokeWidth={1.3} aria-hidden />
                <span className="max-w-full truncate text-[9.5px] font-normal leading-none tracking-[0.01em] max-[359px]:sr-only">{m.label}</span>
                {m.to === "/" && approvals.length > 0 && <i aria-hidden className="absolute right-2.5 top-2 size-1.5 rounded-full" style={{ background: "var(--w-terra)" }} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
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
  const { pathname } = useLocation();

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
        <div key={moduleOf(pathname).to} className="page-in">{children}</div>
      </main>
      <Dock />
    </div>
  );
}
