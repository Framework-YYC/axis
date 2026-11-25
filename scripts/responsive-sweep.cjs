// Responsive sweep: every page at iPhone, Split View, iPad and desktop widths. Reports horizontal overflow, clipped controls, titles over two lines, content behind the dock and undersized touch targets.
//   PLAYWRIGHT_PATH=/path/to/node_modules/playwright BASE=http://localhost:8788 [SMALL=1] [SCHEMES=dark,light] node scripts/responsive-sweep.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const SIZES = process.env.SMALL ? { "iPhone SE 320": [320, 568], "iPhone 15 390": [390, 844], "SplitView 507": [507, 1180], "iPad portrait 820": [820, 1180], "iPad landscape 1180": [1180, 820], "desktop 1600": [1600, 1000] } : { "iPhone SE 320": [320, 568], "iPhone 15 390": [390, 844], "iPhone Max 430": [430, 932], "SplitView 375": [375, 1180], "SplitView 507": [507, 1180], "SplitView 678": [678, 1180], "iPad portrait 820": [820, 1180], "iPad landscape 1180": [1180, 820], "iPad Pro 1366": [1366, 1024], "desktop 1600": [1600, 1000] };
const PAGES = process.env.SMALL ? ["/", "/tasks", "/goals", "/calendar", "/settings", ...["daily", "health", "financial", "framework", "progressive"].flatMap((m) => [`/m/${m}`, `/m/${m}?tab=tasks`, `/m/${m}?tab=goals`, `/m/${m}?tab=habits`]), "/m/progressive?tab=progress", "/m/progressive?tab=procurement", "/m/progressive?tab=tasks&group=type", ...["overview", "transactions", "bills", "accounts", "budgets", "reports"].map((t) => `/m/financial?tab=${t}`)] : ["/", "/tasks", "/tasks?module=health&h=this_week", "/goals", "/calendar", "/settings", ...["daily", "health", "financial", "framework", "progressive"].flatMap((m) => [`/m/${m}`, `/m/${m}?tab=tasks`, `/m/${m}?tab=goals`, `/m/${m}?tab=habits`, `/m/${m}?tab=calendar`, `/m/${m}?tab=briefing`, `/m/${m}?tab=metrics`]), "/m/progressive?tab=progress", "/m/progressive?tab=procurement", "/m/progressive?tab=tasks&group=type", ...["overview", "transactions", "bills", "accounts", "budgets", "reports"].map((t) => `/m/financial?tab=${t}`)];
const BASE = process.env.BASE || "http://localhost:8788", TAG = process.env.TAG || "populated";
(async () => {
  const b = await chromium.launch(); const issues = []; let pages = 0;
  for (const [sn, [w, h]] of Object.entries(SIZES)) for (const scheme of (process.env.SCHEMES ? process.env.SCHEMES.split(",") : ["dark"])) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: w < 768 }); const pg = await ctx.newPage();
    pg.on("pageerror", (e) => issues.push(`${sn} pageerror ${e.message}`)); pg.on("console", (m) => m.type() === "error" && issues.push(`${sn} console ${m.text().slice(0, 100)}`));
    for (const p of PAGES) {
      await pg.goto(BASE + p, { waitUntil: "networkidle" }); await pg.waitForTimeout(120); pages++;
      const r = await pg.evaluate(() => {
        const o = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const clipped = [...document.querySelectorAll("main button, main a, main select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && e.offsetParent !== null && !e.closest(".no-scrollbar, [role=listbox], [role=tablist]") && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 2).map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24));
        const wrap = Math.max(0, ...[...document.querySelectorAll("main .line-clamp-2")].map((e) => Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || 20))));
        const dock = document.querySelector("nav[aria-label=Primary].fixed"); let hidden = 0;
        if (dock && dock.getBoundingClientRect().height) { window.scrollTo(0, document.body.scrollHeight); const top = dock.getBoundingClientRect().top; const last = document.querySelector("main").lastElementChild; hidden = last ? Math.max(0, Math.round(last.getBoundingClientRect().bottom - top)) : 0; window.scrollTo(0, 0); }
        const small = innerWidth < 768 ? [...document.querySelectorAll("a[href], button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null && !e.closest(".no-scrollbar") && !e.closest("[aria-hidden=true]") && (r.width < 43.5 || r.height < 43.5); }).slice(0, 2).map((e) => `${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`) : [];
        return { o, clipped, wrap, hidden, small };
      });
      const tag = `${sn}/${scheme} ${p}`;
      if (r.o > 0) issues.push(`${tag}: horizontal overflow ${r.o}px`); if (r.clipped.length) issues.push(`${tag}: clipped ${r.clipped.join("|")}`); if (r.wrap > 2) issues.push(`${tag}: ${r.wrap}-line title`); if (r.hidden > 0) issues.push(`${tag}: ${r.hidden}px behind dock`); if (r.small.length) issues.push(`${tag}: small targets ${r.small.join("|")}`);
    }
    await ctx.close();
  }
  console.log(`[${TAG}] ${pages} page loads`); console.log(issues.join("\n") || "no issues"); await b.close();
})();
