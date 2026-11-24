import { Bot, Clock, FlaskConical, Play, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { MODULES_META, type ModuleId } from "../../shared/modules";
import { ringArc } from "../../shared/overview";
import { accent, ASSISTANT_ICONS } from "../lib/moduleStyle";
import { cx } from "../lib/cx";
import { parse, pretty } from "../lib/dates";
import type { Task } from "../lib/types";

/** A module's icon on a faint tint of its own accent. The module name is always available to screen readers. */
export function ModuleIcon({ id, size = 28, className }: { id: ModuleId; size?: number; className?: string }) {
  const Icon = ASSISTANT_ICONS[id];
  return (
    <span role="img" aria-label={`${MODULES_META[id].label} module`} title={MODULES_META[id].label} className={cx("grid shrink-0 place-items-center", className)} style={{ width: size, height: size, borderRadius: size * 0.34, color: accent(id), background: `color-mix(in srgb, ${accent(id)} 16%, transparent)` }}>
      <Icon size={Math.round(size * 0.58)} strokeWidth={1.9} aria-hidden />
    </span>
  );
}

/** Circular progress. `value` is a percentage; children render in the centre. */
export function Ring({ value, size = 96, stroke = 9, color = "var(--g-sage)", label, children }: { value: number; size?: number; stroke?: number; color?: string; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const a = ringArc(value, r);
  return (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tick-off)" strokeWidth={stroke} />
        {a.dash > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${a.dash} ${a.gap}`} style={{ transition: "stroke-dasharray 500ms ease" }} />}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

/** Compact provenance: one icon instead of repeated text. The full warning lives in the task detail view. */
export function ProvenanceMark({ className }: { className?: string }) {
  return <Bot size={12} strokeWidth={2} role="img" aria-label="Filed by an assistant, unverified source" className={cx("shrink-0 text-faint", className)} />;
}
export function SyntheticMark() {
  return <FlaskConical size={12} strokeWidth={2} role="img" aria-label="Synthetic demonstration record" className="shrink-0 text-faint" />;
}

/** Short due indicator: "Today", "Tue", "Nov 28", "2d late". Overdue is red and carries words. */
export function dueLabel(date: string | null, today: string): { text: string; tone: "bad" | "today" | "soon" | "none" } {
  if (!date) return { text: "No date", tone: "none" };
  const diff = Math.round((parse(date).getTime() - parse(today).getTime()) / 86_400_000);
  if (diff < 0) return { text: `${-diff}d late`, tone: "bad" };
  if (diff === 0) return { text: "Today", tone: "today" };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  if (diff < 7) return { text: pretty(date, { weekday: "short" }), tone: "soon" };
  return { text: pretty(date, { day: "numeric", month: "short" }), tone: "none" };
}
export function DueChip({ t, today }: { t: Pick<Task, "dueDate" | "dueTime" | "status">; today: string }) {
  const d = dueLabel(t.dueDate, today);
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium", d.tone === "bad" ? "bg-red/15 text-red" : d.tone === "today" ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "bg-[var(--card-dim)] text-muted")}>
      {t.status === "in_progress" && <Play size={9} fill="currentColor" aria-label="In progress" />}
      {t.status === "waiting" && <Clock size={10} aria-label="Waiting" />}
      {d.text}{t.dueTime && t.dueDate ? ` ${t.dueTime}` : ""}
    </span>
  );
}
export const PRIORITY_BAR: Record<string, string> = { critical: "var(--red)", high: "var(--amber)" };
export { Repeat };
