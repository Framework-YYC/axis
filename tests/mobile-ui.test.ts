import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_TABS, DESTINATION_ORDER, MODULE_IDS, MODULES_META, PRIMARY_TABS } from "../shared/modules";

const read = (p: string) => readFileSync(p, "utf8");

/** Source-level guards for the design system and navigation. The rendered checks (overflow, touch targets, dock overlap) are in scripts/ui-check.cjs. */
describe("module-first navigation", () => {
  it("six permanent destinations: Home and the five modules, with display labels only (ids are unchanged)", () => {
    expect(DESTINATION_ORDER).toEqual(["home", "daily", "health", "financial", "framework", "progressive"]);
    expect(MODULE_IDS).toEqual(["daily", "health", "financial", "framework", "progressive"]);
    expect(MODULES_META.financial.label).toBe("Finance"); expect(MODULES_META.progressive.label).toBe("Work");
    expect(MODULES_META.financial.assistant).toBe("Financial"); expect(MODULES_META.progressive.assistant).toBe("Progressive"); // assistant identities untouched
    const nav = read("src/components/nav.tsx");
    expect(nav).toContain("DESTINATIONS: Module[] = [HOME, ...MODULE_IDS.map(moduleNav)]");
    for (const gone of ["Assistants", "More"]) expect(read("src/components/Shell.tsx")).not.toMatch(new RegExp(`label="${gone}"`));
  });
  it("each module's contextual tabs match the plan and only name screens that exist", () => {
    expect(PRIMARY_TABS).toEqual({ daily: ["overview", "tasks", "goals", "calendar"], health: ["overview", "tasks", "goals", "habits"], financial: ["overview", "tasks", "goals"], framework: ["overview", "tasks", "goals"], progressive: ["overview", "tasks", "recurring", "actions"] });
    for (const tabs of Object.values(PRIMARY_TABS)) for (const t of tabs) expect(ALL_TABS).toContain(t);
    const page = read("src/pages/ModulePage.tsx");
    for (const t of ALL_TABS) expect(page, `module page renders the ${t} tab`).toContain(`tab === "${t}"`);
    expect(page).toContain("<TasksView module={id} embedded />"); // module tasks come from the one task system, pre-filtered
    expect(page).toContain("<Calendar module={id} />");
  });
  it("the dock is persistent, floating, safe-area aware, six items, icon-only on very narrow phones", () => {
    const shell = read("src/components/Shell.tsx");
    expect(shell).toContain('grid grid-cols-6');
    expect(shell).toContain("fixed inset-x-2.5 bottom-2.5");
    expect(shell).toContain("max-[359px]:sr-only");
    expect(shell).toContain("h-[52px]"); // >= 44 px targets
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(read("src/styles/index.css")).toMatch(/@media \(max-width: 767px\) \{ \.btn \{ min-height: 44px; \} \}/);
  });
  it("settings and the environment switcher stay reachable from every device", () => {
    const shell = read("src/components/Shell.tsx");
    expect(shell).toContain("<EnvCard compact />"); // desktop sidebar
    expect(shell).toContain("<EnvRailButton />"); // iPad rail
    expect(shell).toContain("<StagingTag />");
    expect(shell).toMatch(/sticky top-4 z-30/);
    expect(read("src/components/AccountMenu.tsx")).toContain("<EnvCard />"); // phone: header menu
    expect(read("src/pages/Settings.tsx")).toContain("<EnvCard />");
    expect(read("src/components/ui.tsx")).toContain("<AccountMenuButton"); // on every module page header
    expect(read("src/pages/Dashboard.tsx")).toContain("<AccountMenuButton />");
    const env = read("src/components/EnvSwitch.tsx");
    expect(env).toContain("switchUrl(");
    expect(env).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(|XMLHttpRequest|Authorization|token/i);
    expect(env).toContain('rel="noopener noreferrer"');
  });
});

describe("Home: five widgets on phones, a bento grid on wider content areas", () => {
  const home = read("src/pages/Dashboard.tsx");
  it("keeps the five core widgets and links Tasks and Goals to their screens", () => {
    for (const label of ["Daily completion", "Weekly workload", "Task activity", 'label="Tasks"', 'label="Goals"']) expect(home).toContain(label);
    expect(home).toContain('to="/tasks"'); expect(home).toContain('to="/goals"');
  });
  it("adds Today's priorities, Daily habits, Modules and Upcoming schedule only when the content area is wide, via container queries", () => {
    for (const label of ["Today's priorities", "Daily habits", 'label="Modules"', "Upcoming schedule"]) expect(home).toContain(label);
    expect(home.match(/@max-\[639px\]:hidden/g)?.length).toBe(4); // exactly the four extra widgets are hidden on narrow containers
    expect(home).toContain('@container mt-3.5'); expect(home).toContain("@[640px]:grid-cols-12"); expect(home).toContain("@[1000px]:col-span-3");
    expect(home).not.toMatch(/\bmd:grid-cols|\bxl:grid-cols|\blg:grid-cols/); // layout follows the content width, not the viewport
  });
  it("never nests controls inside a link: list widgets use a header link", () => {
    expect(home).toContain("headTo=");
    expect(home).not.toMatch(/onClick=\{\(e\) => e\.preventDefault\(\)\}/);
  });
  it("draws only from live data: no invented numbers", () => {
    expect(home).not.toMatch(/Math\.random|const (demo|sample)|\(synthetic\)/i);
    for (const call of ["focusStats(tasks, today)", "weekBars(tasks, today, 7)", "activityBars(tasks, period, today, weekStart)", "events.filter", "habits.filter"]) expect(home).toContain(call);
  });
  it("lets the activity chart switch reporting periods and states what it measures", () => {
    expect(home).toContain("ACTIVITY_PERIODS.map"); expect(home).toContain("Tasks completed per day");
  });
});

