# Design system

Direction (supersedes the earlier generic Apple-style dashboard): a premium, precision-designed personal operating system by Framework. Cool silver canvas, layered raised surfaces with inset controls, a monochrome black / white / grey foundation, one restrained electric-lime accent (`#D4FA49`), black pill actions, light oversized numerals, and monospace for technical labels. The light theme is the reference; dark keeps the same dimensional hierarchy.

## Layers (depth is the structure)
1. **Canvas**: silver gradient (`--canvas-a/b`).
2. **Sheet**: the large raised content surface (`--sheet`, 28 px radius), iPad and desktop only; phones sit on the canvas.
3. **Panel** (`.panel`): raised card, white-to-off-white gradient, top highlight and soft drop shadow, 20 px radius.
4. **Dim panel** (`.panel-dim`): flat tinted card for secondary items (queued attention items, insight bars).
5. **Inset** (`.inset`): recessed tracks and fields (segmented controls, search, inputs); the active segment is `.raised`.

## Tokens (`src/styles/index.css`)
Surface: `--canvas-*`, `--sheet`, `--card-a/b`, `--card-dim`, `--inset`. Ink: `--ink`, `--muted`, `--faint`, `--line`. Accent: `--lime`, `--lime-ink` (text on lime), `--lime-deep` (outline rings). Status: `--red`, `--amber`. Pills: `--pill-bg/--pill-ink` (black in light, white in dark). Shadows: `--sh-sheet/-card/-inset/-pill/-soft`. The theme is always resolved to `data-theme="light|dark"` (`public/theme-init.js` before first paint, `useTheme` after; "Automatic" follows the device live).

Accent discipline: lime is used only for the counts, "now", positive deltas, active status, water, the active rail marker. Status colour always carries words (red = failure, amber = in progress).

## Typography
- **Outfit** (variable, self-hosted via `@fontsource-variable/outfit`) for UI and display. Display numerals are weight 200, tight tracking.
- **JetBrains Mono** (variable, self-hosted) for technical labels, timestamps, IDs, supporting data; 10.5 px uppercase with 0.07 em tracking (`.mono`).
- Fonts are bundled as same-origin files (`assetsInlineLimit: 0`), so the strict CSP (`font-src 'self'`) holds and nothing loads from a third party.

## Components (`src/components/`)
`ui.tsx`: `Panel`, `Widget` (title, count badge, tag, action), `PageHeader` (mono breadcrumb, light H1, controls, bell, primary pill, contextual chips), `Segmented` (inset), `IconToggle`, `Tabs` (underline), `Btn` (`primary` black pill, `soft`, `dash`, `ghost`; optional key hint), `LinkBtn` (dashed outline "Open … →"), `Status` (dot or lime pill), `Tag` (mono ID chip), `DemoTag`, `Meter`, `Row`, `StatLine`, `CountBadge`.
`charts.tsx`: `DotMatrix` (dot, fine-line and bar modes over the same data, NOW marker, annotation, hover readout), `SegBar` (segmented ticks for progress, rotation, habits, priority), `Spark` (fine-line with lime end marker).
`Shell.tsx` / `nav.tsx`: floating black rail with lime active marker and a 24-hour day scale, contextual secondary panel, chips and dock.
Pure logic lives in `shared/` (`taskViews.ts`, `viz.ts`) and is unit-tested.

## Navigation and responsive behaviour
- **Desktop (≥ 1280 px)**: black rail + contextual secondary panel (workspace switcher, search with ⌘K, module sections, LIVE status counts, task folders, identity card) + sheet.
- **iPad landscape (1024-1279 px)**: rail + sheet; the contextual panel becomes scrollable chips under the header. 12-column dashboard grid.
- **iPad portrait (768-1023 px)**: rail + sheet; 6-column grid with paired cards.
- **iPhone (< 768 px)**: no sheet; compact header (round bell and "+" actions), floating black dock (Dashboard, Tasks, Finance, Health, More sheet), single-column stack ordered by priority.
- The dashboard is intentionally asymmetric: a wide Today hero (big numeral, dot-matrix day, insight bar) beside the attention queue; priorities beside the briefing; schedule beside finance; rotation, health and goals as a trio.

## Interaction and accessibility
Targets ≥ 40 px on touch; visible focus ring; labelled icon buttons; ARIA tabs, toggles and progress; charts have text alternatives and a live readout; reduced-motion disables animation; key hints (↵ / Esc / ⌘K) are hidden on touch. The attention card accepts Enter / Escape only while the card itself has focus.

## Data honesty
Anything not backed by the live API carries a mono "SYNTHETIC" tag and the page header says which parts are synthetic. Demo data appears only when the page runs from the developer's machine without a Worker; on a deployed host an unreachable API is shown as an error, never as fake data.
