import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "../lib/cx";

/** One widget surface. `tone` picks the instrument colour; pastel cards keep dark text in both themes. */
export const TONE = {
  charcoal: { bg: "var(--w-charcoal)", fg: "var(--ink)", ring: "0 0 0 1px var(--line)" },
  blue: { bg: "var(--w-blue)", fg: "var(--w-on-blue)", ring: "none" },
  butter: { bg: "var(--w-butter)", fg: "var(--w-butter-on)", ring: "none" },
} as const;
export function Card({ tone, to, headTo, label, className, children, aria }: { tone: keyof typeof TONE; to?: string; headTo?: string; label?: string; className?: string; children: ReactNode; aria?: string }) {
  const t = TONE[tone];
  const cls = cx("relative flex min-w-0 flex-col rounded-[20px] p-3.5", className);
  const style = { background: t.bg, color: t.fg, boxShadow: t.ring };
  const head = label ? <p className="self-start text-[15px] font-normal leading-tight tracking-tight opacity-80">{label}</p> : null;
  if (to) return (
    <Link to={to} data-cascade aria-label={aria} className={cx(cls, "hit press")} style={style}>
      {head}
      <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden className="absolute right-3.5 top-3.5 opacity-60" />
      {children}
    </Link>
  );
  return (
    <section data-cascade aria-label={aria ?? label} className={cls} style={style}>
      {head}
      {headTo && <Link to={headTo} aria-label={`Open ${label}`} className="hit press absolute right-1 top-1 grid place-items-center opacity-60 hover:opacity-100"><ArrowUpRight size={15} strokeWidth={1.5} aria-hidden /></Link>}
      {children}
    </section>
  );
}
