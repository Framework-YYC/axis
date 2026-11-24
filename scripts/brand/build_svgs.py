"""Generates the Orbis brand SVGs.
The mark is the wireframe sphere from the Orbis concept board: an outer circle, an equator ellipse, a tilted orbit and a centre dot. Its geometry
(circle r358, ellipses rx358 ry113 and ry153 at -50 degrees, dot r17 on a 1024 grid) was produced with Higgsfield (gpt_image_2_6, SVG output)
from the concept's description and is used here unchanged. Type is Geist Light, converted to outlines so every file renders identically
without the font. Usage: python3 scripts/brand/build_svgs.py <out_dir>"""
import sys, os, glob
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = sys.argv[1]; os.makedirs(OUT + "/svg", exist_ok=True)
LIME, FOREST, CHARCOAL, CANVAS, STONE = "#D5DFB3", "#2A332D", "#1A1D1C", "#F2F3EF", "#A0A7A1"
FONT = glob.glob("node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")[0]
fonts = {}
def text_path(s, size, weight, tracking=0.0):
    f = fonts.setdefault(weight, instancer.instantiateVariableFont(TTFont(FONT), {"wght": weight})); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f["head"].unitsPerEm
    k = size / upm; x = 0.0; parts = []
    for ch in s:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, 0))); parts.append(pen.getCommands()); x += gs[g].width * k + tracking * size
    return " ".join(parts), x - tracking * size

def mark(color, sw=10, dot=None):
    return (f'<g fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"><circle cx="512" cy="512" r="358"/>'
            f'<ellipse cx="512" cy="512" rx="358" ry="113"/><ellipse cx="512" cy="512" rx="358" ry="153" transform="rotate(-50 512 512)"/></g>'
            f'<circle cx="512" cy="512" r="{dot or 17 + (sw - 10) * 0.45:.1f}" fill="{color}"/>')
def svg(vb, body, title):
    x, y, W, H = vb
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {W:g} {H:g}" width="{W:g}" height="{H:g}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
def save(name, s): open(f"{OUT}/svg/{name}.svg", "w").write(s)

CROP = (136, 136, 752, 752)
COLORWAYS = {  # name: (mark, wordmark, secondary text)
    "on-dark": (LIME, CANVAS, STONE), "on-light": (FOREST, CHARCOAL, "#5b645e"), "mono-black": ("#000000", "#000000", "#000000"), "mono-white": ("#ffffff", "#ffffff", "#ffffff"),
}
# standalone marks: regular line for large use, bold line for small sizes
for n, (m, _, _) in COLORWAYS.items():
    save(f"orbis-mark-{n}", svg(CROP, mark(m, 10), "Orbis"))
    save(f"orbis-mark-bold-{n}", svg(CROP, mark(m, 30), "Orbis"))
# app icons
def tile(bg, fg, rx=224, sw=18, scale=1.0):
    g = mark(fg, sw)
    if scale != 1.0: g = f'<g transform="translate(512 512) scale({scale}) translate(-512 -512)">{g}</g>'
    return svg((0, 0, 1024, 1024), f'<rect width="1024" height="1024" rx="{rx}" fill="{bg}"/>{g}', "Orbis")
save("orbis-icon-charcoal", tile(CHARCOAL, LIME)); save("orbis-icon-forest", tile(FOREST, LIME)); save("orbis-icon-canvas", tile(CANVAS, CHARCOAL))
save("orbis-icon-charcoal-bold", tile(CHARCOAL, LIME, sw=40))                       # favicons and very small sizes
save("orbis-icon-square", tile(CHARCOAL, LIME, rx=0, sw=18, scale=1.12))            # full bleed for the iOS touch icon: iOS applies its own corner mask
save("orbis-icon-maskable", tile(CHARCOAL, LIME, rx=0, sw=22, scale=0.78))          # Android adaptive icon: sphere inside the central safe zone

def lines(color, sub, size=300, lower=False):
    word = "orbis" if lower else "ORBIS"
    wp, ww = text_path(word, size, 300, 0.30 if lower else 0.34)
    bp, bw = text_path("BY FRAMEWORK", size * 0.17, 300, 0.42)
    return wp, ww, bp, bw
def lockup(m, w, s, tagline, stacked, lower=False):
    size = 300; wp, ww, bp, bw = lines(w, s, size, lower); tp, tw = text_path("Your world. One system.", size * 0.2, 400, 0.01)
    cap = size * 0.72
    if stacked:
        mw = 752 * 0.5; W = max(ww, mw, bw, tw if tagline else 0)
        body = f'<g transform="translate({(W - mw)/2} 0) scale(0.5) translate(-136 -136)">{mark(m, 10)}</g>'
        y = mw + 70 + cap
        body += f'<path transform="translate({(W - ww)/2} {y})" d="{wp}" fill="{w}"/><path transform="translate({(W - bw)/2} {y + size * 0.3})" d="{bp}" fill="{s}"/>'
        H = y + size * 0.3 + 10
        if tagline: body += f'<path transform="translate({(W - tw)/2} {H + 90})" d="{tp}" fill="{w}" opacity="0.9"/>'; H += 100
        return body, W, H
    sc = 0.36; mw = 752 * sc
    body = f'<g transform="scale({sc}) translate(-136 -136)">{mark(m, 10)}</g><rect x="{mw + 40}" y="{mw * 0.1}" width="3" height="{mw * 0.8}" fill="{s}" opacity="0.6"/>'
    tx = mw + 90; ty = (mw - (cap + size * 0.3)) / 2 + cap
    body += f'<path transform="translate({tx} {ty})" d="{wp}" fill="{w}"/><path transform="translate({tx} {ty + size * 0.3})" d="{bp}" fill="{s}"/>'
    W = tx + ww; H = mw
    if tagline: body += f'<path transform="translate({tx} {H + 80})" d="{tp}" fill="{w}" opacity="0.9"/>'; H += 100
    return body, W, H
for n, (m, w, s) in COLORWAYS.items():
    for stacked in (False, True):
        for tag in (False, True):
            b, W, H = lockup(m, w, s, tag, stacked)
            save(f"orbis-lockup-{'stacked' if stacked else 'horizontal'}{'-tagline' if tag else ''}-{n}", svg((-24, -24, W + 48, H + 48), b, "Orbis by Framework. Your world. One system." if tag else "Orbis by Framework"))
    wp, ww, bp, bw = lines(w, s)
    save(f"orbis-wordmark-{n}", svg((-20, -20, ww + 40, 300 * 0.72 + 40), f'<path transform="translate(0 {300 * 0.72})" d="{wp}" fill="{w}"/>', "Orbis"))
    W = max(ww, bw)
    save(f"orbis-wordmark-by-framework-{n}", svg((-20, -20, W + 40, 300 * 0.72 + 300 * 0.3 + 50), f'<path transform="translate({(W-ww)/2} {300 * 0.72})" d="{wp}" fill="{w}"/><path transform="translate({(W-bw)/2} {300 * 1.02})" d="{bp}" fill="{s}"/>', "Orbis by Framework"))
    lp, lw, _, _ = lines(w, s, lower=True)  # lower-case wordmark used on the launch screen
    save(f"orbis-wordmark-lowercase-{n}", svg((-20, -20, lw + 40, 300 * 0.9 + 40), f'<path transform="translate(0 {300 * 0.72})" d="{lp}" fill="{w}"/>', "orbis"))
print(len(os.listdir(OUT + "/svg")), "svg files")
