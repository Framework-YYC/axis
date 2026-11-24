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
- **Desktop (≥ 1280 px)**: black rail + contextual secondary panel (workspace switcher, search with ⌘K, the current page's sections, LIVE counts, the five assistant modules with open-task counts, identity card) + sheet.
- **iPad landscape (1024-1279 px)**: rail + sheet; the contextual panel becomes scrollable chips under the header. 12-column dashboard grid.
- **iPad portrait (768-1023 px)**: rail + sheet; 6-column grid with paired cards.
- **iPhone (< 768 px)**: no sheet; compact header (round bell and "+" actions), floating black dock (Overview, Tasks, Assistants sheet with the five modules, Calendar, More sheet with Goals & Habits and Settings), single-column stack ordered by priority.
- The dashboard is intentionally asymmetric: a wide Today hero (big numeral, dot-matrix day, insight bar) beside the attention queue; priorities beside the briefing; schedule beside finance; rotation, health and goals as a trio.

## Interaction and accessibility
Targets ≥ 40 px on touch; visible focus ring; labelled icon buttons; ARIA tabs, toggles and progress; charts have text alternatives and a live readout; reduced-motion disables animation; key hints (↵ / Esc / ⌘K) are hidden on touch. The attention card accepts Enter / Escape only while the card itself has focus.

## Data honesty
Anything not backed by the live API carries a mono "SYNTHETIC" tag and the page header says which parts are synthetic. Axis starts empty. Demonstration records are real rows flagged `demo`, titled "(synthetic)" and tagged SYNTHETIC wherever they appear; the owner loads and removes them in Settings. On a deployed host an unreachable API is shown as an error, never as fake data.

## Modules and horizons
The five assistant modules share one module page (`/m/<module>`, tabs Overview, Tasks, Goals, Habits, Briefing, Activity, Metrics) built from the existing Widget, Row, SegBar and Tabs components. Task rows (`TaskLine`) show the module, a repeat glyph for recurring tasks, the source assistant and a SYNTHETIC tag; tasks are grouped under collapsible horizon headings (`TaskGroups`) with the overdue group in the alert colour. Editors (`editors.tsx`) are sheets on iPhone and centred panels elsewhere. Grid children may shrink (`.grid > * { min-width: 0 }`) so long titles truncate instead of widening the page.

## Phone design (iPhone, under 768 px)
Presentation only: data, APIs and permissions are unchanged, and iPad and desktop keep their layouts (shared task rows gain module icons and a priority marker).
- **Overview** (`MobileOverview`): a daily progress ring (done today / due today and overdue), a five-icon assistant launcher with due counts, a capped "Up next" (four tasks, overdue first), two tiles (upcoming tasks with a seven-day bar chart; today's habits as dots), one goals row (average progress ring, next target), a schedule preview and an attention banner. Empty sections are left out. Every figure is computed from live data (`shared/overview.ts`, unit-tested).
- **Module accents:** one subtle colour per module (`--m-daily`, `--m-health`, `--m-financial`, `--m-framework`, `--m-progressive`, light and dark values) used only on icons and faint tints, via `ModuleIcon`. The lime accent stays the single bright colour.
- **Tasks:** a 44 px completion target, a wrapped title (two lines), a module icon, a compact due chip (Today, Tomorrow, weekday, date, "2d late" in red), and a thin amber or red bar for high and critical priority. Provenance is one small robot icon (assistant-filed) or flask icon (synthetic); the **full unverified-source warning and the source reference live in the task detail view**.
- **Goals:** compact rows with a progress ring, grouped by module and ordered short, medium, long; details, progress logging and milestones open in a bottom sheet. **Habits:** one-tap tracker with streak, seven-day history and a rest-today group (rotation-aware); amounts and editing open in a sheet.
- **Calendar:** a horizontal date strip with event and task markers and an agenda for the chosen day (next events when the day is empty); the full month grid is one tap away.
- **Surfaces:** one soft layer (`.flat`) instead of nested bordered cards; `Widget bare` drops card chrome on phones. **Touch:** every button is at least 44 px tall (`.btn` rule, `.hit`). **Safe area:** the shell reserves the dock height plus `env(safe-area-inset-bottom)`.
- **Checks:** `npm run ui:check` (scripts/ui-check.cjs, needs Playwright and a local Worker with synthetic data) tests overflow, console errors, touch targets and dock overlap on iPhone, iPad and desktop in both themes; `tests/mobile-ui.test.ts` guards the source-level rules in CI. Screenshots (synthetic): docs/screenshots/mobile-*.png.
