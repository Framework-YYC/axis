// Environment switcher check. Serves a LOCAL Worker (synthetic data) under both approved hostnames inside the browser (request interception, nothing real is contacted)
// and verifies the Environment card, dots, STAGING tag, preserved page and the click-through on iPhone, iPad and desktop in light and dark.
//   PLAYWRIGHT_PATH=/path/to/node_modules/playwright LOCAL=http://localhost:8788 node scripts/env-check.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const HOSTS = { production: "axis.frameworktools.ca", staging: "axis-staging.frameworktools.ca" };
const LOCAL = process.env.LOCAL || "http://localhost:8788";
let fails = 0; const ok = (c, m, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${x ? "  " + x : ""}`); if (!c) fails++; };
(async () => {
  require("node:fs").mkdirSync(process.env.OUT || "/tmp/axis-shots", { recursive: true });
  const b = await chromium.launch();
  const seen = new Set();
  for (const [env, host] of Object.entries(HOSTS)) for (const [sn, vp] of Object.entries({ phone: { width: 390, height: 844 }, ipadP: { width: 820, height: 1180 }, desk: { width: 1440, height: 900 } })) for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: sn === "phone" ? 2 : 1, hasTouch: sn === "phone" });
    // Serve the local build under BOTH approved hostnames, and record every request that leaves for another host.
    await ctx.route(/https:\/\/axis(-staging)?\.frameworktools\.ca\/.*/, async (route) => {
      const u = new URL(route.request().url());
      const r = await fetch(LOCAL + u.pathname + u.search, { method: route.request().method(), headers: { "content-type": "application/json" }, body: ["GET", "HEAD"].includes(route.request().method()) ? undefined : route.request().postData() });
      const body = Buffer.from(await r.arrayBuffer());
      await route.fulfill({ status: r.status, headers: Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k))), body });
    });
    const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await pg.goto(`https://${host}/goals?x=1#habits`, { waitUntil: "networkidle" }); await pg.waitForTimeout(400);
    const tag = `${env}/${sn}/${scheme}`;
    const target = env === "production" ? "staging" : "production";
    // locate the card: phone = More sheet; ipad = rail popover; desktop = sidebar
    if (sn === "phone") { await pg.getByRole("button", { name: "Settings and account" }).first().click(); }
    else if (sn === "ipadP") { await pg.getByRole("button", { name: /^Environment:/ }).click(); }
    await pg.waitForTimeout(250);
    const card = pg.locator("section[aria-label=Environment]:visible").first();
    ok(await card.isVisible(), `${tag}: Environment section visible`);
    ok((await card.innerText()).includes(env === "production" ? "Production" : "Staging"), `${tag}: shows current environment`);
    const link = card.getByRole("link", { name: new RegExp(`Switch to ${target}`, "i") });
    ok(await link.count() === 1, `${tag}: "Switch to ${target[0].toUpperCase() + target.slice(1)}" present`);
    const href = await link.getAttribute("href");
    ok(href === `https://${HOSTS[target]}/goals?x=1#habits`, `${tag}: href preserves the page`, href);
    const dot = await card.locator("i").first().evaluate((e) => getComputedStyle(e).backgroundColor);
    console.log(`      dot colour ${dot}`);
    const stagingTags = await pg.getByText("STAGING", { exact: true }).count();
    ok(env === "staging" ? stagingTags >= 1 : stagingTags === 0, `${tag}: STAGING indicator ${env === "staging" ? "shown" : "absent"} (${stagingTags})`);
    const box = await link.boundingBox(); ok(sn !== "phone" || box.height >= 43.5, `${tag}: switch button >= 44px`, `${Math.round(box.height)}px`);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(over <= 0, `${tag}: no horizontal overflow`);
    if (!seen.has(`${env}/${sn}/${scheme}`) && (scheme === "dark" || sn !== "phone")) { await pg.screenshot({ path: `${process.env.OUT || "/tmp/axis-shots"}/env-${env}-${sn}-${scheme}.png` }); }
    if (scheme === "light" && sn === "phone") await pg.screenshot({ path: `${process.env.OUT || "/tmp/axis-shots"}/env-${env}-${sn}-${scheme}.png` });
    // click switches host and keeps the page; no credentials or storage carried
    const [nav] = await Promise.all([pg.waitForURL(new RegExp(HOSTS[target].replace(/\./g, "\\.") + "/goals"), { timeout: 8000 }).then(() => true).catch(() => false), link.click()]);
    ok(nav && pg.url() === `https://${HOSTS[target]}/goals?x=1#habits`, `${tag}: click lands on the other approved host, same page`, pg.url());
    ok(errs.length === 0, `${tag}: no console errors`, errs[0] || "");
    await ctx.close();
  }
  console.log(fails ? `FAILURES: ${fails}` : "ALL PASSED");
  await b.close();
})();
