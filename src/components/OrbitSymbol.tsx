/** The Orbis orbital symbol (the existing brand mark: sphere, equator, tilted orbit, core). Drawn in the colour of its container. */
export function OrbitSymbol({ size = 28, stroke = 34 }: { size?: number; stroke?: number }) {
  return (
    <svg viewBox="136 136 752 752" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="512" cy="512" r="358" /><ellipse cx="512" cy="512" rx="358" ry="113" /><ellipse cx="512" cy="512" rx="358" ry="153" transform="rotate(-50 512 512)" />
      <circle cx="512" cy="512" r="40" fill="currentColor" stroke="none" />
    </svg>
  );
}
