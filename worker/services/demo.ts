import { addDays } from "../../shared/rotation";
import { MODULE_IDS, type ModuleId } from "../../shared/modules";
import { auditStmt } from "./audit";
import { write } from "./db";
import { createEvent } from "./events";
import { createGoal } from "./goals";
import { createHabit, logHabit } from "./habits";
import { resolveToday } from "./prefs";
import { loadDemoFinance } from "./demoFinance";
import { createTask } from "./tasks";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

/** Synthetic demonstration records. Every one carries demo = 1 so it is labelled in the app and can be removed in one action. */
export async function loadDemoData(ctx: Ctx): Promise<Result<{ tasks: number; goals: number; habits: number; events: number; logs: number; finance: number }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can load demonstration data");
  const today = await resolveToday(ctx, {}, v);
  const d = (n: number) => addDays(today, n);
  const n = { tasks: 0, goals: 0, habits: 0, events: 0, logs: 0, finance: 0 };
  const T = async (m: ModuleId, key: string, o: Record<string, unknown>) => { const r = await createTask(ctx, { module: m, demo: true, externalId: `demo:${m}:t:${key}`, ...o }); if (r.ok && !r.duplicate) n.tasks++; };
  const G = async (m: ModuleId, key: string, o: Record<string, unknown>) => { const r = await createGoal(ctx, { module: m, demo: true, externalId: `demo:${m}:g:${key}`, ...o }); if (r.ok && !r.duplicate) n.goals++; };
  const H = async (m: ModuleId, key: string, o: Record<string, unknown>, logs: number[], value = 1) => {
    const r = await createHabit(ctx, { module: m, demo: true, externalId: `demo:${m}:h:${key}`, startDate: d(-20), ...o });
    if (!r.ok) return;
    if (!r.duplicate) n.habits++;
    for (const back of logs) { const l = await logHabit(ctx, { habitId: r.data.id, date: d(-back), value, externalId: `demo:log:${key}:${back}` }); if (l.ok && !l.duplicate) n.logs++; }
  };
  const E = async (m: ModuleId, key: string, o: Record<string, unknown>) => { const r = await createEvent(ctx, { module: m, demo: true, externalId: `demo:${m}:e:${key}`, ...o }); if (r.ok && !r.duplicate) n.events++; };

  await T("daily", "1", { title: "Renew vehicle registration (synthetic)", priority: "high", dueDate: d(-2) });
  await T("daily", "2", { title: "Book dentist appointment (synthetic)", dueDate: d(1) });
  await T("daily", "3", { title: "Plan weekend errands (synthetic)", priority: "low", dueDate: d(4) });
  await T("daily", "4", { title: "Sort paperwork (synthetic)", priority: "low" });
  await T("daily", "5", { title: "Water the plants (synthetic)", dueDate: d(2), recurrence: { freq: "weekly", interval: 1 } });
  await E("daily", "1", { title: "Dentist (synthetic)", date: d(1), startTime: "10:00", endTime: "11:00" });
  await G("daily", "1", { title: "Declutter the house (synthetic)", targetDate: d(60), milestones: [{ title: "Garage" }, { title: "Office" }, { title: "Closets" }] });
  await H("daily", "1", { title: "Tidy for 10 minutes (synthetic)" }, [1, 2, 3, 5, 6, 8]);

  await T("health", "1", { title: "Book physio check-in (synthetic)", dueDate: d(3) });
  await T("health", "2", { title: "Reorder supplements (synthetic)", priority: "low", dueDate: d(9) });
  await T("health", "3", { title: "Log body measurements (synthetic)", dueDate: d(0), recurrence: { freq: "weekly", interval: 1 } });
  await E("health", "1", { title: "Training session (synthetic)", date: d(0), startTime: "17:30", endTime: "18:30" });
  await G("health", "1", { title: "Reach 78 kg (synthetic)", kind: "numeric", startValue: 82, targetValue: 78, currentValue: 80.5, unit: "kg", targetDate: d(120) });
  await H("health", "1", { title: "Drink 2.5 L of water (synthetic)", targetValue: 2500, unit: "ml" }, [0, 1, 2, 3, 4, 6], 2500);
  await H("health", "2", { title: "Strength session on days off (synthetic)", rotationMode: "off" }, [9, 10]);

  await T("financial", "1", { title: "Pay internet bill (synthetic)", priority: "high", dueDate: d(2) });
  await T("financial", "2", { title: "Review monthly budget (synthetic)", dueDate: d(0) });
  await T("financial", "3", { title: "File receipts (synthetic)", priority: "low", dueDate: d(15) });
  await G("financial", "1", { title: "Emergency fund to 20,000 (synthetic)", kind: "numeric", startValue: 0, targetValue: 20000, currentValue: 12400, unit: "CAD", targetDate: d(200) });
  await H("financial", "1", { title: "Record expenses (synthetic)" }, [0, 1, 2, 4, 5]);

  await T("framework", "1", { title: "Send proposal draft (synthetic)", priority: "critical", dueDate: d(0), status: "in_progress" });
  await T("framework", "2", { title: "Follow up with a prospect (synthetic)", priority: "high", dueDate: d(-1) });
  await T("framework", "3", { title: "Publish a case study (synthetic)", dueDate: d(12) });
  await G("framework", "1", { title: "Launch Orbis staging (synthetic)", targetDate: d(30), milestones: [{ title: "Design approved" }, { title: "Assistants connected" }, { title: "Real data loaded" }] });
  await H("framework", "1", { title: "Send 3 outreach messages (synthetic)", targetCount: 3, daysOfWeek: [1, 2, 3, 4, 5] }, [1, 2, 3, 4]);

  await T("progressive", "1", { title: "Confirm procurement schedule (synthetic)", priority: "high", dueDate: d(1) });
  await T("progressive", "2", { title: "Prepare HSE toolbox talk (synthetic)", dueDate: d(5) });
  await T("progressive", "3", { title: "Update three-week lookahead (synthetic)", dueDate: d(0), recurrence: { freq: "weekly", interval: 1 } });
  await G("progressive", "1", { title: "Zero recordable incidents (synthetic)", manualProgress: 60, targetDate: d(180) });
  await H("progressive", "1", { title: "Site walk-through on rotation days (synthetic)", rotationMode: "on" }, [1, 2, 3, 4, 5, 6]);

  // A fuller synthetic set that resembles a populated dashboard: many goals, a spread of due dates, mixed priorities and habits.
  const more: Array<[ModuleId, string, string, number | null, string?]> = [
    ["daily", "Order anniversary flowers", "high", 0], ["daily", "Correct bank contact information", "medium", 0], ["daily", "Schedule car winter tires", "medium", 3], ["daily", "Return library books", "low", 2],
    ["daily", "Renew home insurance quote", "medium", 6], ["daily", "Plan family dinner", "low", 5], ["daily", "Pick up dry cleaning", "low", -1], ["daily", "Update emergency contacts", "medium", 9],
    ["health", "Schedule annual physical", "medium", 4], ["health", "Refill vitamin D", "low", 1], ["health", "Meal prep for the week", "medium", 0], ["health", "Mobility routine review", "low", 8],
    ["financial", "Submit expense report", "high", 0], ["financial", "Review credit card statement", "medium", 2], ["financial", "Move savings transfer", "medium", 5], ["financial", "Gather tax receipts", "low", 21], ["financial", "Check mortgage renewal options", "medium", 14],
    ["framework", "Draft onboarding checklist", "medium", 0], ["framework", "Review analytics dashboard", "low", 3], ["framework", "Invoice milestone two", "high", 1], ["framework", "Write release notes", "medium", 4], ["framework", "Reply to partnership email", "high", -1], ["framework", "Plan quarterly roadmap", "medium", 11],
    ["progressive", "Follow up on first-aid training", "medium", 0], ["progressive", "Review subcontractor insurance certificates", "high", 2], ["progressive", "Update procurement log", "medium", 1], ["progressive", "Book site inspection", "medium", 6], ["progressive", "Confirm crane delivery window", "high", 3], ["progressive", "Collect weekly safety observations", "low", 7],
  ];
  let k = 0;
  for (const [m, title, priority, off] of more) await T(m, `x${++k}`, { title: `${title} (synthetic)`, priority, ...(off === null ? {} : { dueDate: d(off) }) });
  const goalsMore: Array<[ModuleId, string, Record<string, unknown>]> = [
    ["daily", "Declutter the garage", { manualProgress: 35, targetDate: d(45) }], ["daily", "Read twelve books this year", { kind: "numeric", startValue: 0, targetValue: 12, currentValue: 7, unit: "books", targetDate: d(37) }], ["daily", "Plan summer trip", { manualProgress: 20, targetDate: d(150) }], ["daily", "Organise digital photos", { manualProgress: 55, targetDate: d(400) }],
    ["health", "Run a 10 km race", { kind: "numeric", startValue: 3, targetValue: 10, currentValue: 6.5, unit: "km", targetDate: d(110) }], ["health", "Sleep seven hours on average", { manualProgress: 70, targetDate: d(60) }], ["health", "Hit the protein target daily", { manualProgress: 45, targetDate: d(30) }], ["health", "Complete physio programme", { manualProgress: 80, targetDate: d(20) }],
    ["financial", "Pay off the credit line", { kind: "numeric", startValue: 9000, targetValue: 0, currentValue: 4200, unit: "CAD", targetDate: d(240) }], ["financial", "Build a three-month buffer", { kind: "numeric", startValue: 0, targetValue: 15000, currentValue: 6800, unit: "CAD", targetDate: d(300) }], ["financial", "Automate monthly bills", { manualProgress: 60, targetDate: d(40) }],
    ["framework", "Sign five pilot clients", { kind: "numeric", startValue: 0, targetValue: 5, currentValue: 2, unit: "clients", targetDate: d(120) }], ["framework", "Publish the brand guide", { manualProgress: 65, targetDate: d(25) }], ["framework", "Reach 1,000 newsletter readers", { kind: "numeric", startValue: 120, targetValue: 1000, currentValue: 410, unit: "readers", targetDate: d(500) }],
    ["progressive", "Close out the lookahead backlog", { manualProgress: 40, targetDate: d(35) }], ["progressive", "Complete HSE certification", { manualProgress: 25, targetDate: d(200) }],
  ];
  let gk = 100;
  for (const [m, title, o] of goalsMore) await G(m, `x${++gk}`, { title: `${title} (synthetic)`, ...o });
  await H("daily", "2", { title: "Evening reset (synthetic)" }, [1, 2, 3, 4, 5, 6]);
  await H("health", "3", { title: "Walk 8,000 steps (synthetic)", targetValue: 8000, unit: "steps" }, [1, 2, 4, 5], 8000);
  await H("framework", "2", { title: "Deep work block (synthetic)", daysOfWeek: [1, 2, 3, 4, 5] }, [1, 2, 3]);
  await E("daily", "2", { title: "Parent-teacher call (synthetic)", date: d(0), startTime: "16:00", endTime: "16:30" });
  await E("framework", "2", { title: "Client check-in (synthetic)", date: d(0), startTime: "11:00", endTime: "11:45" });
  await E("progressive", "2", { title: "Site safety meeting (synthetic)", date: d(1), startTime: "07:00", endTime: "07:30" });
  await E("financial", "2", { title: "Advisor review (synthetic)", date: d(3), startTime: "13:00", endTime: "14:00" });
  await E("health", "2", { title: "Physio appointment (synthetic)", date: d(4), startTime: "09:30", endTime: "10:15" });
  await E("framework", "3", { title: "Quarterly planning (synthetic)", date: d(6) });
  for (const m of MODULE_IDS) void m;
  const fin = await loadDemoFinance(ctx, today); n.finance = fin.finance; n.tasks += fin.tasks;
  return ok(n);
}