describe("shell, header and layout rules", () => {
  it("the secondary sidebar starts with search; the redundant Axis block and its dead chevrons are gone", () => {
    const shell = read("src/components/Shell.tsx");
    const side = shell.slice(shell.indexOf("function SecondaryPanel"), shell.indexOf("function Dock") > 0 ? shell.indexOf("/** The persistent floating dock") : undefined);
    expect(side).not.toMatch(/By Framework|ChevronsUpDown/);
    expect(side.indexOf('role="search"')).toBeGreaterThan(-1); expect(side.indexOf('role="search"')).toBeLessThan(side.indexOf("<nav"));
    expect(shell).toContain("<LogoMark size={36} />"); // the logo stays in the rail
  });
  it("one creation control per page header, adapting to the header's own width", () => {
    const ui = read("src/components/ui.tsx");
    expect(ui).toContain("@container mb-4"); expect(ui).toContain("@[560px]:not-sr-only");
    expect(ui).not.toContain('lg:hidden"><HeaderActions'); // no second, duplicated instance
    expect(read("src/pages/ModulePage.tsx")).not.toMatch(/>Task<\/Btn>/); expect(read("src/components/TasksView.tsx")).not.toContain("New task");
  });
  it("goals and habits are compact rows that follow the content width and open details in a sheet", () => {
    const c = read("src/components/compact.tsx");
    expect(c).toContain("@[640px]:grid-cols-2"); expect(c).toContain("@[700px]:grid-cols-2");
    expect(c).not.toMatch(/hidden gap-3 md:grid|lg:grid-cols-2/);
    expect(read("src/pages/ModulePage.tsx")).toContain('className="@container"');
  });
});

describe("glass and motion", () => {
  const css = read("src/styles/index.css");
  it("glass is translucent with blur, an edge highlight and fallbacks; cards stay solid", () => {
    expect(css).toMatch(/\.glass \{[^}]*backdrop-filter: blur/); expect(css).toContain("-webkit-backdrop-filter");
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px))"); expect(css).toContain("prefers-reduced-transparency");
    expect(css).toMatch(/\.panel \{ background: var\(--card-a\)/); // dashboard cards: solid
    const shell = read("src/components/Shell.tsx");
    expect(shell).toContain('className="glass relative grid grid-cols-6'); expect(shell).toContain('glass relative flex flex-col items-center'); // dock and rail
    expect(read("src/components/forms.tsx")).toContain("glass-sheet"); expect(read("src/components/ModuleTabs.tsx")).toContain("glass pop-in");
  });
  it("one shared indicator drives the dock, rail, module tabs and segmented controls", () => {
    for (const f of ["src/components/Shell.tsx", "src/components/ModuleTabs.tsx", "src/components/ui.tsx"]) expect(read(f)).toContain("useSlidingIndicator");
    expect(read("src/components/Shell.tsx").match(/useSlidingIndicator</g)?.length).toBe(2);
    const m = read("src/lib/motion.tsx");
    expect(m).toContain("prefersReducedMotion"); expect(m).toContain("stretchFrames"); expect(m).toContain("ResizeObserver"); expect(m).toContain("orientationchange");
  });
  it("motion is restrained: 160-340 ms, transform and opacity, reduced motion honoured, no entrance replay on data refresh", () => {
    expect(css).toMatch(/--dur-fast: 160ms/); expect(css).toMatch(/--dur-base: 240ms/); expect(css).toMatch(/--dur-slow: 340ms/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: 0\.01ms/);
    const shell = read("src/components/Shell.tsx");
    expect(shell).toContain("key={moduleOf(pathname).to} className=\"page-in\""); // page transition keyed by module, not by data
    expect(read("src/lib/motion.tsx")).toMatch(/first\.current/); // tweens skip the first render
    expect(css).toMatch(/\.page-in \{[^}]*backwards/); expect(css).toMatch(/\.rise \{[^}]*backwards/); // never forwards: a filled transform would trap fixed sheets inside the page
    expect(css).not.toMatch(/^\s*\.collapse \{/m); // would collide with the Tailwind collapse (visibility) utility
    expect(read("src/components/TaskLine.tsx")).toContain("row-leave"); expect(read("src/components/TaskGroups.tsx")).toContain("<Collapse");
  });
});

