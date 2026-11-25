import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { type Box, MOTION, relativeBox, sameBox, stretchFrames, tweenAt } from "../../shared/motion";

export const prefersReducedMotion = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One shared selection indicator for a group of items (the dock, the rail, tab bars, segmented controls).
 * Mark each item with `data-ikey="<key>"`; the indicator glides to the active one, stretching along its path and settling with a light spring.
 * It re-measures on resize, orientation change, font load and item size changes, and an interrupted move continues from where the bubble currently is.
 * Reduced motion: it simply jumps.
 */
export function useSlidingIndicator<T extends HTMLElement>(activeKey: string | null, opts: { inset?: number; className?: string } = {}) {
  const inset = opts.inset ?? 0;
  const host = useRef<T>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const last = useRef<Box | null>(null);
  const anim = useRef<Animation | null>(null);
  const prevKey = useRef<string | null>(null);

  // The key and inset live in refs so the callbacks below are stable: the resize observer is created once, not on every navigation
  // (a fresh observer fires immediately, which would snap an in-flight glide to its destination).
  const keyRef = useRef(activeKey); keyRef.current = activeKey;
  const insetRef = useRef(inset); insetRef.current = inset;

  const measure = useCallback((): Box | null => {
    const h = host.current, key = keyRef.current;
    if (!h || h.offsetWidth === 0 || !key) return null;
    const item = h.querySelector<HTMLElement>(`[data-ikey="${CSS.escape(key)}"]`);
    if (!item) return null;
    const hr = h.getBoundingClientRect(), ir = item.getBoundingClientRect();
    return relativeBox(ir, hr, { x: h.scrollLeft, y: h.scrollTop }, insetRef.current);
  }, []);

  const apply = (b: HTMLElement, box: Box) => { b.style.width = `${box.w}px`; b.style.height = `${box.h}px`; b.style.transform = `translate(${box.x}px, ${box.y}px)`; b.style.opacity = "1"; };

  const place = useCallback((animate: boolean) => {
    const b = bubble.current, h = host.current;
    if (!b || !h) return;
    const to = measure();
    if (!to) { b.style.opacity = "0"; last.current = null; return; }
    let from = last.current;
    if (anim.current) { // interrupted: continue from where the bubble visibly is
      const cur = b.getBoundingClientRect(), hr = h.getBoundingClientRect();
      from = relativeBox(cur, hr, { x: h.scrollLeft, y: h.scrollTop });
      anim.current.cancel(); anim.current = null;
    }
    apply(b, to);
    if (animate && from && !sameBox(from, to) && !prefersReducedMotion() && typeof b.animate === "function") {
      const frames = stretchFrames(from, to).map((f) => ({ transform: `translate(${f.box.x}px, ${f.box.y}px)`, width: `${f.box.w}px`, height: `${f.box.h}px`, offset: f.offset, easing: f.easing }));
      const a = b.animate(frames, { duration: MOTION.indicator });
      anim.current = a;
      a.onfinish = a.oncancel = () => { if (anim.current === a) anim.current = null; };
    }
    last.current = to;
  }, [measure]);

  useLayoutEffect(() => {
    const changed = prevKey.current !== activeKey;
    if (changed) { place(prevKey.current !== null); prevKey.current = activeKey; }
    else if (!anim.current) { const to = measure(); if (!to || !last.current || !sameBox(to, last.current)) place(false); }
  });

  useEffect(() => {
    const h = host.current;
    if (!h) return;
    const re = () => place(false);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(re) : null;
    ro?.observe(h); h.querySelectorAll("[data-ikey]").forEach((el) => ro?.observe(el));
    addEventListener("resize", re); addEventListener("orientationchange", re);
    void document.fonts?.ready.then(re);
    return () => { ro?.disconnect(); removeEventListener("resize", re); removeEventListener("orientationchange", re); anim.current?.cancel(); };
  }, [place]);

  const indicator = <span ref={bubble} aria-hidden className={`pointer-events-none absolute left-0 top-0 opacity-0 ${opts.className ?? ""}`} style={{ willChange: "transform, width, height" }} />;
  return { host, indicator };
}