/** Removes only records flagged demo = 1, with their history. Real records are untouched. */
export async function clearDemoData(ctx: Ctx): Promise<Result<{ removed: Record<string, number> }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can remove demonstration data");
  const count = async (sql: string) => (await ctx.db.prepare(sql).first<{ n: number }>())?.n ?? 0;
  const removed = {
    tasks: await count("SELECT COUNT(*) AS n FROM tasks WHERE demo = 1"), goals: await count("SELECT COUNT(*) AS n FROM goals WHERE demo = 1"),
    habits: await count("SELECT COUNT(*) AS n FROM habits WHERE demo = 1"), events: await count("SELECT COUNT(*) AS n FROM events WHERE demo = 1"), finance: await count("SELECT (SELECT COUNT(*) FROM fin_accounts WHERE demo = 1) + (SELECT COUNT(*) FROM fin_transactions WHERE demo = 1) + (SELECT COUNT(*) FROM fin_bills WHERE demo = 1) AS n"),
  };
  const q = (s: string) => ctx.db.prepare(s);
  await write(ctx.db, [
    q("DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE demo = 1)"),
    q("DELETE FROM tasks WHERE demo = 1"),
    q("DELETE FROM goal_progress WHERE goal_id IN (SELECT id FROM goals WHERE demo = 1)"),
    q("DELETE FROM goal_milestones WHERE goal_id IN (SELECT id FROM goals WHERE demo = 1)"),
    q("DELETE FROM goals WHERE demo = 1"),
    q("DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE demo = 1)"),
    q("DELETE FROM habits WHERE demo = 1"),
    q("DELETE FROM events WHERE demo = 1"),
    q("DELETE FROM fin_bill_payments WHERE demo = 1"), q("DELETE FROM fin_transactions WHERE demo = 1"), q("DELETE FROM fin_balances WHERE demo = 1"), q("DELETE FROM fin_budgets WHERE demo = 1"),
    q("DELETE FROM fin_bills WHERE demo = 1"), q("DELETE FROM fin_income_plans WHERE demo = 1"), q("DELETE FROM fin_reimbursements WHERE demo = 1"), q("DELETE FROM fin_accounts WHERE demo = 1"),
    auditStmt(ctx, "demo.clear", "demo", null),
  ]);
  return ok({ removed });
}
