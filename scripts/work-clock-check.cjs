// Time clock, shopping and layout checks on Work Overview. PLAYWRIGHT_PATH=... BASE=http://localhost:8790 OUT=/tmp/clock node scripts/work-clock-check.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || "/tmp/clock-shots";
require("node:fs").mkdirSync(OUT, { recursive: true });
const out = []; const ok = (n, c, d = "") => out.push(`${c ? "PASS" : "FAIL"} ${n}${d ? " (" + d + ")" : ""}`);
const SIZES = { se: [320, 568], iphone: [390, 844], "ipad-portrait": [820, 1180], "ipad-landscape": [1180, 820], desktop: [1440, 900] };
(async () => {
  const b = await chromium.launch();
  // ---- behaviour on iPhone, dark
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true, deviceScaleFactor: 2 }); const pg = await ctx.newPage();
  const errors = []; pg.on("pageerror", (e) => errors.push(e.message)); pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 100)));
  const entries = async () => (await (await ctx.request.get(`${BASE}/api/v1/timeclock?today=2026-11-25`)).json()).data;
  const live = async () => (await entries()).entries.filter((e) => e.endAt === null).length;
  await pg.goto(`${BASE}/m/progressive`, { waitUntil: "networkidle" }); await pg.waitForTimeout(700);
  const card = pg.locator('section[aria-label^="Time clock"]');
  await card.getByRole("button", { name: /REEF — 928/ }).waitFor({ timeout: 8000 });
  ok("time clock card is on Work Overview", await card.count() === 1);
  ok("jobs REEF — 928 and RIPET — 1011 are offered", await card.getByRole("button", { name: /REEF — 928/ }).count() === 1 && await card.getByRole("button", { name: /RIPET — 1011/ }).count() === 1);
  const before = (await entries()).entries.length;
  await card.getByRole("button", { name: /REEF — 928/ }).click(); await pg.waitForTimeout(900);
  ok("tapping REEF starts the shift immediately", /On shift/.test(await card.innerText()) && await card.getByRole("button", { name: /REEF — 928/ }).getAttribute("aria-pressed") === "true");
  const t1 = await pg.locator("p.num").first().innerText(); await pg.waitForTimeout(2200); const t2 = await pg.locator("p.num").first().innerText();
  ok("elapsed time ticks", t1 !== t2, `${t1} -> ${t2}`);
  await card.getByRole("button", { name: /RIPET — 1011/ }).click(); await pg.waitForTimeout(900);
  let d = await entries(); const [a1, a2] = d.entries.slice(-2);
  ok("switching stops REEF and starts RIPET at the same instant", a1.endAt === a2.startAt && a2.endAt === null && a2.jobId === "tjob_ripet" && await live() === 1);
  await card.getByRole("button", { name: /RIPET — 1011/ }).click(); await pg.waitForTimeout(700);
  ok("tapping the running job again creates no duplicate", (await entries()).entries.length === d.entries.length && /Already on this job/.test(await card.innerText()));
  await card.getByRole("button", { name: "Break" }).click(); await pg.waitForTimeout(800);
  ok("Break shows On break and Resume", /On break/.test(await card.innerText()) && await card.getByRole("button", { name: "Resume" }).count() === 1);
  await card.getByRole("button", { name: "Resume" }).click(); await pg.waitForTimeout(800);
  ok("Resume returns to RIPET", (await entries()).open.jobId === "tjob_ripet");
  // failed save is shown, kept, and retried without duplicating
  await pg.route("**/api/v1/timeclock/punch", (r) => r.abort());
  const n0 = (await entries()).entries.length;
  await card.getByRole("button", { name: /REEF — 928/ }).click(); await pg.waitForTimeout(800);
  ok("a failed save is clearly indicated", await pg.getByRole("alert").filter({ hasText: "Not saved" }).count() === 1);
  await pg.screenshot({ path: `${OUT}/iphone-dark-failed-save.png` });
  await pg.reload({ waitUntil: "networkidle" }); await pg.waitForTimeout(500);
  ok("the failed punch survives a reload", await pg.getByRole("alert").filter({ hasText: "Not saved" }).count() === 1);
  await pg.unroute("**/api/v1/timeclock/punch");
  await pg.getByRole("button", { name: /Retry/ }).click(); await pg.waitForTimeout(900);
  d = await entries(); ok("retry saves it once", d.entries.length === n0 + 1 && d.open.jobId === "tjob_reef" && await live() === 1);
  await pg.screenshot({ path: `${OUT}/iphone-dark-clock.png`, fullPage: false });
  // history editing
  await card.getByRole("button", { name: /History/ }).click(); await pg.waitForTimeout(600);
  ok("history lists today's punches", await pg.getByRole("dialog", { name: "Time clock" }).locator("ul li button").count() >= 3);
  await pg.screenshot({ path: `${OUT}/iphone-dark-history.png` });
  await pg.getByRole("dialog", { name: "Time clock" }).locator("ul li button").first().click(); await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${OUT}/iphone-dark-edit.png` });
  await pg.getByRole("dialog", { name: "Edit punch" }).getByRole("button", { name: "Cancel" }).click(); await pg.waitForTimeout(400);
  await pg.getByRole("tab", { name: "Weekly totals" }).click(); await pg.waitForTimeout(400);
  ok("weekly totals show a week total", /Week/.test(await pg.getByRole("dialog", { name: "Time clock" }).innerText()));
  await pg.screenshot({ path: `${OUT}/iphone-dark-week.png` });
  await pg.getByRole("tab", { name: "Jobs" }).click(); await pg.waitForTimeout(300);
  ok("jobs are configurable", await pg.getByLabel("Job number").first().inputValue() === "928");
  await pg.screenshot({ path: `${OUT}/iphone-dark-jobs.png` });
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
  // end shift needs a confirmation
  await card.getByRole("button", { name: "End shift" }).click(); await pg.waitForTimeout(300);
  ok("End shift asks first", await live() === 1 && await card.getByRole("button", { name: "End shift now" }).count() === 1);
  await card.getByRole("button", { name: "End shift now" }).click(); await pg.waitForTimeout(800);
  ok("End shift stops the clock", await live() === 0 && /Off shift/.test(await card.innerText()));
  // shopping
  const shop = pg.locator('section[aria-label^="Shopping"]').first();
  ok("shopping card is on Work Overview", await shop.count() === 1);
  await pg.screenshot({ path: `${OUT}/iphone-dark-overview.png`, fullPage: true });
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  // ---- layout across sizes and themes
  for (const [name, [w, h]] of Object.entries(SIZES)) for (const scheme of ["dark", "light"]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, hasTouch: w < 768 }); const p = await c.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`${BASE}/m/progressive`, { waitUntil: "networkidle" }); await p.waitForTimeout(600);
    const r = await p.evaluate(() => ({ o: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: innerWidth < 768 ? [...document.querySelectorAll("main a[href], main button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest(".no-scrollbar"); }).map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)) : [], rail: !!document.querySelector('aside[aria-label="Primary"] a[aria-label="Orbis home"]') }));
    ok(`${name}/${scheme}: no overflow, no small targets, no errors`, r.o <= 0 && r.small.length === 0 && errs.length === 0, `${r.o} ${r.small.join("|")} ${errs.join("|")}`);
    if (w >= 768) ok(`${name}/${scheme}: no top-left Orbis logo link in the rail`, !r.rail);
    if (scheme === "dark" || name === "desktop") await p.screenshot({ path: `${OUT}/${name}-${scheme}-overview.png`, fullPage: name === "iphone" });
    await c.close();
  }
  await b.close(); console.log(out.join("\n"));
})();
