// Page transition checks: cascade classes and delays on navigation, nothing replays on a data refresh, chrome stays still, gauges sweep, reduced motion, glass alpha.
// PLAYWRIGHT_PATH=... BASE=http://localhost:8790 node scripts/page-motion-check.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://localhost:8790"; const out = []; const ok = (n, c, d = "") => out.push(`${c ? "PASS" : "FAIL"} ${n}${d ? " (" + d + ")" : ""}`);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: "dark" }); const pg = await ctx.newPage();
  await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.waitForTimeout(1600);
  // navigate with the dock (client side), sample immediately
  await pg.getByRole("link", { name: process.env.MOD || "Work", exact: true }).click();
  await pg.waitForSelector(".cascade", { timeout: 2000 });
  const s = await pg.evaluate(() => { const els = [...document.querySelectorAll("main .cascade")]; return { n: els.length, delays: els.map((e) => getComputedStyle(e).animationDelay), dur: getComputedStyle(els[0]).animationDuration, names: [...new Set(els.map((e) => getComputedStyle(e).animationName))], chrome: [...document.querySelectorAll("nav[aria-label=Primary], nav[aria-label=Primary] *")].flatMap((e) => e.getAnimations()).filter((a) => a.animationName === "card-in" || a.animationName === "page-in").length }; });
  const ds = s.delays.map((d) => parseFloat(d) * 1000);
  ok("cards cascade after navigating to the module", s.n >= 6, `${s.n} elements`);
  ok("delays step by about 80 ms", ds[1] - ds[0] === 80 && ds[2] - ds[1] === 80, ds.slice(0, 5).join(","));
  ok("each rise lasts about 460 ms", /0\.46s/.test(s.dur), s.dur);
  ok("the dock does not animate during the page transition", s.chrome === 0);
  ok("the page uses the card-in rise", s.names.includes("card-in"));
  // tab change replays inside the module
  await pg.getByRole("tab", { name: process.env.TAB || "Progress" }).click(); await pg.waitForTimeout(80);
  ok("internal tab change cascades too", await pg.evaluate(() => document.querySelectorAll("main .cascade").length) >= 1);
  await pg.waitForTimeout(1500);
  // a data refresh must not replay entrance
  const before = await pg.evaluate(() => document.getAnimations().filter((a) => ["card-in", "page-in", "tab-in"].includes(a.animationName)).length);
  await pg.evaluate(() => dispatchEvent(new Event("focus"))); await pg.waitForTimeout(900);
  const after = await pg.evaluate(() => document.getAnimations().filter((a) => ["card-in", "page-in", "tab-in"].includes(a.animationName)).length);
  ok("a data refresh replays nothing", before === 0 && after === 0, `${before}/${after}`);
  // gauges sweep in on entering a page
  await pg.getByRole("link", { name: "Home", exact: true }).click(); await pg.waitForTimeout(150);
  const g1 = await pg.evaluate(() => [...document.querySelectorAll("main svg[role=img] path, main svg[role=img] line")].map((e) => e.getAttribute("d") || e.getAttribute("x2") || "").join("|"));
  await pg.waitForTimeout(1500);
  const g2 = await pg.evaluate(() => [...document.querySelectorAll("main svg[role=img] path, main svg[role=img] line")].map((e) => e.getAttribute("d") || e.getAttribute("x2") || "").join("|"));
  ok("gauges animate to their value after the page enters", g1 !== g2, `${g1.length} chars changed: ${g1 !== g2}`);
  // glass translucency
  const alpha = await pg.evaluate(() => { const c = getComputedStyle(document.querySelector("nav[aria-label=Primary] ul")).backgroundColor; return c; });
  const a = parseFloat((alpha.match(/[\d.]+\)$/) || ["1)"])[0]); ok("the dock glass is clearly translucent", a <= 0.4, alpha);
  ok("backdrop blur is on", (await pg.evaluate(() => getComputedStyle(document.querySelector("nav[aria-label=Primary] ul")).backdropFilter)).includes("blur"));
  // reduced motion
  const rctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }); const rp = await rctx.newPage();
  await rp.goto(BASE + "/m/progressive", { waitUntil: "networkidle" });
  ok("reduced motion: no cascade", await rp.evaluate(() => document.querySelectorAll(".cascade").length) === 0);
  console.log(out.join("\n")); await b.close();
})();
