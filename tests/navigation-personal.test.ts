import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legacyModuleRoute, navModuleOf, NAV_MEMBERS, isNavModule } from "../shared/modules";
import { averageProgress, eventsByDate, habitDays, inPersonal, PERSONAL_SCOPE } from "../shared/personal";
import { addContext, orderedKinds } from "../shared/quickAdd";
import { searchHits } from "../shared/search";

const read = (p: string) => readFileSync(p, "utf8");

describe("Personal groups Daily and Health without merging them", () => {
  it("maps internal module ids to the screen group, and old links to Personal", () => {
    expect(navModuleOf("daily")).toBe("personal"); expect(navModuleOf("health")).toBe("personal"); expect(navModuleOf("financial")).toBe("financial");
    expect(PERSONAL_SCOPE).toEqual(NAV_MEMBERS.personal);
    expect(inPersonal("daily") && inPersonal("health") && !inPersonal("framework")).toBe(true);
    expect(legacyModuleRoute("daily")).toEqual({ module: "personal" }); expect(legacyModuleRoute("health")).toEqual({ module: "personal", tab: "health" }); expect(legacyModuleRoute("financial")).toBeNull();
    expect(isNavModule("personal")).toBe(true); expect(isNavModule("daily")).toBe(false);
  });
  it("the backend still knows five separate modules (no merge): assistants, scopes and inbox ids are untouched", () => {
    const m = read("shared/modules.ts");
    expect(m).toContain('MODULE_IDS = ["daily", "health", "financial", "framework", "progressive"]');
    expect(read("src/pages/PersonalPage.tsx")).not.toMatch(/module: "personal"|module === "personal"/); // never written to a record
    expect(read("src/components/PersonalViews.tsx")).toContain('defaultModule="daily"'); // new records start in a real module
  });
  it("computes habit days, average progress and grouped events from recorded data only", () => {
    const d = (date: string, applies: boolean, done: boolean) => ({ date, applies, done });
    expect(habitDays([{ recent: [d("2026-11-23", true, true), d("2026-11-24", true, false)] }, { recent: [d("2026-11-23", true, false), d("2026-11-24", false, false)] }], 7)).toEqual([{ date: "2026-11-23", done: 1, due: 2 }, { date: "2026-11-24", done: 0, due: 1 }]);
    expect(habitDays([], 7)).toEqual([]);
    expect(averageProgress([])).toBeNull(); expect(averageProgress([{ status: "active", progress: 40 }, { status: "active", progress: 61 }, { status: "paused", progress: 0 }])).toBe(51);
    const ev = (date: string, startTime: string | null, status = "scheduled") => ({ date, startTime, status });
    expect(eventsByDate([ev("2026-11-27", "10:00"), ev("2026-11-26", "09:00"), ev("2026-11-27", "08:00"), ev("2026-11-26", null, "cancelled"), ev("2026-12-30", null)], "2026-11-25", "2026-12-02").map((g) => [g.date, g.items.length])).toEqual([["2026-11-26", 1], ["2026-11-27", 2]]);
  });
});

describe("Quick Add is context aware", () => {
  it("suggests the likeliest record first and defaults the module", () => {
    expect(addContext("/m/financial", "?tab=transactions").first[0]).toBe("txn"); expect(addContext("/m/financial", "?tab=bills").first[0]).toBe("bill");
    expect(addContext("/m/personal", "?tab=health")).toMatchObject({ first: ["habit", "task", "goal", "event"], module: "health" });
    expect(addContext("/m/personal", "?tab=appointments")).toMatchObject({ first: expect.arrayContaining(["event"]), module: "daily" }); expect(addContext("/m/personal", "").first[0]).toBe("task");
    expect(addContext("/m/progressive", "?tab=procurement").first[0]).toBe("proc"); expect(addContext("/calendar", "").first[0]).toBe("event"); expect(addContext("/goals", "").first[0]).toBe("goal"); expect(addContext("/", "").first[0]).toBe("task");
    expect(addContext("/m/health", "").module).toBe("health");
  });
  it("always offers every kind exactly once", () => {
    const all = orderedKinds(addContext("/m/financial", "").first);
    expect(all).toHaveLength(8); expect(new Set(all).size).toBe(8);
  });
  it("opens the usual editors and writes only through them (no new write path)", () => {
    const q = read("src/components/QuickAdd.tsx");
    for (const e of ["TaskEditor", "GoalEditor", "HabitEditor", "EventEditor", "TransactionEditor", "BillEditor", "ReimbursementEditor", "ProcurementEditor"]) expect(q).toContain(`<${e}`);
    expect(q).not.toMatch(/fetch\(|api\(|post\(/);
  });
});

describe("Search", () => {
  const d = { tasks: [{ id: "1", title: "Book dentist", module: "health", status: "pending" }, { id: "2", title: "Dentist invoice", module: "financial", status: "completed" }], goals: [{ id: "g", title: "Lose 5 kg", module: "health" }], habits: [], events: [{ id: "e", title: "Dentist check-up", date: "2026-12-01", module: "health" }], txns: [{ id: "x", payee: "Dental clinic (synthetic)", date: "2026-11-03" }], bills: [{ id: "b", name: "Gym" }], accounts: [{ id: "a", name: "Chequing" }] };
  it("needs two letters, groups results and links to the right screen", () => {
    expect(searchHits("d", d)).toEqual([]);
    const hits = searchHits("dent", d);
    expect(hits.map((h) => h.group)).toEqual(["Tasks", "Tasks", "Calendar", "Transactions"]);
    expect(hits[2].to).toBe("/calendar"); expect(hits[3].to).toBe("/m/financial?tab=transactions");
    expect(hits[1].to).toContain("status=completed");
    expect(searchHits("zzz", d)).toEqual([]);
    expect(searchHits("gym", d)[0].to).toBe("/m/financial?tab=bills");
  });
  it("caps each group", () => {
    const many = { ...d, tasks: Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `Thing ${i}`, module: "daily", status: "pending" })) };
    expect(searchHits("thing", many)).toHaveLength(5);
  });
});

