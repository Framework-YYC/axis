// Motion check: the shared selection bubble (dock and rail), tab bars, completion animation, reduced motion and resize behaviour.
//   PLAYWRIGHT_PATH=/path/to/node_modules/playwright BASE=http://localhost:8788 node scripts/motion-check.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://localhost:8788";
let fails = 0; const ok = (c, m, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${x ? "  " + x : ""}`); if (!c) fails++; };
const bubbleBox = (pg, sel) => pg.evaluate((s) => { const host = document.querySelector(s); const b = host.querySelector(":scope > span[aria-hidden]"); const r = b.getBoundingClientRect(), h = host.getBoundingClientRect(); return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height, op: getComputedStyle(b).opacity }; }, sel);
const itemBox = (pg, sel, key) => pg.evaluate(([s, k]) => { const host = document.querySelector(s); const i = host.querySelector(`[data-ikey="${k}"]`); const r = i.getBoundingClientRect(), h = host.getBoundingClientRect(); return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }; }, [sel, key]);
const near = (a, b, e = 2) => Math.abs(a.x - b.x) <= e && Math.abs(a.y - b.y) <= e && Math.abs(a.w - b.w) <= e && Math.abs(a.h - b.h) <= e;
(async () => {
  const b = await chromium.launch();
  // ---- phone dock
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); let pg = await ctx.newPage();
  await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.waitForTimeout(500);
  const DOCK = "nav[aria-label=Primary].fixed ul";
  ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/")), "dock: bubble starts on Home");
  await pg.locator(`${DOCK} a[data-ikey="/m/progressive"]`).click();
  const samples = []; for (let i = 0; i < 14; i++) { samples.push(await bubbleBox(pg, DOCK)); await pg.waitForTimeout(30); }
  const final = await itemBox(pg, DOCK, "/m/progressive"); await pg.waitForTimeout(500);
  const widths = samples.map((s) => s.w), xs = samples.map((s) => s.x);
  ok(Math.max(...widths) > final.w * 1.3 && Math.max(...widths) < final.w * 4, "dock: the bubble stretches modestly while travelling", `max width ${Math.round(Math.max(...widths))} vs ${Math.round(final.w)}`);
  ok(new Set(xs.map((x) => Math.round(x))).size > 4, "dock: the bubble moves through intermediate positions (a glide, not a jump)");
  ok(near(await bubbleBox(pg, DOCK), final), "dock: the bubble settles exactly on Work");
  // rapid navigation: click four destinations quickly, end must be the last one
  for (const k of ["/m/health", "/m/daily", "/m/financial", "/m/framework"]) { await pg.locator(`${DOCK} a[data-ikey="${k}"]`).click(); await pg.waitForTimeout(60); }
  await pg.waitForTimeout(700); ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/m/framework")), "dock: rapid navigation ends on the last destination");
  // back / forward
  await pg.goBack(); await pg.waitForTimeout(700); ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/m/financial")), "dock: browser Back moves the bubble");
  await pg.goForward(); await pg.waitForTimeout(700); ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/m/framework")), "dock: browser Forward moves the bubble");
  // direct navigation by URL
  await pg.goto(BASE + "/m/health", { waitUntil: "networkidle" }); await pg.waitForTimeout(500); ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/m/health")), "dock: direct URL load places the bubble on Health");
  // resize / orientation
  await pg.setViewportSize({ width: 844, height: 390 }); await pg.waitForTimeout(500); await pg.setViewportSize({ width: 360, height: 780 }); await pg.waitForTimeout(500);
  ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/m/health")), "dock: still correctly positioned after resize and rotation");
  await ctx.close();
  // ---- rail (vertical)
  ctx = await b.newContext({ viewport: { width: 1180, height: 820 } }); pg = await ctx.newPage();
  await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.waitForTimeout(500);
  const RAIL = "aside[aria-label=Primary] > div.glass";
  await pg.locator(`${RAIL} a[data-ikey="/m/financial"]`).click(); await pg.waitForTimeout(100); const mid = await bubbleBox(pg, RAIL); const fin = await itemBox(pg, RAIL, "/m/financial"); await pg.waitForTimeout(600);
  ok(mid.h > fin.h || mid.y !== fin.y, "rail: the bubble travels vertically", `${Math.round(mid.y)} -> ${Math.round(fin.y)}`);
  ok(near(await bubbleBox(pg, RAIL), fin), "rail: settles on Finance");
  await pg.locator(`${RAIL} a[data-ikey="/settings"]`).click(); await pg.waitForTimeout(700); ok(near(await bubbleBox(pg, RAIL), await itemBox(pg, RAIL, "/settings")), "rail: utility destination (Settings) selected correctly");
  // tabs
  await pg.goto(BASE + "/m/daily", { waitUntil: "networkidle" }); await pg.waitForTimeout(500);
  const TABS = "[role=tablist][aria-label=Sections]";
  await pg.locator(`${TABS} [data-ikey="goals"]`).click(); await pg.waitForTimeout(700); ok(near(await bubbleBox(pg, TABS), await itemBox(pg, TABS, "goals")), "tabs: the shared indicator follows the selected tab");
  await ctx.close();
  // ---- completion animation
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); pg = await ctx.newPage();
  await pg.goto(BASE + "/tasks", { waitUntil: "networkidle" }); await pg.waitForTimeout(400);
  const first = pg.locator("main ul li:not(:has([aria-label=Repeats]))").first(); const name = await first.locator("button[aria-label^='Open']").getAttribute("aria-label");
  await first.locator("button[aria-label^='Mark']").click(); await pg.waitForTimeout(260);
  ok((await first.getAttribute("class")).includes("row-leave"), "completion: the row eases out instead of vanishing");
  ok((await pg.locator("main ul li").first().locator(".check-in").count()) >= 0, "completion: check mark animation class applied");
  await pg.waitForTimeout(900); ok((await pg.locator(`main button[aria-label="${name}"]`).count()) === 0, "completion: the task leaves the open list after the animation");
  await ctx.close();
  // ---- sheets and menus anchor to the screen, not to an animated ancestor
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); pg = await ctx.newPage();
  for (const path of ["/m/health", "/goals", "/tasks"]) {
    await pg.goto(BASE + path, { waitUntil: "networkidle" }); await pg.getByRole("button", { name: "Settings and account" }).first().click(); await pg.waitForTimeout(500);
    const box = await pg.evaluate(() => { const r = document.querySelector("[role=dialog] .glass-sheet").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    ok(box.top >= 0 && box.bottom <= box.vh + 1, `sheet anchors to the viewport on ${path}`, `${Math.round(box.top)}..${Math.round(box.bottom)} of ${box.vh}`); await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
    ok((await pg.locator("[role=dialog]").count()) === 0, `sheet closes (animated) on ${path}`);
  }
  await ctx.close();
  // ---- reduced motion
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce" }); pg = await ctx.newPage();
  await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.waitForTimeout(400);
  await pg.locator(`${DOCK} a[data-ikey="/m/health"]`).click(); await pg.waitForTimeout(60);
  ok(near(await bubbleBox(pg, DOCK), await itemBox(pg, DOCK, "/m/health")), "reduced motion: the bubble jumps straight to the destination (no travel)");
  await pg.goto(BASE + "/tasks", { waitUntil: "networkidle" }); const row = pg.locator("main ul li:not(:has([aria-label=Repeats]))").first(); const nm = await row.locator("button[aria-label^='Open']").getAttribute("aria-label");
  await row.locator("button[aria-label^='Mark']").click(); await pg.waitForTimeout(150); ok((await pg.locator(`main button[aria-label="${nm}"]`).count()) === 0, "reduced motion: completion applies immediately");
  await ctx.close();
  console.log(fails ? `FAILURES: ${fails}` : "ALL PASSED"); await b.close();
})();
