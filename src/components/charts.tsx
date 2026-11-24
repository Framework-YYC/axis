import { useId, useState } from "react";
import { clockLabel, dotStacks, scaleY, smoothPath, type Tick } from "../../shared/viz";
import { cx } from "../lib/cx";

const TICK_BG: Record<Tick, string> = {
  on: "var(--ink)", off: "var(--tick-off)", soft: "color-mix(in srgb, var(--ink) 38%, transparent)", now: "var(--lime)", warn: "var(--amber)", bad: "var(--red)",
};

/** Segmented tick indicator: progress, rotation, habits. */
export function SegBar({ ticks, label, height = 18, className }: { ticks: readonly Tick[]; label: string; height?: number; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cx("flex items-center gap-[3px]", className)} style={{ height: height + 6 }}>
      {ticks.map((t, i) => (
        <i key={i} className="block max-w-[7px] min-w-[2px] flex-1 rounded-full" style={{ height: t === "now" ? height + 6 : height, background: TICK_BG[t], boxShadow: t === "now" ? "0 0 0 1.5px var(--ink)" : undefined }} />
      ))}
    </div>
  );
}

/** Fine-line sparkline with a lime end marker. */
export function Spark({ values, label, className }: { values: readonly number[]; label: string; className?: string }) {
  const W = 160, H = 56;
  const ys = scaleY(values, 6, H - 6);
  const pts = values.map((_, i) => [6 + (i * (W - 12)) / Math.max(1, values.length - 1), ys[i]] as const);
  const last = pts[pts.length - 1];
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className={cx("block w-full", className)}>
      <path d={smoothPath(pts)} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--lime)" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}

export type ChartMode = "dots" | "lines" | "bars";
export interface DotMatrixProps {
  values: number[];
  series?: Array<{ name: string; values: number[] }>;
  mode: ChartMode;
  /** Fractional column position of "now" (e.g. 14.5 for 14:30 on an hourly chart). */
  now?: number;
  nowLabel?: string;
  labels: string[];
  labelEvery?: number;
  unit: string;
  annotation?: { index: number; text: string };
  maxDots?: number;
  ariaLabel: string;
}

const W = 720;

