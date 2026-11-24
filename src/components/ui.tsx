import { ArrowRight, Bell, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/data";
import { ContextChips } from "./nav";

import { cx } from "../lib/cx";
export { cx };

/** A raised card: the basic layered surface. */
export function Panel({ children, className, id, tabIndex, onKeyDown, label }: { children: ReactNode; className?: string; id?: string; tabIndex?: number; onKeyDown?: (e: React.KeyboardEvent) => void; label?: string }) {
  return <section id={id} tabIndex={tabIndex} onKeyDown={onKeyDown} aria-label={label} className={cx("panel rise", className)}>{children}</section>;
}

export function CountBadge({ n }: { n: number }) {
  return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1.5 text-[11px] font-semibold text-lime-ink num">{n}</span>;
}

export function Widget({ title, count, tag, action, children, className, id }: { title: string; count?: number; tag?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <Panel id={id} className={cx("flex min-w-0 flex-col p-4 md:p-5", className)}>
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
    <Link to={to} className="btn btn-dash !min-h-8 !px-3 !text-[12px]">
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

/** Bell and the primary "New task" pill. Compact (phone) shows round icon buttons. */
export function HeaderActions({ compact }: { compact?: boolean }) {
  const { approvals, tasks, today } = useData();
  const attention = approvals.length + tasks.filter((t) => t.status !== "completed" && !t.archivedAt && t.dueDate && t.dueDate < today).length;
  return (
    <div className="flex items-center gap-2">
      <Link to="/settings#approvals" aria-label={attention ? `${attention} items need your attention` : "Notifications"} className="btn btn-soft relative !min-h-10 !w-10 !px-0">
        <Bell size={16} aria-hidden />
        {attention > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-red ring-2 ring-[var(--card-a)]" />}
      </Link>
      {compact ? (
        <Link to="/tasks?add=1" aria-label="New task" className="btn btn-primary !min-h-10 !w-10 !px-0"><Plus size={18} aria-hidden /></Link>
      ) : (
        <Link to="/tasks?add=1" className="btn btn-primary"><Plus size={15} aria-hidden />New task</Link>
      )}
    </div>
  );
}
export function PageHeader({ crumb, title, subtitle, controls, tag }: { crumb: string; title: string; subtitle?: string; controls?: ReactNode; tag?: ReactNode }) {
  return (
    <header className="mb-4 md:mb-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono">AXIS / {crumb}</p>
            <h1 className="display mt-1.5 text-[34px] md:text-[44px]">{title}</h1>
            {subtitle && <p className="mono mt-2 !normal-case !tracking-[0.02em]">{subtitle}</p>}
          </div>
          <div className="lg:hidden"><HeaderActions compact /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <div className="hidden lg:block"><HeaderActions /></div>
        </div>
      </div>
      {tag && <div className="mt-3">{tag}</div>}
      <ContextChips />
    </header>
  );
}

/** Inset track with a raised active segment. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inset no-scrollbar flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cx("h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium transition-all", value === o.value ? "raised text-ink" : "text-muted hover:text-ink")}>
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
