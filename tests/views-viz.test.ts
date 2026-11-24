import { describe, expect, it } from "vitest";
import { countViews, filterTasks, inView, isView, priorityLevel, type ViewTask } from "../shared/taskViews";
import { dotStacks, fillTicks, rotationTicks, scaleY, smoothPath } from "../shared/viz";

const base: ViewTask = { title: "t", status: "pending", priority: "medium", category: null, dueDate: null, scheduledDate: null, archivedAt: null, completedAt: null };
const T = (o: Partial<ViewTask>): ViewTask => ({ ...base, ...o });
const today = "2026-11-24";

describe("task views", () => {
  it("places tasks in the right views and never lists completed or archived ones as open", () => {
    expect(inView(T({ dueDate: today }), "today", today)).toBe(true);
    expect(inView(T({ dueDate: "2026-11-25" }), "tomorrow", today)).toBe(true);
    expect(inView(T({ dueDate: "2026-11-30" }), "week", today)).toBe(true);
    expect(inView(T({ dueDate: "2026-12-20" }), "month", today)).toBe(true);
    expect(inView(T({ dueDate: "2027-03-01" }), "later", today)).toBe(true);
    expect(inView(T({}), "inbox", today)).toBe(true);
    expect(inView(T({ dueDate: "2026-11-20" }), "overdue", today)).toBe(true);
    expect(inView(T({ dueDate: today, status: "completed" }), "today", today)).toBe(false);
    expect(inView(T({ dueDate: today, archivedAt: "x" }), "all", today)).toBe(false);
    expect(inView(T({ status: "completed" }), "done", today)).toBe(true);
    expect(inView(T({ status: "in_progress" }), "active", today)).toBe(true);
  });
  it("filters by category and text, orders by due date then priority, and counts per view", () => {
    const list = [T({ title: "B low", dueDate: today, priority: "low", category: "work" }), T({ title: "A crit", dueDate: today, priority: "critical", category: "finance", notes: "pay RENT" }), T({ title: "C", dueDate: "2026-11-22" })];
    expect(filterTasks(list, "all", today).map((t) => t.title)).toEqual(["C", "A crit", "B low"]);
    expect(filterTasks(list, "all", today, { category: "finance" }).map((t) => t.title)).toEqual(["A crit"]);
    expect(filterTasks(list, "all", today, { q: "rent" }).map((t) => t.title)).toEqual(["A crit"]);
    expect(countViews(list, today)).toMatchObject({ today: 2, overdue: 1, all: 3 });
  });
  it("validates view ids and priority levels", () => {
    expect(isView("overdue")).toBe(true);
    expect(isView("nope")).toBe(false);
    expect(isView(null)).toBe(false);
    expect([priorityLevel("critical"), priorityLevel("low")]).toEqual([4, 1]);
  });
});

describe("visual helpers", () => {
  it("fills ticks proportionally and clamps", () => {
    expect(fillTicks(10, 5, 10).filter((t) => t === "on")).toHaveLength(5);
    expect(fillTicks(10, 99, 10).filter((t) => t === "on")).toHaveLength(10);
    expect(fillTicks(10, -3, 10).filter((t) => t === "on")).toHaveLength(0);
    expect(fillTicks(10, 1, 0).filter((t) => t === "on")).toHaveLength(0);
  });
  it("marks today and the cycle correctly across the rotation", () => {
    const cfg = { anchorDate: "2026-11-16", onDays: 14, offDays: 7 };
    const t = rotationTicks("2026-11-24", cfg);
    expect(t).toHaveLength(21);
    expect(t.indexOf("now")).toBe(8);
    expect(t.filter((x) => x === "on")).toHaveLength(8);
    const off = rotationTicks("2026-12-01", cfg);
    expect(off.indexOf("now")).toBe(15);
    expect(off.filter((x) => x === "soft")).toHaveLength(1);
  });
  it("keeps zero columns empty and scales the rest to at least one dot", () => {
    expect(dotStacks([0, 1, 10], 10)).toEqual([0, 1, 10]);
    expect(dotStacks([0, 0], 10)).toEqual([0, 0]);
  });
  it("builds smooth paths and scales values into the plot area", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([[0, 0], [10, 5], [20, 0]])).toMatch(/^M0\.0,0\.0 Q10\.0,5\.0 .* L20\.0,0\.0$/);
    const ys = scaleY([1, 2, 3], 0, 100);
    expect(ys[0]).toBeGreaterThan(ys[2]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });
});
