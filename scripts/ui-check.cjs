// Responsive UI check: horizontal overflow, console errors, 44 px touch targets and content hidden behind the dock, on iPhone, iPad and desktop in light and dark.
// Run against a local Worker with SYNTHETIC data (npm run build && wrangler dev, then Settings > Load demonstration data or POST /api/v1/demo/load):
//   PLAYWRIGHT_PATH=/path/to/node_modules/playwright BASE=http://localhost:8788 node scripts/ui-check.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://localhost:8788";
const sizes = { phone: { width: 390, height: 844 }, ipadP: { width: 820, height: 1180 }, ipadL: { width: 1180, height: 820 }, desk: { width: 1600, height: 1000 } };
const pages = ["/", "/tasks?h=today", "/goals", "/calendar", "/m/daily?tab=overview", "/m/health?tab=habits", "/settings"];
(async () => {
  require("node:fs").mkdirSync(process.env.OUT || "/tmp/axis-shots", { recursive: true });
  const b = await chromium.launch(); const issues = []; let shots = 0;
  for (const [sn, vp] of Object.entries(sizes)) for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: sn === "phone" ? 2 : 1, hasTouch: sn === "phone" });
    const pg = await ctx.newPage();
    pg.on("console", (m) => { if (m.type() === "error") issues.push(`${sn}/${scheme} console: ${m.text().slice(0, 140)}`); });
    pg.on("pageerror", (e) => issues.push(`${sn}/${scheme} pageerror: ${e.message}`));
    for (const p of pages) {
      await pg.goto(BASE + p, { waitUntil: "networkidle" }); await pg.waitForTimeout(350);
      const tag = `${sn}/${scheme}${p}`;
      const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) issues.push(`${tag}: horizontal overflow ${over}px`);
      if (sn === "phone") {
        const bad = await pg.evaluate(() => [...document.querySelectorAll("a[href], button")].filter((e) => { const r = e.getBoundingClientRect(); const vis = r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && e.closest("[aria-hidden=true]") === null && e.offsetParent !== null; return vis && (r.width < 43.5 || r.height < 43.5) && !e.closest(".no-scrollbar"); }).slice(0, 6).map((e) => `${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 28)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
        if (bad.length) issues.push(`${tag}: small touch targets: ${bad.join(" | ")}`);
        // content hidden behind the floating dock: scroll to the bottom; the last content must end above the dock
        await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(150);
        const hidden = await pg.evaluate(() => { const dock = document.querySelector("nav[aria-label=Primary].fixed"); if (!dock) return null; const top = dock.getBoundingClientRect().top; const main = document.querySelector("main"); const last = main.lastElementChild; const bottom = last ? last.getBoundingClientRect().bottom : 0; return bottom > top ? Math.round(bottom - top) : 0; });
        if (hidden) issues.push(`${tag}: ${hidden}px of content sits behind the dock`);
        await pg.evaluate(() => window.scrollTo(0, 0));
      }
      const name = `${process.env.OUT || "/tmp/axis-shots"}/${sn}-${scheme}-${p.replace(/[^a-z]+/gi, "_")}.png`;
      if (sn === "phone" || scheme === "light" || p === "/") { await pg.screenshot({ path: name }); shots++; }
    }
    await ctx.close();
  }
  console.log(issues.join("\n") || "no issues"); console.log("screenshots:", shots);
  await b.close();
})();
