import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cx("rise rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}>{children}</Tag>;
}

export function Widget({ title, icon: Icon, action, children, className }: { title: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("flex flex-col p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
          {Icon && <Icon size={15} aria-hidden />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("tabular mt-0.5 text-2xl font-semibold tracking-tight", tone === "good" && "text-good", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Progress({ value, label, tone = "accent" }: { value: number; label: string; tone?: "accent" | "good" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const bar = { accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cx("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const BADGE = {
  neutral: "bg-surface-2 text-muted", accent: "bg-accent-soft text-accent", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad",
};
/** Status colours always travel with words, never colour alone. */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof BADGE }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", BADGE[tone])}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors", value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ left, right, sub }: { left: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate text-sm">{left}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {right && <div className="tabular shrink-0 text-sm">{right}</div>}
    </li>
  );
}

export function Button({ children, onClick, variant = "secondary", icon: Icon, disabled, type = "button", label }: { children?: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; icon?: LucideIcon; disabled?: boolean; type?: "button" | "submit"; label?: string }) {
  const style = { primary: "bg-ink text-bg", secondary: "bg-surface-2 text-ink", ghost: "text-muted hover:text-ink" }[variant];
  return (
    <button type={type} aria-label={label} disabled={disabled} onClick={onClick} className={cx("inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-40", style)}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  );
}

/** Every screen that shows made-up data says so. */
export function DemoBadge({ text = "Synthetic demo data" }: { text?: string }) {
  return <Badge tone="warn">{text}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
