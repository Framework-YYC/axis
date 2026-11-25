// Navigation and Personal module checks. PLAYWRIGHT_PATH=... BASE=http://localhost:8790 OUT=/tmp/nav node scripts/nav-shots.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || "/tmp/nav-shots";
require("node:fs").mkdirSync(OUT, { recursive: true });
const SIZES = { "se": [320, 568], "splitview": [507, 1180], "iphone": [390, 844], "ipad-portrait": [820, 1180], "ipad-landscape": [1180, 820], "desktop": [1440, 900] };
const PAGES = ["/", "/m/personal?tab=overview", "/m/personal?tab=tasks", "/m/personal?tab=health", "/m/personal?tab=habits", "/m/personal?tab=goals", "/m/personal?tab=appointments", "/m/personal?tab=calendar", "/m/personal?tab=activity", "/m/financial", "/m/progressive", "/settings"];
(async () => {
  const b = await chromium.launch(); const issues = []; const notes = [];
  for (const [name, [w, h]] of Object.entries(SIZES)) for (const scheme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: w < 768 }); const pg = await ctx.newPage();
    pg.on("pageerror", (e) => issues.push(`${name} pageerror ${e.message}`)); pg.on("console", (m) => m.type() === "error" && issues.push(`${name}/${scheme} console ${m.text().slice(0, 100)}`));
    for (const p of PAGES) {
      await pg.goto(BASE + p, { waitUntil: "networkidle" }); await pg.waitForTimeout(450);
      const r = await pg.evaluate(() => ({ o: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: innerWidth < 768 ? [...document.querySelectorAll("main a[href], main button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest(".no-scrollbar"); }).map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)) : [] }));
      if (r.o > 0) issues.push(`${name}/${scheme}${p}: overflow ${r.o}`); if (r.small.length) issues.push(`${name}/${scheme}${p}: small targets ${r.small.join("|")}`);
      if (scheme === "dark" || p.includes("overview") || p === "/") await pg.screenshot({ path: `${OUT}/${name}-${scheme}-${p.replace(/[^a-z]+/gi, "_")}.png`, fullPage: name === "iphone" });
    }
    // dock evenly spaced, centred Orbis (phones)
    await pg.goto(BASE + "/m/personal", { waitUntil: "networkidle" }); await pg.waitForTimeout(400);
    if (w < 768) {
      const xs = await pg.evaluate(() => { const li = [...document.querySelectorAll('nav[aria-label="Primary"] ul > li')]; return li.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2); }); });
      const gaps = xs.slice(1).map((x, i) => x - xs[i]); const spread = Math.max(...gaps) - Math.min(...gaps);
      notes.push(`${name}/${scheme} dock centres ${xs.join(",")} gap spread ${spread}`); if (xs.length !== 5 || spread > 2) issues.push(`${name}/${scheme}: dock not evenly spaced ${xs}`);
      const mid = Math.round(w / 2); if (Math.abs(xs[2] - mid) > 2) issues.push(`${name}/${scheme}: Orbis button not centred ${xs[2]} vs ${mid}`);
    }
    // Orbis menu
    const btn = pg.locator('button[aria-label="Orbis menu"]:visible').first();
    await btn.click(); await pg.waitForTimeout(700);
    const m = await pg.evaluate(() => { const ul = document.querySelector('ul[role="menu"][aria-label="Orbis"]'); if (!ul) return null; const r = ul.getBoundingClientRect(); const items = [...ul.querySelectorAll('[role="menuitem"]')].map((e) => (e.textContent || "").trim().slice(0, 30)); return { l: r.left, t: r.top, r: r.right, b: r.bottom, items, op: getComputedStyle(ul).opacity, h: [...ul.querySelectorAll('[role="menuitem"]')].map((e) => Math.round(e.getBoundingClientRect().height)) }; });
    if (!m) issues.push(`${name}/${scheme}: menu did not open`); else {
      if (m.l < 0 || m.t < 0 || m.r > w || m.b > h) issues.push(`${name}/${scheme}: menu outside viewport ${JSON.stringify([m.l, m.t, m.r, m.b])}`);
      if (m.items.length < 5) issues.push(`${name}/${scheme}: menu items ${m.items.join("|")}`); if (m.h.some((x) => x < 44)) issues.push(`${name}/${scheme}: menu item under 44 px ${m.h}`); if (m.op !== "1") issues.push(`${name}/${scheme}: menu opacity ${m.op}`);
      if (name === "iphone" || name === "desktop" || name === "ipad-portrait") await pg.screenshot({ path: `${OUT}/${name}-${scheme}-menu.png` });
    }
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
    const gone = await pg.evaluate(() => !document.querySelector('ul[role="menu"][aria-label="Orbis"]')); if (!gone) issues.push(`${name}/${scheme}: menu did not close on Escape`);
    // Quick Add from the menu on the Finance screen: first suggestion is Transaction
    await pg.goto(BASE + "/m/financial?tab=transactions", { waitUntil: "networkidle" }); await pg.waitForTimeout(300);
    await pg.locator('button[aria-label="Orbis menu"]:visible').first().click(); await pg.waitForTimeout(500);
    await pg.getByRole("menuitem", { name: "Quick Add" }).click(); await pg.waitForTimeout(600);
    const first = await pg.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Quick add"]'); return d ? (d.querySelector("ul li button")?.textContent || "").trim() : null; });
    if (!first || !/Transaction/.test(first)) issues.push(`${name}/${scheme}: quick add first option ${first}`);
    if (name === "iphone") await pg.screenshot({ path: `${OUT}/${name}-${scheme}-quickadd.png` });
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
    // Search
    await pg.keyboard.press("Control+k"); await pg.waitForTimeout(400);
    await pg.keyboard.type("dent"); await pg.waitForTimeout(300);
    const hits = await pg.evaluate(() => document.querySelectorAll('[role="dialog"][aria-label="Search"] ul li button').length); notes.push(`${name}/${scheme} search hits for "dent": ${hits}`);
    if (name === "iphone" && scheme === "dark") await pg.screenshot({ path: `${OUT}/${name}-${scheme}-search.png` });
    await ctx.close();
  }
  // legacy routes
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await c2.newPage();
  await p2.goto(BASE + "/m/health?tab=habits", { waitUntil: "networkidle" }); const u1 = p2.url().replace(BASE, ""); await p2.goto(BASE + "/m/health", { waitUntil: "networkidle" }); const u2 = p2.url().replace(BASE, ""); await p2.goto(BASE + "/m/daily", { waitUntil: "networkidle" }); const u3 = p2.url().replace(BASE, "");
  notes.push(`legacy: ${u1} | ${u2} | ${u3}`); if (u1 !== "/m/personal?tab=habits" || u2 !== "/m/personal?tab=health" || u3 !== "/m/personal") issues.push("legacy redirects wrong");
  await b.close(); console.log(notes.slice(0, 6).join("\n")); console.log(issues.length ? issues.join("\n") : "no navigation issues");
})();
