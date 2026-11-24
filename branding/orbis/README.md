# Orbis by Framework: brand package

Tagline: **Your world. One system.**

The mark is the wireframe sphere from the Orbis concept board: an outer circle, an equator orbit, a tilted orbit and a centre dot. Its geometry was generated with Higgsfield from the concept and is used unchanged. Type is Geist Light (wordmark, wide tracking) with the tagline in Geist Regular. All type is converted to outlines, so no font is needed to use these files.

## Palette
| Name | Hex | Use |
|---|---|---|
| Orbis Lime | `#D5DFB3` | The mark on dark, accents |
| Forest | `#2A332D` | Secondary tile, the mark on light |
| Charcoal | `#1A1D1C` | Primary tile and dark backgrounds |
| Canvas | `#F2F3EF` | Wordmark on dark, light tile |
| Stone | `#A0A7A1` | "BY FRAMEWORK" and secondary text |

## Files
- `svg/` the master vector files. `png/` transparent PNGs (1600 px wide; icons 1024). `pdf/` vector PDFs. `icons/` app and favicon PNGs.
- Naming: `orbis-<kind>-<colourway>`. Colourways: `on-dark` (lime mark, canvas type), `on-light` (forest mark, charcoal type), `mono-black`, `mono-white`.
- Kinds: `mark` (standalone symbol; `mark-bold` has a heavier line for small sizes), `wordmark`, `wordmark-by-framework`, `wordmark-lowercase` (launch screen), `lockup-horizontal` and `lockup-stacked` (each with a `-tagline` version), `icon-*` (charcoal, forest, canvas tiles; `icon-square` full-bleed for iOS; `icon-maskable` for Android).
- `icons/`: `apple-touch-icon.png` (180), `icon-192/512.png`, `icon-maskable-512.png`, `favicon-16/32/48.png`, `icon-1024.png`.

## Use
Keep clear space equal to the width of the outer circle's stroke times ten around the mark. Do not recolour outside the palette, rotate, outline, add effects or change the line weight; use `mark-bold` below 48 px. Regenerate with `python3 scripts/brand/build_svgs.py branding/orbis && node scripts/brand/export.cjs branding/orbis`.