describe("design system", () => {
  it("uses a locally bundled, lighter neutral typeface and the near-black palette", () => {
    const css = read("src/styles/index.css");
    expect(css).toContain('@import "@fontsource-variable/geist/wght.css"'); expect(css).not.toMatch(/outfit/i);
    expect(css).toContain("--canvas-a: #101112"); expect(css).toContain("--w-blue: #c3d4e6"); expect(css).toContain("--w-butter: #efdfa5"); expect(css).toContain("--w-sage: #d5dfad");
    expect(css).toContain("--lime: #d4fa49"); // brand accent retained
    expect(JSON.parse(read("package.json")).dependencies["@fontsource-variable/geist"]).toBeTruthy();
  });
  it("surfaces are flat: no gradients or glow in the shared component styles", () => {
    const css = read("src/styles/index.css");
    const components = css.slice(css.indexOf("@layer components"), css.indexOf("@keyframes rise"));
    expect(components).not.toMatch(/linear-gradient|radial-gradient/);
    expect(css.match(/--m-[a-z]+:/g)?.length).toBe(10); // five module accents x light and dark
  });
  it("task rows use a compact provenance icon; the detail view keeps the full warning", () => {
    const row = read("src/components/TaskLine.tsx");
    expect(row).toContain("ProvenanceMark"); expect(row).not.toContain("UNVERIFIED SOURCE");
    expect(read("src/components/editors.tsx")).toContain("self-declared and not verified");
  });
  it("the Tasks screen combines module and time filters and keeps secondary filters in a menu", () => {
    const t = read("src/components/TasksView.tsx");
    for (const f of ["Pick label=\"Module\"", "Pick label=\"Time horizon\"", "title=\"Filters\"", "Priority", "Project"]) expect(t).toContain(f);
    expect(t).toContain("isModule(rawModule) ? rawModule : defaultModule"); // opened from a module: that module's filter; from Home: all
  });
});

describe("Orbis brand and the Work command centre", () => {
  it("the PWA identity is Orbis with real icons, a maskable icon and an Apple touch icon", () => {
    const m = JSON.parse(read("public/manifest.webmanifest"));
    expect(m.name).toBe("Orbis"); expect(m.short_name).toBe("Orbis"); expect(m.description).toBe("Your world. One system.");
    expect(m.icons.map((i: { purpose: string }) => i.purpose)).toEqual(["any", "any", "maskable"]);
    const html = read("index.html");
    expect(html).toContain('<title>Orbis</title>'); expect(html).toContain('apple-mobile-web-app-title" content="Orbis"'); expect(html).toContain('rel="apple-touch-icon" sizes="180x180"');
    for (const f of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "favicon.ico", "icon.svg"]) expect(existsSync(`public/${f}`), f).toBe(true);
    expect(statSync("public/apple-touch-icon.png").size).toBeGreaterThan(1000);
  });
  it("no user-facing 'Axis' remains in the app source (infrastructure identifiers are deliberately unchanged)", () => {
    for (const f of ["src/components/Shell.tsx", "src/components/ui.tsx", "src/pages/Settings.tsx", "src/pages/ModulePage.tsx", "index.html", "public/manifest.webmanifest"]) expect(read(f), f).not.toMatch(/\bAxis\b|AXIS \//);
  });
  it("the brand package has the required kinds and colourways", () => {
    const svgs = readdirSync("branding/orbis/svg");
    for (const kind of ["mark", "wordmark", "lockup-horizontal", "lockup-stacked", "icon"]) expect(svgs.some((f) => f.includes(`orbis-${kind}`)), kind).toBe(true);
    for (const cw of ["on-dark", "on-light", "mono-black", "mono-white"]) expect(svgs.some((f) => f.endsWith(`${cw}.svg`)), cw).toBe(true);
    expect(readdirSync("branding/orbis/png").length).toBe(svgs.length); expect(readdirSync("branding/orbis/pdf").length).toBe(svgs.length);
    expect(svgs.every((f) => !/<text/.test(readFileSync(`branding/orbis/svg/${f}`, "utf8")))).toBe(true); // type is outlined
  });
  it("Work leads with the command centre and has dedicated Recurring and Action items views", () => {
    expect(PRIMARY_TABS.progressive.slice(0, 4)).toEqual(["overview", "tasks", "recurring", "actions"]);
    const page = read("src/pages/ModulePage.tsx"), views = read("src/components/WorkViews.tsx");
    expect(page).toContain('id === "progressive" && <WorkOverview'); expect(page).toContain("<RecurringView"); expect(page).toContain("<ActionItemsView");
    for (const section of ["Today's responsibilities", "Action items from email", "Incoming deliveries", "Upcoming recurring", "Manual tasks", "Meetings and events"]) expect(views).toContain(section);
    expect(views).not.toMatch(/style=\{\{/); expect(views).not.toContain("dangerouslySetInnerHTML");
  });
  it("the task editor exposes rotation awareness and last-day-of-month", () => {
    const ed = read("src/components/editors.tsx");
    expect(ed).toContain("Only while on rotation"); expect(ed).toContain("Last day of the month");
  });
});
