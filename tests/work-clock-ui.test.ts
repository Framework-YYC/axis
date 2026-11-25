import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCOPES } from "../worker/services/types";

const read = (p: string) => readFileSync(p, "utf8");

describe("Work Overview: time clock and shopping list", () => {
  const work = read("src/components/WorkViews.tsx"), clock = read("src/components/TimeClock.tsx"), hook = read("src/lib/timeclock.ts");
  it("both cards sit on Work Overview, the clock first", () => {
    expect(work).toContain("<TimeClockCard"); expect(work).toContain("<ShoppingCard");
    expect(work.indexOf("<TimeClockCard")).toBeLessThan(work.indexOf("<ShoppingCard")); expect(work.indexOf("<ShoppingCard")).toBeLessThan(work.indexOf('<Card tone="butter" to="/tasks?module=progressive'));
  });
  it("punching: jobs are one-tap, break/resume/end exist, end shift asks first, and nothing is automatic", () => {
    for (const s of ['go("job"', 'go("break"', 'go("resume"', 'go("end"', "End shift now", "Tap to switch", "aria-pressed"]) expect(clock).toContain(s);
    expect(clock).toContain("Nothing is deducted automatically"); expect(clock).not.toMatch(/setTimeout\([^)]*end/i);
  });
  it("failed saves are shown, keep the tap time and survive a reload; retries reuse the punch id", () => {
    expect(clock).toContain('role="alert"'); expect(clock).toContain("Not saved:"); expect(clock).toContain("Retry (keeps");
    expect(hook).toContain("crypto.randomUUID()"); expect(hook).toContain("localStorage"); expect(hook).toContain("at: new Date().toISOString()"); expect(hook).toContain("30_000"); expect(hook).toContain("visibilitychange");
  });
  it("the history is editable with local times, job names are configurable, weekly totals exist", () => {
    for (const s of ["Punch history", "Weekly totals", "Add a missed punch", "Delete punch", 'type="datetime-local"', "Originally punched", "Archive", "Add job"]) expect(clock).toContain(s);
  });
  it("the clock is owner-only: no scope grants assistants anything on it", () => {
    const ops = read("worker/services/operations.ts"), t = read("worker/services/timeclock.ts");
    for (const op of ["get_timeclock", "timeclock_punch", "timeclock_edit_entry", "timeclock_add_entry", "timeclock_delete_entry", "timeclock_save_job"]) expect(ops).toMatch(new RegExp(`name: "${op}", scope: "owner"[^}]*mcp: false`));
    expect(t).toContain("owner(ctx)"); expect(SCOPES.some((s) => /time/i.test(s))).toBe(false);
    expect(read("worker/services/inbox.ts")).not.toMatch(/timeclock/);
  });
  it("the rotation card shows the window, the countdown and a travel date flagged when unconfirmed", () => {
    expect(work).toContain("phaseWindow"); expect(work).toContain("upcomingTravel"); expect(work).toContain("to confirm"); expect(work).toContain("remaining ·");
  });
});

describe("iPad and desktop rail", () => {
  it("has no top-left Orbis logo link; the lime button is the only mark and Home is in its menu", () => {
    const shell = read("src/components/Shell.tsx"), rail = shell.slice(shell.indexOf("function Rail()"), shell.indexOf("function NavGroupView"));
    expect(rail).not.toContain("LogoMark"); expect(rail).not.toContain("Orbis home"); expect(rail).toContain('<OrbisButton variant="rail" />');
    expect(read("src/components/OrbisMenu.tsx")).toContain('label="Home"');
  });
});
