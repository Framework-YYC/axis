// Navigation, Home widgets, module tabs and task-filter check against a local Worker with synthetic data.
//   PLAYWRIGHT_PATH=/path/to/node_modules/playwright node scripts/nav-check.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
let fails = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true }); const pg = await ctx.newPage();
  await pg.goto((process.env.BASE || "http://localhost:8788") + "/", { waitUntil: "networkidle" });
  const dock = pg.locator("nav[aria-label=Primary].fixed a"); ok((await dock.count()) === 6, "dock has six destinations");
  ok((await dock.allInnerTexts()).map((t) => t.trim()).join("|") === "Home|Daily|Health|Finance|Framework|Work", "dock labels: Home, Daily, Health, Finance, Framework, Work");
  for (const t of ["Daily completion", "Weekly workload", "Task activity", "Tasks", "Goals"]) ok(await pg.locator("main").getByText(t, { exact: true }).first().isVisible(), `Home shows ${t}`);
  ok((await pg.locator("main section, main a.hit").count()) >= 5 && (await pg.getByText("Up next").count()) === 0, "Home has no Up next / launcher");
  await pg.getByRole("link", { name: /^Tasks:/ }).click(); await pg.waitForURL(/\/tasks/); ok(pg.url().endsWith("/tasks"), "Tasks widget opens the unified Tasks screen (all modules)");
  await pg.waitForLoadState("networkidle"); ok((await pg.locator("label:has-text('Module') span[aria-hidden]").first().innerText()).trim() === "All modules", "Tasks defaults to All modules");
  await pg.goto((process.env.BASE || "http://localhost:8788") + "/m/health?tab=tasks", { waitUntil: "networkidle" }); ok((await pg.locator("label:has-text('Module') span[aria-hidden]").first().innerText()).trim() === "Health", "Module Tasks tab starts filtered to Health");
  const rows = async () => (await pg.locator("main ul li").count());
  const before = await rows(); await pg.locator("select").nth(1).selectOption("today"); await pg.waitForTimeout(300); const today = await rows();
  ok(today <= before, `module + horizon filters combine (${before} -> ${today})`);
  await pg.getByRole("button", { name: /^Filters/ }).click(); ok(await pg.getByRole("dialog", { name: "Filters" }).isVisible(), "secondary filter menu opens (priority, status, project)"); await pg.keyboard.press("Escape");
  await pg.goto((process.env.BASE || "http://localhost:8788") + "/goals", { waitUntil: "networkidle" }); ok((await pg.getByText("Goals", { exact: true }).count()) > 0, "Goals widget target opens the Goals screen");
  for (const [name, path] of [["Daily", "/m/daily"], ["Finance", "/m/financial"], ["Work", "/m/progressive"], ["Framework", "/m/framework"], ["Health", "/m/health"]]) { await pg.goto((process.env.BASE || "http://localhost:8788") + "/", { waitUntil: "networkidle" }); await pg.locator("nav[aria-label=Primary].fixed").getByRole("link", { name, exact: true }).click(); await pg.waitForURL("**" + path); ok(pg.url().includes(path), `dock ${name} opens ${path}`); }
  const tabs = async (p) => (await pg.goto((process.env.BASE || "http://localhost:8788") + "" + p, { waitUntil: "networkidle" }), (await pg.locator("[role=tab]").allInnerTexts()).map((t) => t.replace(/\d+/g, "").trim()).join(","));
  ok((await tabs("/m/daily")) === "Overview,Tasks,Goals,Calendar", "Daily tabs: Overview, Tasks, Goals, Calendar");
  ok((await tabs("/m/health")) === "Overview,Tasks,Goals,Habits", "Health tabs: Overview, Tasks, Goals, Habits");
  ok((await tabs("/m/financial")) === "Overview,Tasks,Goals", "Finance tabs: Overview, Tasks, Goals");
  ok((await tabs("/m/framework")) === "Overview,Tasks,Goals", "Framework tabs: Overview, Tasks, Goals");
  ok((await tabs("/m/progressive")) === "Overview,Tasks,Goals,Habits", "Work tabs: Overview, Tasks, Goals, Habits");
  await pg.getByRole("button", { name: "Settings and account" }).first().click(); ok(await pg.getByRole("dialog").getByText("Environment").first().isVisible(), "header menu shows the Environment section");
  console.log(fails ? `FAILURES: ${fails}` : "ALL PASSED"); await b.close();
})();
