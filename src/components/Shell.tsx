import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { PageFrame, useSlidingIndicator } from "../lib/motion";
import { useTheme } from "../lib/theme";
import { dockActive, MODULE_DESTINATIONS, moduleOf, useIsActive, useNavModel, type NavGroup } from "./nav";
import { Btn } from "./ui";
import { EnvCard, EnvRailButton, StagingTag, useEnvironment } from "./EnvSwitch";
import { OrbisButton, OrbisProvider, useOrbis } from "./OrbisMenu";

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[11px] bg-[var(--rail)] text-white shadow-[0_6px_12px_-6px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.16)]" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="136 136 752 752" width={size * 0.7} height={size * 0.7} fill="none" stroke="var(--g-lime, #D5DFB3)" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round"><circle cx="512" cy="512" r="358" /><ellipse cx="512" cy="512" rx="358" ry="113" /><ellipse cx="512" cy="512" rx="358" ry="153" transform="rotate(-50 512 512)" /><circle cx="512" cy="512" r="40" fill="var(--g-lime, #D5DFB3)" stroke="none" /></svg>
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
        <span className="mono self-center !text-[8.5px] [writing-mode:vertical-rl] rotate-180 tracking-[0.18em] whitespace-nowrap">Orbis · by Framework</span>
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

function Rail() {
  const { pathname } = useLocation();
  const active = dockActive(pathname);
  const { host, indicator } = useSlidingIndicator<HTMLDivElement>(active, { className: "glass-bubble rounded-[13px]" });
  const { env } = useEnvironment();
  const [a, b, c, d] = MODULE_DESTINATIONS;
  const link = (m: (typeof MODULE_DESTINATIONS)[number]) => (
    <Link key={m.to} to={m.to} data-ikey={m.to} aria-label={m.label} title={m.label} aria-current={active === m.to ? "page" : undefined} className={cx("nav-item press relative z-10 grid size-11 place-items-center rounded-[13px]", active === m.to ? "text-[var(--dock-ink-on)]" : "text-[var(--dock-ink)] hover:text-[var(--dock-ink-on)]")}>
      <m.icon size={19} strokeWidth={1.4} aria-hidden />
    </Link>
  );
  return (
    <aside aria-label="Primary" className="sticky top-4 z-30 hidden h-[calc(100dvh-2rem)] w-[60px] shrink-0 flex-col gap-3 md:flex">
      <div ref={host} className="glass relative flex flex-col items-center gap-1.5 rounded-[22px] px-1.5 py-3">
        {indicator}
        {env === "staging" && <span className="relative z-10 -mt-1 font-mono text-[7.5px] font-medium tracking-[0.1em]" style={{ color: "var(--amber)" }}>STAGING</span>}
        {link(a)}{link(b)}
        <div className="relative z-10 my-1"><OrbisButton variant="rail" /></div>
        {link(c)}{link(d)}
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

function SecondaryPanel() {
  const { groups } = useNavModel();
  const { openSearch } = useOrbis();
  return (
    <aside aria-label="Section" className="panel sticky top-4 hidden h-[calc(100dvh-2rem)] w-[240px] shrink-0 flex-col rounded-[22px] p-3 xl:flex">
      <button onClick={openSearch} aria-label="Search Orbis" className="inset press flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 text-[13px] text-muted">Search</span>
        <kbd className="kbd text-muted">⌘K</kbd>
      </button>
      <nav className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto">
        {groups.map((g, gi) => <NavGroupView key={g.label} group={g} gi={gi} />)}
      </nav>
      <div className="mb-2.5"><EnvCard compact /></div>
      <Identity />
    </aside>
  );
}

/** The persistent floating dock: five evenly spaced positions (Personal, Finance, Orbis, Framework, Work) on a glass material with one animated selection bubble. Icon-only below 360 px. */
function Dock() {
  const { pathname } = useLocation();
  const { approvals } = useData();
  const here = dockActive(pathname);
  const { host, indicator } = useSlidingIndicator<HTMLUListElement>(here, { inset: 0, className: "glass-bubble rounded-[20px]" });
  const [a, b, c, d] = MODULE_DESTINATIONS;
  const slot = (m: (typeof MODULE_DESTINATIONS)[number]) => {
    const on = here === m.to;
    return (
      <li key={m.to} className="relative z-10">
        <Link to={m.to} data-ikey={m.to} aria-label={m.label} aria-current={on ? "page" : undefined} className={cx("nav-item press relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-[20px]", on ? "text-[var(--dock-ink-on)]" : "text-[var(--dock-ink)]")}>
          <m.icon size={19} strokeWidth={1.3} aria-hidden />
          <span className="max-w-full truncate text-[9.5px] font-normal leading-none tracking-[0.01em] max-[359px]:sr-only">{m.label}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Primary" className="safe-b fixed inset-x-2.5 bottom-2.5 z-30 md:hidden">
      <ul ref={host} className="glass relative grid grid-cols-5 items-center gap-0.5 rounded-[26px] p-1">
        {indicator}
        {slot(a)}{slot(b)}
        <li className="relative z-10 grid place-items-center">
          <OrbisButton variant="dock" />
          {approvals.length > 0 && <i aria-hidden className="absolute right-3 top-0.5 z-40 size-2 rounded-full ring-2 ring-[var(--glass-solid,#000)]" style={{ background: "var(--w-terra)" }} />}
        </li>
        {slot(c)}{slot(d)}
      </ul>
    </nav>
  );
}

function PhoneStagingRow() {
  const { env } = useEnvironment();
  if (env !== "staging") return null;
  return <div className="mb-1 flex items-center gap-2 px-1 md:hidden"><LogoMark size={22} /><span className="mono !text-[10px]">Orbis</span><StagingTag /></div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const { source, error } = useData();
  const { pathname } = useLocation();
  return (
    <OrbisProvider>
      <div className="safe-t mx-auto flex w-full max-w-[1800px] gap-3 p-3 pb-[calc(7.75rem+env(safe-area-inset-bottom))] md:gap-4 md:p-4 md:pb-4 lg:p-5">
        <Rail />
        <SecondaryPanel />
        <main className="min-w-0 flex-1 rounded-[28px] md:min-h-[calc(100dvh-2rem)] md:bg-[var(--sheet)] md:p-5 md:shadow-[var(--sh-sheet)] lg:min-h-[calc(100dvh-2.5rem)] lg:p-7">
          {source === "offline" && (
            <div role="alert" className="panel-dim mb-4 flex flex-wrap items-center justify-between gap-3 p-3.5 text-[13px]">
              <span><i className="mr-2 inline-block size-2 rounded-full bg-red align-middle" />{error}</span>
              <Btn variant="primary" onClick={() => location.reload()}>Reload</Btn>
            </div>
          )}
          <PhoneStagingRow />
          <PageFrame key={moduleOf(pathname).to}>{children}</PageFrame>
        </main>
        <Dock />
      </div>
    </OrbisProvider>
  );
}
