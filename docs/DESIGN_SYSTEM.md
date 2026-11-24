# Design system

Direction: calm, minimal, Apple-inspired; native-app feel, not an admin portal. Hairline borders, 18 px card radius, soft shadow, generous spacing, system typography, restrained colour.

## Tokens (`src/styles/index.css`)
Semantic colours: `bg`, `surface`, `surface-2`, `line`, `ink`, `muted`, `accent`, and status pairs `good|warn|bad` with `-soft` backgrounds. Light and dark are defined once; dark follows the device automatically or is forced in Settings (`data-theme`). Status colour always accompanies a word (Badge text), never colour alone. Type: system font stack, tabular numerals for money and counts, no oversized headings (page title 24 px).

## Components (`src/components/ui.tsx`)
Card, Widget (title/icon/action), PageHeader, Stat, Progress (ARIA progressbar), Badge, Segmented (ARIA tabs), Row, Button, DemoBadge, Empty. Shell provides navigation.

## Responsive behaviour
- < 768 px (iPhone): bottom tab bar (Dashboard, Tasks, Finance, Health, More sheet) with safe-area padding.
- 768-1023 px (iPad portrait): 76 px icon rail.
- ≥ 1024 px (iPad landscape, desktop): 240 px sidebar.
- Widgets use a 1/2/6-column grid so layouts can become user-arrangeable later.

## Interaction and accessibility
Targets ≥ 40 px; visible focus ring; labelled icon buttons; `prefers-reduced-motion` disables animation; charts have text alternatives; all synthetic screens carry a visible "synthetic demo data" badge.

## Charts
Recharts, single accent colour plus neutral, no gradients, animations off, axes de-emphasised.