/** Smooth expand/collapse (grid-row transition). Closed content is inert so it cannot take focus. */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return <div className={`expand ${className ?? ""}`} data-open={open} inert={!open}><div>{children}</div></div>;
}

/** How long the first sweep to a value takes when a gauge or ring appears with its page; later changes use the shorter `ms`. */
const ENTRY_MS = 900, ENTRY_DELAY = 220;

/**
 * Tweens a number to its target. On first appearance (a page was entered) it sweeps up from zero after a short delay so it lands with the card cascade;
 * afterwards it only moves when the value actually changes, so ordinary data refreshes never replay an entrance. Reduced motion: no animation.
 */
export function useTween(target: number, ms = 300): number {
  const reduced = prefersReducedMotion();
  const [v, setV] = useState(reduced ? target : 0);
  const cur = useRef(reduced ? target : 0), first = useRef(true), raf = useRef(0), timer = useRef(0);
  useEffect(() => {
    const entering = first.current; first.current = false;
    if (prefersReducedMotion() || ms <= 0) { cur.current = target; setV(target); return; }
    const dur = entering ? Math.max(ENTRY_MS, ms) : ms;
    const run = () => {
      const from = cur.current, t0 = performance.now();
      const step = (now: number) => { const e = now - t0; const val = tweenAt(from, target, e, dur); cur.current = val; setV(val); if (e < dur) raf.current = requestAnimationFrame(step); };
      raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current); clearTimeout(timer.current);
    if (entering) timer.current = window.setTimeout(run, ENTRY_DELAY); else run();
    return () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); };
  }, [target, ms]);
  return v;
}

/** Tweens a list of numbers together (one progress for the whole list), with the same entrance behaviour as useTween. */
export function useTweenList(values: readonly number[], ms = 300): number[] {
  const key = values.join(",");
  const reduced = prefersReducedMotion();
  const [v, setV] = useState<number[]>(() => (reduced ? [...values] : values.map(() => 0)));
  const cur = useRef<number[]>(reduced ? [...values] : values.map(() => 0)), first = useRef(true), raf = useRef(0), timer = useRef(0);
  useEffect(() => {
    const target = key === "" ? [] : key.split(",").map(Number);
    const entering = first.current; first.current = false;
    if (prefersReducedMotion() || ms <= 0 || target.length !== cur.current.length) { cur.current = target; setV(target); return; }
    const dur = entering ? Math.max(ENTRY_MS, ms) : ms;
    const run = () => {
      const from = cur.current, t0 = performance.now();
      const step = (now: number) => { const e = now - t0; const next = target.map((t, i) => tweenAt(from[i], t, e, dur)); cur.current = next; setV(next); if (e < dur) raf.current = requestAnimationFrame(step); };
      raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current); clearTimeout(timer.current);
    if (entering) timer.current = window.setTimeout(run, ENTRY_DELAY); else run();
    return () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current); };
  }, [key, ms]);
  return v;
}

/**
 * Page entrance: when a page or tab body mounts, its header, tab bar and cards (anything with data-cascade, and every .panel) rise and fade in one after
 * another, 80 ms apart. It runs on navigation only (the element is re-created by a key change), never on data refreshes, skips what is below the fold,
 * and does nothing under reduced motion.
 */
export function useCascade(scope: { current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root || prefersReducedMotion()) return;
    const vh = window.innerHeight; let i = 0;
    for (const el of root.querySelectorAll<HTMLElement>("[data-cascade], .panel")) {
      if (el.dataset.cascaded || el.closest("[role=dialog]") || el.parentElement?.closest(".cascade")) continue;
      el.dataset.cascaded = "1";
      if (el.getBoundingClientRect().top > vh * 1.05) continue; // below the fold: appears as it is scrolled to
      el.style.setProperty("--cascade-delay", `${Math.min(i, 6) * 80}ms`);
      el.classList.add("cascade"); i++;
    }
  }, [scope]);
}

/** A page or tab body whose content cascades in when it mounts. Key it by what should replay the entrance (the module, the tab). */
export function PageFrame({ children, className = "page-in" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useCascade(ref);
  return <div ref={ref} className={className}>{children}</div>;
}
