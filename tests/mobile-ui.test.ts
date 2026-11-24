import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

/** Source-level guards for the phone design. The rendered checks (overflow, touch targets, dock overlap) are in scripts/ui-check.cjs. */
describe("mobile interface guards", () => {
  it("phones get 44 px buttons and safe-area padding below the floating dock", () => {
    expect(read("src/styles/index.css")).toMatch(/@media \(max-width: 767px\) \{ \.btn \{ min-height: 44px; \} \}/);
    expect(read("src/components/Shell.tsx")).toContain("env(safe-area-inset-bottom)");
    expect(read("src/components/Shell.tsx")).toContain("fixed inset-x-3 bottom-3");
  });
  it("task rows use a compact provenance icon, not repeated text, and the detail view keeps the full warning", () => {
    const row = read("src/components/TaskLine.tsx");
    expect(row).toContain("ProvenanceMark");
    expect(row).not.toContain("UNVERIFIED SOURCE");
    const editor = read("src/components/editors.tsx");
    expect(editor).toContain("Unverified source");
    expect(editor).toContain("self-declared and not verified");
    expect(read("src/components/mobile.tsx")).toContain("Filed by an assistant, unverified source");
  });
  it("the phone Overview shows capped previews from live data and collapses empty sections", () => {
    const o = read("src/components/MobileOverview.tsx");
    expect(o).toContain(".slice(0, 4)"); // up next
    expect(o).toContain(".slice(0, 3)"); // schedule
    expect(o).toMatch(/activeGoals\.length > 0 &&/);
    expect(o).toMatch(/upcomingEvents\.length > 0 &&/);
    expect(o).toMatch(/attention > 0 &&/);
    expect(o).not.toMatch(/Math\.random|const (demo|sample)/i); // no invented figures
    expect(o).not.toContain("(synthetic)"); // demonstration labels are never stripped from the overview
  });
  it("wider screens keep the approved layouts", () => {
    const d = read("src/pages/Dashboard.tsx");
    expect(d).toContain('className="md:hidden"><MobileOverview');
    expect(d).toContain('className="hidden md:block"');
    expect(read("src/components/compact.tsx")).toContain('className="hidden gap-3 md:grid lg:grid-cols-2"'); // full goal cards remain
  });
  it("every module has a light and a dark accent", () => {
    const css = read("src/styles/index.css");
    for (const m of ["daily", "health", "financial", "framework", "progressive"]) expect(css.match(new RegExp(`--m-${m}:`, "g"))?.length).toBe(2);
  });
  it("the goals caption wraps instead of truncating on small phones", () => {
    const o = read("src/components/MobileOverview.tsx");
    expect(o).toContain("line-clamp-2");
    expect(o).not.toMatch(/truncate[^\n]*nextGoal/);
  });
  it("the environment switcher is navigation only, to the two approved hosts, in every layout", () => {
    const e = read("src/components/EnvSwitch.tsx");
    expect(e).toContain("switchUrl(");
    expect(e).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(|XMLHttpRequest|Authorization|token/i); // nothing is read, stored or sent
    expect(e).toContain('rel="noopener noreferrer"');
    const shell = read("src/components/Shell.tsx");
    expect(shell).toContain('sheet === "more" && <div className="mt-5"><EnvCard />'); // phone More tab, below identity and theme
    expect(shell).toContain("<EnvCard compact />"); // desktop sidebar
    expect(shell).toContain("<EnvRailButton />"); // iPad rail
    expect(shell).toContain("<StagingTag />"); // beside the Axis branding
    expect(shell).toMatch(/sticky top-4 z-30/); // the rail's popover must sit above the page sheet
  });
});
