// Work module screenshots and layout checks. PLAYWRIGHT_PATH=... BASE=http://localhost:8790 OUT=docs/screenshots node scripts/work-shots.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || "docs/screenshots";
const SIZES = { "iphone": [390, 844], "ipad-portrait": [820, 1180], "ipad-landscape": [1180, 820], "desktop": [1440, 900] };
const TABS = ["overview", "tasks", "progress", "procurement"];
(async () => {
  const b = await chromium.launch(); const issues = [];
  for (const [name, [w, h]] of Object.entries(SIZES)) for (const scheme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2, hasTouch: w < 768 }); const pg = await ctx.newPage();
    pg.on("pageerror", (e) => issues.push(`${name} pageerror ${e.message}`)); pg.on("console", (m) => m.type() === "error" && issues.push(`${name} console ${m.text().slice(0, 90)}`));
    for (const t of TABS) {
      await pg.goto(`${BASE}/m/progressive?tab=${t}`, { waitUntil: "networkidle" }); await pg.waitForTimeout(500);
      const r = await pg.evaluate(() => ({ o: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: innerWidth < 768 ? [...document.querySelectorAll("main a[href], main button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest(".no-scrollbar"); }).map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)) : [] }));
      if (r.o > 0) issues.push(`${name}/${scheme}/${t}: overflow ${r.o}`); if (r.small.length) issues.push(`${name}/${scheme}/${t}: small targets ${r.small.join("|")}`);
      await pg.screenshot({ path: `${OUT}/work-${t}-${name}-${scheme}.png`, fullPage: name === "iphone" || name.startsWith("ipad-p") });
    }
    await ctx.close();
  }
  await b.close(); console.log(issues.length ? issues.join("\n") : "no layout issues");
})();
