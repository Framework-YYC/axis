# Design system
> **Design system v3.1 (2026-11-24): glass, motion and content-width-aware layout** are described in the sections at the end of this file and apply on top of v3.

> **Design system v3 (2026-11-24): premium industrial minimalism.** This section supersedes the earlier colour, typography, surface and navigation guidance below (silver canvas, Outfit, raised/inset layers, lime-dominant accents, five-item dock). Older sections are kept for history; where they conflict, v3 wins.


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
- **Checks:** `npm run ui:check` (scripts/ui-check.cjs, needs Playwright and a local Worker with synthetic data) tests overflow, console errors, touch targets and dock overlap on iPhone, iPad and desktop in both themes; `tests/mobile-ui.test.ts` guards the source-level rules in CI. Screenshots (synthetic): docs/screenshots/mobile-*.png and home-*.png.

## Environment switcher
`shared/environments.ts` allows exactly two hosts: `axis.frameworktools.ca` (Production, lime dot) and `axis-staging.frameworktools.ca` (Staging, amber dot). The dot always sits beside the environment's name. **Phone:** an Environment section at the bottom of the More sheet (current environment, host, "Switch to Staging" / "Switch to Production"), plus a small `AXIS · STAGING` row at the top of every page when on staging. **iPad:** a dot button at the bottom of the rail opens the same card beside it, and the rail logo carries an amber dot on staging. **Desktop:** the card sits above the identity card in the sidebar, and a STAGING tag sits beside "Axis" in the sidebar header. Switching is a plain link to the same path, query and hash on the other host (open-redirect shapes collapse to "/"); it carries no token, cookie, storage or data, and each host keeps its own Cloudflare Access sign-in and its own database. `scripts/env-check.cjs` verifies all layouts; unit tests cover the allow-list.

## Design system v3: premium industrial minimalism with instrument-style data graphics

**Reference.** The approved Overview reference (charcoal completion gauge, powder-blue workload gauge, butter-yellow dot-matrix activity chart, charcoal Tasks and Goals tiles) is the primary visual direction. Where this file and the reference differ in detail, the reference wins.

**Colour (`src/styles/index.css`).** Dark: near-black canvas `#101112`, charcoal surfaces `#1c1c1c` / `#222523`, soft off-white text `#ecece8`, muted grey `#9a9d98`. Data colours: powder blue `#c3d4e6`, butter `#efdfa5`, muted sage `#d5dfad` (deeper `#8c9f55` on light), terracotta `#d9806d` for overdue and warnings. Pastel cards keep dark text in both themes (`--w-on-blue`, `--w-butter-on`). Light theme: the same structure on `#eceded` with white-ish cards and hairlines. The lime brand accent (`#d4fa49`) is kept but used sparingly: the environment dot, rail marker and "now" markers. Per-module accents (`--m-*`) tint icons only.

**Type.** Geist Variable (bundled locally via `@fontsource-variable/geist`), light weights (300-350) for numerals and headings; JetBrains Mono only for small technical metadata. Heading 30 px on phones, KPI numerals 28 px light.

**Surfaces and controls.** Flat surfaces with one hairline border, no gradients, glow or stacked shadows; outlined controls; thin 1.3-1.5 px icon strokes; consistent radii (18-20 px cards, full pills). Every phone button is at least 44 px.

**Reusable visualizations (`src/components/viz.tsx`; geometry and scales in `shared/gauges.ts`, unit-tested).**
- `RadialGauge`: hatched disc, solid sage wedge for the completed share from 12 o'clock, a hand at 12, dotted circumference and twelve outer ticks. 0 is fully hatched, 100 solid.
- `FanGauge`: semicircle of one hatched segment per day; a segment's radial depth is its value relative to the busiest day (full depth = busiest, zero = a stub); a pale outer arc marks that scale; white endpoint markers.
- `DotMatrixBars`: blocks of fine dots, height relative to the tallest bar, fine cap line, weekday labels, future days ghosted, zero days a baseline cap only.
- `SplitBar` (sage done, neutral remaining, terracotta overdue, widths are shares of the total; zero total = empty track), `SegmentedProgress`, `TickRing` (dial; no data = unlit), `Kpi`.
All take real data as props; none invent figures.

**Home (`src/pages/Dashboard.tsx`).** Exactly five widgets: Daily completion (`focusStats`: completed today / completed today + open due today or overdue), Weekly workload (open tasks due in the next seven days, one fan segment per day), Task activity (tasks completed per day; periods This week, Last week, Last 7 days; a visible caption says what it measures), Tasks (open due today, a split bar, overdue count in terracotta; opens `/tasks`) and Goals (active count, average progress dial; opens `/goals`). Phone: two columns, then full width, then two columns; xl: three plus two in a 12-column grid, capped width. Completion days use the viewer's local time zone, not UTC.

**Navigation (module-first).** Six permanent destinations: Home, Daily, Health, Finance, Framework, Work (display labels; ids and assistants unchanged). Phone: a floating dock, thin monochrome icons, single-line labels, a subtle surface on the active destination, icon-only below 360 px, safe-area aware. iPad and desktop: the same six at the top of the rail, then Tasks, Goals, Calendar, Settings. Settings, theme and the environment switcher live in the header menu on phones (and in the rail, sidebar and Settings on wider screens). Each module page has contextual tabs (Daily: Overview, Tasks, Goals, Calendar; Health and Work: Overview, Tasks, Goals, Habits; Finance and Framework: Overview, Tasks, Goals) and a More menu for the other existing screens (Habits, Calendar, Briefing, Activity, Metrics). The plan is `PRIMARY_TABS` in `shared/modules.ts`.

