import { ArrowRight, Bell, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/data";
import { useSlidingIndicator } from "../lib/motion";
import { AccountMenuButton } from "./AccountMenu";
import { ContextChips } from "./nav";

import { cx } from "../lib/cx";
export { cx };

/** A raised card: the basic layered surface. */
export function Panel({ children, className, id, tabIndex, onKeyDown, label }: { children: ReactNode; className?: string; id?: string; tabIndex?: number; onKeyDown?: (e: React.KeyboardEvent) => void; label?: string }) {
  return <section id={id} tabIndex={tabIndex} onKeyDown={onKeyDown} aria-label={label} className={cx("panel rise", className)}>{children}</section>;
}

export function CountBadge({ n }: { n: number }) {
  return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--card-dim)] px-1.5 text-[11px] font-medium num">{n}</span>;
}

/** `bare` drops the card chrome on phones, so a list inside it is the only surface. */
export function Widget({ title, count, tag, action, children, className, id, bare }: { title: string; count?: number; tag?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string; bare?: boolean }) {
  return (
    <Panel id={id} className={cx("flex min-w-0 flex-col p-4 md:p-5", bare && "max-md:![background:none] max-md:!px-0 max-md:!py-0 max-md:!shadow-none", className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[15px] font-medium tracking-tight">{title}</h2>
          {count !== undefined && count > 0 && <CountBadge n={count} />}
          {tag && <span className="mono">{tag}</span>}
        </div>
        {action}
      </header>
      {children}
    </Panel>
  );
}

/** Dashed outline link-button, e.g. "Open calendar →". */
export function LinkBtn({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="btn btn-dash !min-h-11 !px-3 !text-[12px] md:!min-h-8">
      {children}
      <ArrowRight size={13} aria-hidden />
    </Link>
  );
}

export function Btn({ children, onClick, variant = "soft", icon: Icon, kbd, disabled, type = "button", label, className }: { children?: ReactNode; onClick?: () => void; variant?: "primary" | "soft" | "dash" | "ghost"; icon?: LucideIcon; kbd?: string; disabled?: boolean; type?: "button" | "submit"; label?: string; className?: string }) {
  return (
    <button type={type} aria-label={label} disabled={disabled} onClick={onClick} className={cx("btn", `btn-${variant}`, className)}>
      {Icon && <Icon size={15} aria-hidden />}
      {children}
      {kbd && <kbd className="kbd max-md:hidden">{kbd}</kbd>}
    </button>
  );
}

/**
 * The page header's actions, one instance that adapts to the header's own width: [account menu on phones] [bell] [New task].
 * "New task" is an icon on narrow headers and gains its label when there is room. One creation control per page.
 */
export function HeaderActions({ onNew }: { onNew?: () => void }) {
  const { approvals, tasks, today } = useData();
  const attention = approvals.length + tasks.filter((t) => t.status !== "completed" && !t.archivedAt && t.dueDate && t.dueDate < today).length;
  const cls = "btn btn-primary press !min-h-11 !w-11 !px-0 md:!min-h-10 @[560px]:!w-auto @[560px]:!px-[18px]";
  const inner = <><Plus size={17} strokeWidth={1.6} aria-hidden /><span className="sr-only @[560px]:not-sr-only">New task</span></>;
  return (
    <div className="flex items-center gap-2">
      <AccountMenuButton className="md:hidden" />
      <Link to="/settings#approvals" aria-label={attention ? `${attention} items need your attention` : "Notifications"} className="btn btn-soft press relative !min-h-11 !w-11 !px-0 md:!min-h-10 md:!w-10">
        <Bell size={16} strokeWidth={1.5} aria-hidden />
        {attention > 0 && <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full" style={{ background: "var(--w-terra)" }} />}
      </Link>
      {onNew ? <button onClick={onNew} aria-label="New task" className={cls}>{inner}</button> : <Link to="/tasks?add=1" aria-label="New task" className={cls}>{inner}</Link>}
    </div>
  );
}

export function PageHeader({ crumb, title, subtitle, controls, tag, onNew }: { crumb: string; title: string; subtitle?: string; controls?: ReactNode; tag?: ReactNode; onNew?: () => void }) {
  return (
    <header className="@container mb-4 md:mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono">ORBIS / {crumb}</p>
          <h1 className="mt-1 text-[30px] font-[350] leading-none tracking-[-0.025em] md:text-[40px]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-[60ch] text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
        <div className="shrink-0"><HeaderActions onNew={onNew} /></div>
      </div>
      {controls && <div className="mt-3 flex flex-wrap items-center gap-2">{controls}</div>}
      {tag && <div className="mt-3">{tag}</div>}
      <ContextChips />
    </header>
  );
}

/** Inset track with one animated selection that glides between segments. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>; label: string }) {
  const { host, indicator } = useSlidingIndicator<HTMLDivElement>(value, { inset: 0, className: "raised rounded-full" });
  return (
    <div ref={host} role="tablist" aria-label={label} className="inset no-scrollbar relative flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1">
      {indicator}
      {options.map((o) => (
        <button key={o.value} role="tab" data-ikey={o.value} aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cx("nav-item press relative z-10 h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium", value === o.value ? "text-ink" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconToggle<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; icon: LucideIcon; label: string }>; label: string }) {
  return (
    <div role="group" aria-label={label} className="inset flex gap-0.5 rounded-[12px] p-1">
      {options.map((o) => (
        <button key={o.value} aria-label={o.label} aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cx("grid size-8 place-items-center rounded-[9px] transition-all", value === o.value ? "raised text-ink" : "text-muted hover:text-ink")}>
          <o.icon size={15} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string; count?: number }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex gap-5 overflow-x-auto">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cx("-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[13px] font-medium whitespace-nowrap", value === o.value ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
          {o.label}
          {o.count !== undefined && <span className="mono !text-[10.5px]">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "lime" | "neutral" | "idle";
const DOT: Record<Tone, string> = {
  ok: "border-2 border-[var(--lime-deep)] bg-transparent", warn: "bg-amber", bad: "bg-red", lime: "", neutral: "", idle: "border-2 border-faint bg-transparent",
};
/** Technical status. Colour always travels with words. */
export function Status({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("pill", tone === "lime" && "pill-lime")}>
      {tone !== "lime" && tone !== "neutral" && <i className={cx("block size-2 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

/** Records an assistant filed through the inbox: the assistant's identity is self-declared, so the owner is told. */
export const isUnverified = (s: { kind: string }) => s.kind === "assistant";

/** Every screen that shows made-up data says so. */
export function DemoTag({ text = "Synthetic data" }: { text?: string }) {
  return <span className="tag" title="Illustrative data. Nothing here is real.">{text}</span>;
}

export function Meter({ value, label, tone = "ink" }: { value: number; label: string; tone?: "ink" | "red" | "lime" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const bg = tone === "red" ? "bg-red" : tone === "lime" ? "bg-lime" : "bg-ink";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="inset h-2.5 w-full overflow-hidden rounded-full">
      <div className={cx("h-full rounded-full transition-[width] duration-500", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Row({ left, right, sub, leading }: { left: ReactNode; right?: ReactNode; sub?: ReactNode; leading?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px]">{left}</div>
        {sub && <div className="mono mt-0.5 truncate">{sub}</div>}
      </div>
      {right && <div className="num shrink-0 text-[13px]">{right}</div>}
    </li>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="mono py-8 text-center !normal-case">{children}</p>;
}

export function StatLine({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-1.5 first:border-t-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className={cx("num text-[13px] font-medium", tone === "bad" && "text-red")}>{value}</span>
    </div>
  );
}