/** Dot-matrix chart with a NOW marker; the same data can be viewed as fine lines or bars. */
export function DotMatrix({ values, series = [], mode, now, nowLabel, labels, labelEvery = 3, unit, annotation, maxDots = 10, ariaLabel }: DotMatrixProps) {
  const uid = useId().replace(/:/g, "");
  const n = values.length;
  const padL = mode === "lines" ? 104 : 10;
  const plotW = W - padL - 10;
  const colX = (i: number) => padL + ((i + 0.5) * plotW) / n;
  const nowX = now === undefined ? undefined : padL + (now / n) * plotW;
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? (now === undefined ? null : Math.min(n - 1, Math.floor(now)));

  const H = mode === "lines" ? 40 * Math.max(1, series.length) + 70 : 244;
  const base = H - 30;
  const isPast = (i: number) => now === undefined || i + 1 <= now || (i <= now && now < i + 1);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(((x - padL) / plotW) * n))));
  };

  const stacks = dotStacks(values, maxDots);
  const peak = Math.max(1, ...values);

  return (
    <div>
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ink)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--ink)" stopOpacity="0.35" />
          </linearGradient>
          {nowX !== undefined && (
            <>
              <clipPath id={`${uid}p`}><rect x="0" y="0" width={nowX} height={H} /></clipPath>
              <clipPath id={`${uid}f`}><rect x={nowX} y="0" width={W - nowX} height={H} /></clipPath>
            </>
          )}
        </defs>

        {shown !== null && hover !== null && <rect x={padL + (hover * plotW) / n} y="30" width={plotW / n} height={base - 24} rx="7" fill="var(--inset)" opacity="0.9" />}

        {mode === "dots" && values.map((_, i) => {
          const past = isPast(i);
          const x = colX(i);
          return (
            <g key={i}>
              <circle cx={x} cy={base} r="1.8" fill={past ? "var(--ink)" : "var(--faint)"} />
              {Array.from({ length: stacks[i] }, (_, k) => (
                <circle key={k} cx={x} cy={base - 9 - k * 11.5} r={past ? 4 : 3.4} fill={past ? "var(--ink)" : "none"} stroke={past ? "none" : "var(--faint)"} strokeWidth="1.2" opacity={past ? 1 : 0.8} />
              ))}
            </g>
          );
        })}

        {mode === "bars" && values.map((v, i) => {
          const past = isPast(i);
          const h = v <= 0 ? 3 : Math.max(8, (v / peak) * (base - 52));
          const w = (plotW / n) * 0.56;
          return <rect key={i} x={colX(i) - w / 2} y={base - h} width={w} height={h} rx="4" fill={past ? (v === peak ? "var(--ink)" : `url(#${uid}g)`) : "none"} stroke={past ? "none" : "var(--faint)"} strokeDasharray={past ? undefined : "2 3"} strokeWidth="1.2" opacity={past ? 1 : 0.85} />;
        })}

        {mode === "lines" && series.map((s, k) => {
          const y0 = 52 + k * 40 + 24;
          const m = Math.max(1, ...s.values);
          const pts = s.values.map((v, i) => [colX(i), y0 - (v / m) * 30] as const);
          const d = smoothPath(pts);
          const total = s.values.reduce((a, b) => a + b, 0);
          return (
            <g key={s.name}>
              <line x1={padL} x2={W - 10} y1={y0} y2={y0} stroke="var(--line)" />
              <text x="0" y={y0 - 12} fontSize="12" fontWeight="500" fill="var(--ink)" fontFamily="var(--font-sans)">{s.name}</text>
              <text x="0" y={y0 + 1} fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)" letterSpacing="0.6">{total} {unit.toUpperCase()}</text>
              {nowX === undefined ? <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.6" /> : (
                <>
                  <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.6" clipPath={`url(#${uid}p)`} />
                  <path d={d} fill="none" stroke="var(--faint)" strokeWidth="1.2" strokeDasharray="2 3" clipPath={`url(#${uid}f)`} />
                </>
              )}
            </g>
          );
        })}

        {annotation && mode !== "lines" && (() => {
          const i = annotation.index;
          const top = mode === "dots" ? base - 9 - Math.max(0, stacks[i] - 1) * 11.5 : base - (values[i] <= 0 ? 3 : Math.max(8, (values[i] / peak) * (base - 52)));
          const x = Math.min(W - 112, Math.max(padL, colX(i) - 8));
          return (
            <g>
              <line x1={colX(i)} x2={colX(i)} y1={top - 8} y2={top - 22} stroke="var(--ink)" strokeWidth="1" />
              <circle cx={colX(i)} cy={top - 24} r="2.6" fill="var(--red)" />
              <text x={x + 8} y={top - 21} fontSize="9.5" fill="var(--ink)" fontFamily="var(--font-mono)" letterSpacing="0.6">{annotation.text}</text>
            </g>
          );
        })()}

        {labels.map((l, i) => (i % labelEvery === 0 ? <text key={i} x={colX(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-mono)">{l}</text> : null))}

        {nowX !== undefined && (
          <g>
            <line x1={nowX} x2={nowX} y1="26" y2={base + 4} stroke="var(--ink)" strokeWidth="1.3" />
            <circle cx={nowX} cy={base + 4} r="4.5" fill="var(--lime)" stroke="var(--ink)" strokeWidth="1.5" />
            <rect x={Math.min(W - 92, Math.max(padL - 6, nowX - 42))} y="2" width="84" height="23" rx="11.5" fill="var(--ink)" />
            <circle cx={Math.min(W - 92, Math.max(padL - 6, nowX - 42)) + 13} cy="13.5" r="3.5" fill="var(--lime)" />
            <text x={Math.min(W - 92, Math.max(padL - 6, nowX - 42)) + 22} y="17" fontSize="10" fill="var(--card-a)" fontFamily="var(--font-mono)" fontWeight="600" letterSpacing="0.6">{nowLabel ?? "NOW"}</text>
          </g>
        )}
      </svg>
      {shown !== null && (
        <p className="mono mt-1 num" aria-live="polite">
          {labels[shown]} · {values[shown]} {unit}
          {series.length > 0 && ` · ${series.map((s) => `${s.name} ${s.values[shown]}`).join(" · ")}`}
        </p>
      )}
    </div>
  );
}

export { clockLabel };