**Tasks.** One screen over one set of records. Module and time-horizon selectors work together; priority, status (including Completed) and project are in a filter menu with removable chips. Opened from Home it shows every module; opened from a module tab it starts on that module (`?module=`). Rows: a 44 px completion target, wrapped title, module icon, compact due chip, subtle priority bar, a robot icon for assistant-filed records and a flask for synthetic ones; the full unverified-source warning is in the task detail.

## Design system v3.1: glass materials, motion and responsive dashboard rules

### Glass materials (`.glass`, `.glass-sheet`, `.glass-bubble`)
Used only for things that float above content: the phone dock, the iPad/desktop rail (and its theme and environment buttons), menus and popovers, sheets, and the active-selection bubble. **Dashboard cards stay solid** for readability.
- A translucent fill (`--glass-bg`, about 56-62 percent), `backdrop-filter: blur(24px) saturate(1.5)` (also `-webkit-`), a hairline border (`--glass-border`), an inner top-edge highlight (`--glass-edge`) and a soft two-layer shadow (`--glass-shadow`). Sheets use a more opaque fill (`--glass-sheet`) so forms stay readable. Light and dark values are tuned separately; the bubble is a brighter glass pill.
- Fallbacks: without `backdrop-filter` support, or with `prefers-reduced-transparency`, glass becomes a solid surface (`--glass-solid`).
- Navigation ink: `--dock-ink` (inactive) and `--dock-ink-on` (active) adapt to the theme.

### Motion system (`src/lib/motion.tsx`, `shared/motion.ts`, keyframes in `index.css`)
- **Tokens:** `--dur-fast` 160 ms, `--dur-base` 240 ms, `--dur-slow` 340 ms; `--ease-out`; `--ease-spring` (a light overshoot). Transform and opacity only, apart from the indicator's small size change.
- **One shared selection indicator** (`useSlidingIndicator`): items carry `data-ikey`; one bubble glides to the active item, elongating along its path (capped at 1.9 times its length, `stretchFrames`) and settling with a spring. Used by the dock, the rail, module tabs and segmented controls. It re-measures on resize, orientation change, font load and item size changes; an interrupted move continues from where the bubble is; direct loads, Back and Forward place it without delay; label colour transitions with it.
- **Page and tab transitions:** a 240 ms fade and rise keyed to the module, and a 160 ms fade keyed to the tab. They are keyed to navigation, never to data, so refreshes do not replay them. Entrance animations fill `backwards` only: a forwards-filled transform would make the wrapper a containing block and trap fixed sheets.
- **Sheets, menus, popovers:** sheets rise and fall with a scrim fade (the close is animated and never blocks input); popovers use a small scale-and-fade.
- **Tasks:** completing draws the check and pops the circle, then the row eases out before the list updates (reopening mirrors it). Group headings expand and collapse with a grid-row transition.
- **Data changes:** gauges, bars and the dial tween to new values (`useTween`, `useTweenList`), but not on first render. Split bars use a width transition.
- **Press feedback:** buttons and cards scale to 0.97 while pressed.
- **Reduced motion:** all CSS animation and transition durations collapse, and the indicator, tweens and row exits skip straight to their end state.

### Responsive rules: content width, not screen width
- Page-level layout uses **container queries** (`@container` on the page, `@[640px]`, `@[960px]`, `@[1000px]` variants), so iPad Split View, a narrow window and a wide desktop all get the right layout. Viewport breakpoints are used only for the navigation chrome (dock below 768 px, rail above).
- **Goals** are compact horizontal rows (progress ring, title on at most two lines, term and target, percentage, chevron), grouped by module and ordered short to long, one column when narrow and two when the content area is at least 640 px. **Progress logging, milestones and editing live in the detail sheet.** Habits are one-tap tiles (streak, seven-day history that hides when the tile is narrow), two columns from 700 px.
- **Home:** phones show the five core widgets. When the content area is at least 640 px a 12-column bento grid adds Today's priorities, Daily habits, Module overview and Upcoming schedule; at 1000 px the first row becomes four widgets and the third row three. Each extra widget uses live data only (due and overdue tasks with quick completion, today's habits, per-module open and today counts, the next seven days of events and due tasks).
- **Headers:** one instance adapts to its own width (account menu on phones, bell, one "New task" that gains its label when there is room). Module pages create tasks in that module from the header; there is no second creation button.
- **Secondary sidebar** (desktop): search first, then the section's navigation, live counts, the environment card and the account card. The logo lives only in the rail; on staging the rail also shows a small STAGING label and an amber dot.
- Checks: `scripts/responsive-sweep.cjs` (ten widths including Split View, every page, light and dark, empty and populated), `scripts/motion-check.cjs`, `scripts/nav-check.cjs`, `scripts/ui-check.cjs`, `scripts/env-check.cjs`; source guards in `tests/mobile-ui.test.ts`. Screenshots: docs/screenshots/.
