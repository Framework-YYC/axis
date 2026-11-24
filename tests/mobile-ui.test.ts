import { readFileSync } from "node:fs";
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
    expect(PRIMARY_TABS).toEqual({ daily: ["overview", "tasks", "goals", "calendar"], health: ["overview", "tasks", "goals", "habits"], financial: ["overview", "tasks", "goals"], framework: ["overview", "tasks", "goals"], progressive: ["overview", "tasks", "goals", "habits"] });
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

describe("Home: five widgets and nothing else", () => {
  const home = read("src/pages/Dashboard.tsx");
  it("renders exactly the five widgets and links the Tasks and Goals cards to their screens", () => {
    for (const label of ["Daily completion", "Weekly workload", "Task activity", 'label="Tasks"', 'label="Goals"']) expect(home).toContain(label);
    expect(home).toContain('to="/tasks"'); expect(home).toContain('to="/goals"');
    expect(home.match(/<Card tone=/g)?.length).toBe(5);
  });
  it("has no launcher, lists or previews (those live on their own screens)", () => {
    for (const gone of ["TaskLine", "GoalCard", "HabitRow", "EventRow", "ModuleIcon", "HabitList", "Up next", "Schedule", "nav aria-label=\"Assistant modules\""]) expect(home).not.toContain(gone);
  });
  it("draws only from live data: no invented numbers", () => {
    expect(home).not.toMatch(/Math\.random|const (demo|sample)|\(synthetic\)/i);
    expect(home).toContain("focusStats(tasks, today)"); expect(home).toContain("weekBars(tasks, today, 7)"); expect(home).toContain("activityBars(tasks, period, today, weekStart)");
  });
  it("lets the activity chart switch reporting periods and states what it measures", () => {
    expect(home).toContain("ACTIVITY_PERIODS.map"); expect(home).toContain("Tasks completed per day");
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
