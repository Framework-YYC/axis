/** Motion geometry for the shared selection indicator. Pure, so the stretch-and-settle behaviour is unit-tested without a browser. */
export interface Box { x: number; y: number; w: number; h: number }

export const MOTION = { fast: 160, base: 240, slow: 340, indicator: 380 } as const;
/** Easings as CSS strings: a standard ease-out, and a restrained spring (slight overshoot, then settle). */
export const EASE = { out: "cubic-bezier(0.2, 0.7, 0.2, 1)", spring: "cubic-bezier(0.32, 1.25, 0.4, 1)", inOut: "cubic-bezier(0.4, 0, 0.2, 1)" } as const;

export const sameBox = (a: Box, b: Box, eps = 0.5): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.w - b.w) < eps && Math.abs(a.h - b.h) < eps;

/** The axis the indicator travels along: the one with the larger centre-to-centre distance. */
export function travelAxis(from: Box, to: Box): "x" | "y" {
  return Math.abs(to.x + to.w / 2 - (from.x + from.w / 2)) >= Math.abs(to.y + to.h / 2 - (from.y + from.h / 2)) ? "x" : "y";
}

/** The bubble elongates by at most this multiple of its own length, plus a little for long journeys: restrained, never a bar across the dock. */
export const MAX_STRETCH = 1.9;

/**
 * Stretch-and-settle keyframes: the indicator leaves its old position, elongates along the travel axis (capped), then contracts into the
 * new position with a slight spring overshoot. The cross axis keeps the destination size, so the pill never balloons sideways.
 */
export function stretchFrames(from: Box, to: Box): Array<{ box: Box; offset: number; easing: string }> {
  const axis = travelAxis(from, to);
  const [fPos, fLen, tPos, tLen] = axis === "x" ? [from.x, from.w, to.x, to.w] : [from.y, from.h, to.y, to.h];
  const unionLen = Math.max(fPos + fLen, tPos + tLen) - Math.min(fPos, tPos);
  const dist = Math.abs(tPos + tLen / 2 - (fPos + fLen / 2));
  const stretchLen = Math.min(unionLen, tLen * MAX_STRETCH + dist * 0.12);
  const centre = fPos + fLen / 2 + 0.42 * (tPos + tLen / 2 - (fPos + fLen / 2));
  const pos = centre - stretchLen / 2;
  const mid: Box = axis === "x" ? { x: pos, y: to.y, w: stretchLen, h: to.h } : { x: to.x, y: pos, w: to.w, h: stretchLen };
  return [
    { box: from, offset: 0, easing: EASE.inOut },
    { box: mid, offset: 0.42, easing: EASE.spring },
    { box: to, offset: 1, easing: EASE.out },
  ];
}

/** Position relative to a container, including its scroll offset (so indicators inside scrolling tab bars stay correct). */
export function relativeBox(item: { left: number; top: number; width: number; height: number }, container: { left: number; top: number }, scroll: { x: number; y: number }, inset = 0): Box {
  return { x: item.left - container.left + scroll.x + inset, y: item.top - container.top + scroll.y + inset, w: Math.max(0, item.width - inset * 2), h: Math.max(0, item.height - inset * 2) };
}

/** Eased interpolation for value tweens (chart and progress changes). t in 0..1. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The value at time `elapsed` of a tween from `from` to `to` lasting `duration` ms. */
export const tweenAt = (from: number, to: number, elapsed: number, duration: number): number => (duration <= 0 ? to : lerp(from, to, easeOutCubic(elapsed / duration)));
