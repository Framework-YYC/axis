// Renders every SVG in <dir>/svg to transparent PNGs and vector PDFs, and writes the app icons. Usage: node scripts/brand/export.cjs <dir>
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const dir = process.argv[2]; const svgs = fs.readdirSync(`${dir}/svg`).filter((f) => f.endsWith(".svg"));
for (const d of ["png", "pdf", "icons"]) fs.mkdirSync(`${dir}/${d}`, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  const read = (f) => fs.readFileSync(`${dir}/svg/${f}`, "utf8");
  const dims = (s) => { const m = /viewBox="([-\d. ]+)"/.exec(s)[1].split(/\s+/).map(Number); return { w: m[2], h: m[3] }; };
  async function png(svg, w, h, out) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svg.replace(/ width="[^"]*" height="[^"]*"/, "")}`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  }
  for (const f of svgs) {
    const s = read(f), { w, h } = dims(s), name = f.replace(".svg", "");
    const isIcon = name.startsWith("orbis-icon"); const W = isIcon ? 1024 : 1600, H = Math.round((W * h) / w);
    await png(s, W, H, `${dir}/png/${name}.png`);
    await page.setContent(`<style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0}svg{display:block;width:${w}px;height:${h}px}</style>${s.replace(/ width="[^"]*" height="[^"]*"/, "")}`);
    await page.pdf({ path: `${dir}/pdf/${name}.pdf`, width: `${w}px`, height: `${h}px`, printBackground: true, pageRanges: "1" });
  }
  // app icons
  const tile = read("orbis-icon-charcoal.svg"), bold = read("orbis-icon-charcoal-bold.svg"), square = read("orbis-icon-square.svg"), mask = read("orbis-icon-maskable.svg");
  for (const [name, svg, size] of [["apple-touch-icon", square, 180], ["icon-192", tile, 192], ["icon-512", tile, 512], ["icon-maskable-512", mask, 512], ["icon-1024", tile, 1024], ["favicon-32", bold, 32], ["favicon-16", bold, 16], ["favicon-48", bold, 48]]) await png(svg, size, size, `${dir}/icons/${name}.png`);
  await b.close();
})();