describe("Orbis menu and dock", () => {
  const menu = read("src/components/OrbisMenu.tsx"), shell = read("src/components/Shell.tsx"), css = read("src/styles/index.css");
  it("is the brand symbol on Orbis lime, distinct from the other buttons", () => {
    expect(css).toContain("--orbis-lime: #d5dfb3"); expect(css).toMatch(/\.orbis-btn \{ background: var\(--orbis-lime\)/);
    expect(menu).toContain("<OrbitSymbol"); expect(read("src/components/OrbitSymbol.tsx")).toContain('rx="358" ry="113"'); // the existing orbital mark
  });
  it("opens an animated glass menu with the six entries, keyboard and screen-reader support, and honours reduced motion", () => {
    for (const s of ['role="menu"', 'role="menuitem"', "aria-expanded", 'e.key === "Escape"', "ArrowDown", "prefersReducedMotion", "createPortal", "Quick Add", "Search", "Settings", "Calendar", "Home", "Switch to"]) expect(menu).toContain(s);
    expect(css).toContain(".orbis-pop"); expect(css).toMatch(/\.orbis-pop\[data-shown="true"\]/); expect(css).toContain("transition-delay: calc(var(--i, 0)");
  });
  it("the environment switch only navigates between the two approved hosts and carries nothing along", () => {
    expect(menu).toContain('rel="noopener noreferrer"'); expect(menu).toContain('referrerPolicy="no-referrer"'); expect(menu).toContain("useEnvironment()");
  });
  it("the dock and rail keep the glass, the sliding bubble and the page transitions", () => {
    expect(shell).toContain("useSlidingIndicator"); expect(shell).toContain("<PageFrame"); expect(shell).toContain("glass-bubble");
    expect(shell).toMatch(/slot\(a\)\}\{slot\(b\)\}[\s\S]*<OrbisButton variant="dock" \/>[\s\S]*slot\(c\)\}\{slot\(d\)\}/);
  });
  it("header actions keep the bell and drop Settings and Add", () => {
    const ui = read("src/components/ui.tsx");
    expect(ui).toContain("Bell"); expect(ui).not.toMatch(/Plus|AccountMenu|New task/);
  });
});

describe("Personal page", () => {
  it("has the five tabs and the More menu, and shows both assistants' records", () => {
    const page = read("src/pages/PersonalPage.tsx"), views = read("src/components/PersonalViews.tsx");
    for (const t of ["overview", "tasks", "health", "habits", "goals", "appointments", "calendar", "activity"]) expect(page).toContain(`tab === "${t}"`);
    expect(page).toContain("scope={PERSONAL_SCOPE}"); expect(page).toContain("/modules/daily/activity"); expect(page).toContain("/modules/health/activity");
    expect(views).toContain("<Card"); for (const w of ["RadialGauge", "CapsuleBars", "DotMatrixBars", "SegmentedProgress"]) expect(views).toContain(w); // graphical, like Finance and Work
    expect(read("src/pages/ModulePage.tsx")).toContain("legacyModuleRoute");
  });
  it("Home keeps its widgets and links the Health row to the Health tab", () => {
    const home = read("src/pages/Dashboard.tsx");
    expect(home).toContain("Daily completion"); expect(home).toContain("/m/personal?tab=health"); expect(home).toContain("Upcoming schedule");
  });
});
