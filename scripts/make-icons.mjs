// Renders public/icon.svg to the PNG sizes iOS and the manifest need. Dev tool only (uses the locally installed Playwright).
import { createRequire } from "node:module";
const { chromium } = createRequire("/opt/node-tools/")("playwright");
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
const b = await chromium.launch();
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: new URL(`../public/${name}.png`, import.meta.url).pathname });
}
await b.close();
