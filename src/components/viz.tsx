import { useId, type ReactNode } from "react";
import { type ActivityBar, completionArcs, dotRing, fanSegments, pieSector, polar, radialTicks, splitParts } from "../../shared/gauges";
import { cx } from "../lib/cx";
import { useTween, useTweenList } from "../lib/motion";

/** Instrument-style data graphics. Every figure is a prop; nothing here invents data. Colours are CSS variables so both themes work. */

function Hatch({ id, color, gap = 4.5, width = 0.8, angle = 45 }: { id: string; color: string; gap?: number; width?: number; angle?: number }) {
  return (
    <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1="0" y1="0" x2="0" y2={gap} stroke={color} strokeWidth={width} />
    </pattern>
  );
}

/**
 * Precision completion gauge: a hatched disc with a solid wedge for the completed share (from 12 o'clock, clockwise), a hand at 12,
 * a dotted circumference and twelve outer tick marks. 0 is a fully hatched disc, 100 a solid one.
 */
export function RadialGauge({ pct, size = 124, fill = "var(--g-sage)", ink = "var(--ink)", hatch = "var(--muted)", label, className }: { pct: number; size?: number; fill?: string; ink?: string; hatch?: string; label: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const C = 80, shown = useTween(pct, 320), arcs = completionArcs(shown);
  return (
    <svg role="img" aria-label={label} viewBox="0 0 160 160" width={size} height={size} className={cx("block shrink-0", className)}>
      <defs><Hatch id={id} color={hatch} gap={4.2} width={0.7} /></defs>
      {Array.from({ length: 12 }, (_, i) => { const [x1, y1] = polar(C, C, 66, i * 30), [x2, y2] = polar(C, C, 74, i * 30); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth="0.9" opacity="0.6" />; })}
      {dotRing(90, C, C, 59).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.7" fill={ink} opacity="0.55" />)}
      <circle cx={C} cy={C} r="50" fill={`url(#${id})`} />
      {arcs.filled && <path d={pieSector(C, C, 50, arcs.filled[0], arcs.filled[1])} fill={fill} />}
      <circle cx={C} cy={C} r="50" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.5" />
      <line x1={C} y1={C} x2={C} y2="14" stroke={ink} strokeWidth="0.9" strokeDasharray="2 2.6" opacity="0.9" />
      <circle cx={C} cy={C} r="2.6" fill={ink} />
    </svg>
  );
}

/**
 * Semicircular workload gauge: one hatched segment per entry, left to right. A segment's radial depth is its value relative to the
 * largest value shown (full depth = the busiest segment; zero is a thin stub). The pale outer arc marks that full-depth scale.
 * Children are placed inside the hollow, at the baseline.
 */
export function FanGauge({ values, size = 168, ink = "var(--w-blue-ink)", pale = "var(--w-on-blue-2)", label, children, className }: { values: readonly number[]; size?: number; ink?: string; pale?: string; label: string; children?: ReactNode; className?: string }) {
  const id = useId().replace(/:/g, "");
  const CX = 92, CY = 96, R0 = 46, RMAX = 84;
  const tweened = useTweenList(values, 320);
  const segs = fanSegments(tweened, CX, CY, R0, RMAX, 2.2);
  const h = (size * 104) / 184;
  return (
    <div className={cx("relative", className)} style={{ width: size, height: h }}>
      <svg role="img" aria-label={label} viewBox="0 0 184 104" width={size} height={h} className="block">
        <defs><Hatch id={id} color={ink} gap={3.6} width={0.9} angle={-45} /></defs>
        <path d={`M${CX - RMAX} ${CY} A${RMAX} ${RMAX} 0 0 1 ${CX + RMAX} ${CY}`} fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.9" />
        <path d={`M${CX - R0} ${CY} A${R0} ${R0} 0 0 1 ${CX + R0} ${CY}`} fill="none" stroke={ink} strokeWidth="0.8" opacity="0.6" />
        {segs.map((s) => s.value > 0 && <path key={`f${s.index}`} d={s.path} fill={`url(#${id})`} />)}
        {segs.map((s) => { const [x0, y0] = polar(CX, CY, s.r1, s.a0), [x1, y1] = polar(CX, CY, s.r1, s.a1); return <path key={`e${s.index}`} d={`M${x0} ${y0} A${s.r1} ${s.r1} 0 0 1 ${x1} ${y1}`} fill="none" stroke={ink} strokeWidth={s.value > 0 ? 1.8 : 1} strokeLinecap="round" opacity={s.value > 0 ? 1 : 0.5} />; })}
        <circle cx={CX - RMAX} cy={CY} r="3.6" fill="#fff" stroke={ink} strokeWidth="1" /><circle cx={CX + RMAX} cy={CY} r="3.6" fill="#fff" stroke={ink} strokeWidth="1" />
        <title>{pale}</title>
      </svg>
      {children && <div className="absolute inset-x-0 flex justify-center" style={{ bottom: h * 0.02 }}>{children}</div>}
    </div>
  );
}

/**
 * Dot-matrix bar chart: every bar is a block of fine dots whose height is the day's value relative to the tallest bar, topped by a fine
 * horizontal cap. Future days are ghosted; days with no completions show a baseline cap only. Labels are weekday names.
 */
export function DotMatrixBars({ bars, maxRows = 20, tall = false, ink = "var(--w-butter-on)", label, className }: { bars: readonly ActivityBar[]; maxRows?: number; tall?: boolean; ink?: string; label: string; className?: string }) {
  const rowsMax = tall ? 40 : maxRows;
  const W = 330, H = tall ? 232 : 132, base = H - 28, colW = W / bars.length, cols = 9, pitch = 3.5, r = 0.95;
  const counts = useTweenList(bars.map((b) => b.count), 320);
  const max = Math.max(0, ...counts);
  const rowsFor = (n: number) => (n <= 0 || max === 0 ? 0 : Math.max(2, Math.round((n / max) * rowsMax)));
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className={cx("block w-full", className)}>
      {bars.map((b, i) => {
        const cx0 = colW * i + colW / 2, rows = rowsFor(counts[i] ?? b.count), left = cx0 - ((cols - 1) * pitch) / 2, capY = base - rows * pitch - 2;
        return (
          <g key={b.date} opacity={b.future ? 0.38 : 1}>
            {Array.from({ length: rows }, (_, rr) => Array.from({ length: cols }, (_, c) => <circle key={`${rr}-${c}`} cx={left + c * pitch} cy={base - rr * pitch} r={r} fill={ink} opacity={b.isToday ? 1 : 0.82} />))}
            <line x1={left - 1.5} x2={left + (cols - 1) * pitch + 1.5} y1={b.count === 0 ? base + 3 : capY} y2={b.count === 0 ? base + 3 : capY} stroke={ink} strokeWidth={b.isToday ? 1.6 : 1.2} strokeLinecap="round" opacity={b.count === 0 ? 0.45 : 1} />
            <text x={cx0} y={H - 5} textAnchor="middle" fontSize="10.5" fill={ink} opacity={b.isToday ? 1 : 0.7} fontWeight={b.isToday ? 600 : 400}>{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** A single thin bar split into parts, each part's width its share of the total (zero total = an empty track). */
export function SplitBar({ parts, height = 9, track = "var(--tick-off)", label, className }: { parts: ReadonlyArray<{ value: number; color: string }>; height?: number; track?: string; label: string; className?: string }) {
  const widths = splitParts(parts.map((p) => p.value));
  const used = widths.reduce((a, b) => a + b, 0);
  return (
    <div role="img" aria-label={label} className={cx("flex w-full overflow-hidden rounded-full", className)} style={{ height, background: track }}>
      {parts.map((p, i) => widths[i] > 0 && <i key={i} className="block h-full" style={{ width: `${widths[i]}%`, transition: "width 300ms cubic-bezier(0.2, 0.7, 0.2, 1)", background: p.color, marginRight: i < parts.length - 1 && used > widths[i] ? 2 : 0, borderRadius: 999 }} />)}
    </div>
  );
}

/** Compact segmented progress made of thin capsules (kept for module dashboards). */
export function SegmentedProgress({ value, total, segments = 14, color = "var(--ink)", track = "var(--tick-off)", height = 16, label, className }: { value: number; total: number; segments?: number; color?: string; track?: string; height?: number; label: string; className?: string }) {
  const on = total <= 0 || value <= 0 ? 0 : Math.min(segments, Math.max(1, Math.round((value / total) * segments)));
  return (
    <div role="img" aria-label={label} className={cx("flex items-center gap-[3px]", className)} style={{ height }}>
      {Array.from({ length: segments }, (_, i) => <i key={i} className="block h-full flex-1 rounded-full" style={{ background: i < on ? color : track, maxWidth: 6, minWidth: 2 }} />)}
    </div>
  );
}

/** A small dial: an outer ring of fine ticks (lit for `pct`), an inner ring and a centre dot. `pct` null = no data, an unlit dial. */
export function TickRing({ pct, size = 54, ink = "var(--ink)", accent = "var(--g-sage)", label }: { pct: number | null; size?: number; ink?: string; accent?: string; label: string }) {
  const shown = useTween(pct ?? 0, 320);
  const ticks = radialTicks(48, shown, 30, 30, 24, 29);
  return (
    <svg role="img" aria-label={label} viewBox="0 0 60 60" width={size} height={size} className="block shrink-0">
      {ticks.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.on ? accent : ink} strokeWidth={t.on ? 1.2 : 0.8} strokeLinecap="round" opacity={t.on ? 1 : 0.4} />)}
      <circle cx="30" cy="30" r="17" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.55" />
      <circle cx="30" cy="30" r="5" fill={pct === null ? "none" : accent} stroke={pct === null ? ink : "none"} strokeWidth="0.8" opacity={pct === null ? 0.5 : 1} />
    </svg>
  );
}

/** Minimal numeric KPI: a light numeral and a small caption. */
export function Kpi({ value, caption, size = 28, className }: { value: ReactNode; caption?: ReactNode; size?: number; className?: string }) {
  return (
    <div className={className}>
      <p className="num font-light leading-none tracking-tight" style={{ fontSize: size }}>{value}</p>
      {caption && <p className="mt-1.5 text-[14px] opacity-70">{caption}</p>}
    </div>
  );
}

/**
 * The work rotation as a dial: one tick per day of the whole cycle (on days long, off days short), elapsed days lit, today marked.
 * `dayIndex` is today's 0-based position in the cycle. Children sit in the hollow.
 */
export function RotationDial({ cycle, onDays, dayIndex, size = 132, accent = "var(--g-sage)", ink = "var(--ink)", label, children, className }: { cycle: number; onDays: number; dayIndex: number; size?: number; accent?: string; ink?: string; label: string; children?: ReactNode; className?: string }) {
  const lit = useTween(dayIndex + 1, 320);
  return (
    <div className={cx("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg role="img" aria-label={label} viewBox="0 0 160 160" width={size} height={size} className="block">
        {Array.from({ length: cycle }, (_, i) => {
          const on = i < onDays, elapsed = i + 1 <= lit, today = i === dayIndex;
          const r1 = on ? 56 : 62, r2 = 72, [x1, y1] = polar(80, 80, r1, (i / cycle) * 360), [x2, y2] = polar(80, 80, r2, (i / cycle) * 360);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={elapsed ? accent : ink} strokeWidth={today ? 3.2 : on ? 2 : 1.3} strokeLinecap="round" opacity={elapsed ? 1 : on ? 0.55 : 0.28} />;
        })}
        <circle cx="80" cy="80" r="46" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.4" />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

/** One capsule per part of a deliverable (each reporting period, then the final steps), coloured by state: done, overdue, due today, upcoming. */
export function PartsBar({ parts, height = 14, label, className }: { parts: ReadonlyArray<{ state: "done" | "overdue" | "due" | "upcoming"; kind?: "period" | "step" }>; height?: number; label: string; className?: string }) {
  const color = { done: "var(--g-sage)", overdue: "var(--w-terra)", due: "var(--w-butter)", upcoming: "var(--tick-off)" } as const;
  return (
    <div role="img" aria-label={label} className={cx("flex items-stretch gap-[3px]", className)} style={{ height }}>
      {parts.map((p, i) => <i key={i} className={cx("block flex-1 rounded-full", p.kind === "step" && "max-w-[34px]")} style={{ background: color[p.state], transition: "background-color 400ms ease", borderRadius: p.kind === "step" ? 4 : 999 }} />)}
    </div>
  );
}

/** Vertical capsule bars, one per bin, growing to their values (relative to the tallest). Instrument-style income and spending histograms. */
export function CapsuleBars({ values, ink = "var(--ink)", height = 84, label, className }: { values: readonly number[]; ink?: string; height?: number; label: string; className?: string }) {
  const shown = useTweenList(values, 320);
  const max = Math.max(1, ...shown);
  return (
    <div role="img" aria-label={label} className={cx("flex items-end gap-[3px]", className)} style={{ height }}>
      {shown.map((x, i) => <i key={i} className="block flex-1 rounded-full" style={{ height: `${Math.max(x <= 0 ? 6 : 12, (x / max) * 100)}%`, background: ink, opacity: x <= 0 ? 0.28 : 0.55 + 0.45 * (x / max) }} />)}
    </div>
  );
}

/** A grid of small squares, the first `pct` percent lit: a compact progress read-out (debt repaid, savings). */
export function DotGrid({ pct, total = 20, cols = 10, on = "var(--g-sage)", off = "var(--tick-off)", size = 14, label, className }: { pct: number; total?: number; cols?: number; on?: string; off?: string; size?: number; label: string; className?: string }) {
  const lit = Math.round((Math.max(0, Math.min(100, useTween(pct, 320))) / 100) * total);
  return (
    <div role="img" aria-label={label} className={cx("grid gap-[5px]", className)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => <i key={i} className="block rounded-[4px]" style={{ aspectRatio: "1", maxHeight: size, background: i < lit ? on : off }} />)}
    </div>
  );
}
