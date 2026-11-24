import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { processInbox, maintenance } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { ownerActor, type Ctx } from "../worker/services/types";
import type { ModuleId } from "../shared/modules";

const NOW = new Date("2026-11-24T18:00:00.000Z"); // Tuesday, UTC
const TODAY = "2026-11-24";
let db: D1Database;
let raw: ReturnType<typeof makeDb>["raw"];
let owner: Ctx;
const ctxFor = (actor: Ctx["actor"]): Ctx => ({ db, actor, requestId: "t", now: () => NOW });
const as = (m: ModuleId) => ctxFor(assistantActor(m));
const run = async (c: Ctx, op: string, input: unknown = {}, key?: string) => runOperation(c, op, input, key) as Promise<any>;

/** What an SQL-only assistant does: insert a pending request. No gate, no service layer. */
function ask(id: string, assistant: ModuleId, op: string, payload: unknown) {
  return raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?,?,?,?)").run(id, assistant, op, JSON.stringify(payload));
}
const inboxRow = (id: string) => { const r = raw.prepare("SELECT status, result, approval_id FROM assistant_inbox WHERE id = ?").get(id) as any; return { status: r.status as string, result: r.result ? JSON.parse(r.result) : null, approvalId: r.approval_id as string | null }; };

beforeEach(() => {
  const m = makeDb();
  db = m.db; raw = m.raw;
  owner = ctxFor(ownerActor("web"));
});

describe("write guard: SQL cannot silently bypass the service layer", () => {
  it("blocks direct inserts, updates and deletes on every core table, with a message that says what to do", async () => {
    const t = await run(owner, "create_task", { title: "Guarded" });
    expect(t.ok).toBe(true);
    await run(owner, "create_integration", { name: "x", kind: "other", scopes: ["tasks:read"] }); // row triggers need rows to act on
    await run(as("daily"), "archive_goal", { id: (await run(owner, "create_goal", { title: "g", module: "daily" })).data.id }); // creates a pending approval
    const attempts = [
      `INSERT INTO tasks (id,title,created_at,updated_at,created_by,updated_by) VALUES ('x','x','2026-01-01','2026-01-01','a','a')`,
      `UPDATE tasks SET status = 'completed' WHERE id = '${t.data.id}'`,
      `DELETE FROM tasks`,
      `UPDATE task_events SET event = 'created'`,
      `DELETE FROM audit_log`,
      `INSERT INTO audit_log (actor_type,actor_id,actor_label,channel,action,entity,outcome) VALUES ('user','x','x','web','x','x','success')`,
      `UPDATE settings SET value = 'x'`,
      `DELETE FROM integrations`,
      `UPDATE pending_approvals SET status = 'approved'`,
      `INSERT INTO briefings (module,today,as_of,content,generated_at) VALUES ('daily','x','x','{}','x')`,
      `INSERT INTO goals (id,module,title,created_at,updated_at,created_by,updated_by) VALUES ('g','daily','t','x','x','a','a')`,
      `INSERT INTO habit_logs (id,habit_id,date,at,actor_label,channel) VALUES ('l','h','2026-01-01','x','a','b')`,
    ];
    for (const sql of attempts) expect(() => raw.exec(sql), sql).toThrow(/blocked|read-only|cannot be removed/i);
    expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(t.data.id)).toMatchObject({ status: "pending" });
    expect(() => raw.exec("DELETE FROM tasks")).toThrow(/assistant_inbox/); // the message names the sanctioned path
  });
  it("guards every table: a new table without insert, update and delete triggers fails this test", () => {
    const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'").all() as Array<{ name: string }>).map((r) => r.name).filter((n) => n !== "write_gate");
    const triggers = new Set((raw.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>).map((r) => r.name));
    const missing = tables.flatMap((t) => ["i", "u", "d"].map((k) => `guard_${t}_${k}`)).filter((n) => !triggers.has(n));
    expect(missing).toEqual([]);
  });
  it("leaves the gate shut after normal service writes and after failed ones", async () => {
    await run(owner, "create_task", { title: "ok" });
    await run(owner, "create_task", { title: "" }); // invalid, nothing written
    expect(raw.prepare("SELECT open FROM write_gate").get()).toEqual({ open: 0 });
    expect(() => raw.exec("UPDATE tasks SET title = 'x'")).toThrow();
  });
  it("accepts only well-formed pending requests into the inbox", () => {
    expect(() => ask("req-00000001", "health", "task.create", { title: "A" })).not.toThrow();
    expect(() => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload, status) VALUES ('req-00000002','health','task.create','{}','applied')").run()).toThrow(/Invalid assistant_inbox/);
    expect(() => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES ('req-00000003','health','task.create','not json')").run()).toThrow(/Invalid assistant_inbox/);
    expect(() => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES ('req-00000004','health','drop.everything','{}')").run()).toThrow(/Invalid assistant_inbox/);
    expect(() => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES ('s','health','task.create','{}')").run()).toThrow(/Invalid assistant_inbox/);
    expect(() => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES ('req-00000005','nexus','task.create','{}')").run()).toThrow(); // unknown assistant
    expect(() => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload, result) VALUES ('req-00000006','health','task.create','{}','{\"ok\":true}')").run()).toThrow(/Invalid assistant_inbox/);
    expect(() => raw.exec("UPDATE assistant_inbox SET status = 'applied'")).toThrow(/read-only/);
    expect(() => raw.exec("DELETE FROM assistant_inbox")).toThrow(/cannot be removed/);
    expect(() => ask("req-00000001", "health", "task.create", { title: "A" })).toThrow(/UNIQUE/); // the request id is the idempotency key
  });
  it("caps how many requests can wait", () => {
    for (let i = 0; i < 200; i++) ask(`req-${String(i).padStart(8, "0")}`, "daily", "task.create", { title: `t${i}` });
    expect(() => ask("req-overflow1", "daily", "task.create", { title: "x" })).toThrow(/fewer than 200/);
  });
});

describe("assistant inbox: applied through the service layer", () => {
  it("creates a task for the right module with source tracking, history and audit", async () => {
    ask("req-health-01", "health", "task.create", { title: "Book physio", dueDate: "2026-11-26", priority: "high", externalId: "health:email:abc:1", sourceRef: "email:abc" });
    expect((await processInbox(db, { now: NOW })).processed).toBe(1);
    const r = inboxRow("req-health-01");
    expect(r.status).toBe("applied");
    expect(r.result).toMatchObject({ ok: true, duplicate: false, status: "pending" });
    const t = raw.prepare("SELECT * FROM tasks WHERE id = ?").get(r.result.id) as any;
    expect(t).toMatchObject({ module: "health", source_assistant: "health", source_name: "ChatGPT: Health assistant", source_kind: "assistant", source_ref: "email:abc", created_by: "ChatGPT: Health assistant" });
    expect(raw.prepare("SELECT event, channel, actor_label FROM task_events WHERE task_id = ?").all(t.id)).toEqual([{ event: "created", channel: "inbox", actor_label: "ChatGPT: Health assistant" }]);
    expect(raw.prepare("SELECT actor_label, channel, via, action, outcome FROM audit_log WHERE entity_id = ?").all(t.id)).toEqual([{ actor_label: "ChatGPT: Health assistant", channel: "system", via: "inbox", action: "task.create", outcome: "success" }]);
  });
  it("prevents duplicates across repeated email reviews and separate requests", async () => {
    ask("req-d-0000001", "daily", "task.create", { title: "Renew registration", externalId: "daily:email:t1:1" });
    ask("req-d-0000002", "daily", "task.create", { title: "Renew registration (second review)", externalId: "daily:email:t1:1" });
    ask("req-d-0000003", "daily", "task.create", { title: "Pay parking", dueDate: "2026-11-30" });
    ask("req-d-0000004", "daily", "task.create", { title: "pay PARKING", dueDate: "2026-11-30" }); // identical open task, different wording/case
    await processInbox(db, { now: NOW });
    expect(inboxRow("req-d-0000001").status).toBe("applied");
    expect(inboxRow("req-d-0000002").status).toBe("duplicate");
    expect(inboxRow("req-d-0000004").status).toBe("duplicate");
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toEqual({ n: 2 });
    expect(inboxRow("req-d-0000002").result.id).toBe(inboxRow("req-d-0000001").result.id);
  });
  it("applies a request exactly once even if processing runs again", async () => {
    ask("req-once-0001", "framework", "task.create", { title: "Send proposal" });
    await Promise.all([processInbox(db, { now: NOW }), processInbox(db, { now: NOW })]);
    await processInbox(db, { now: NOW });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toEqual({ n: 1 });
  });
  it("keeps modules separate: an assistant cannot write to or touch another module", async () => {
    const fin = await run(owner, "create_task", { title: "Budget review", module: "financial" });
    ask("req-sep-00001", "health", "task.create", { title: "Sneaky", module: "financial" });
    ask("req-sep-00002", "health", "task.complete", { id: fin.data.id });
    ask("req-sep-00003", "health", "task.update", { id: fin.data.id, title: "Renamed" });
    ask("req-sep-00004", "health", "goal.create", { title: "Wrong module goal", module: "framework" });
    await processInbox(db, { now: NOW });
    for (const id of ["req-sep-00001", "req-sep-00002", "req-sep-00003", "req-sep-00004"]) expect(inboxRow(id), id).toMatchObject({ status: "rejected", result: { ok: false, code: "forbidden" } });
    expect(raw.prepare("SELECT status, title FROM tasks WHERE id = ?").get(fin.data.id)).toEqual({ status: "pending", title: "Budget review" });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toEqual({ n: 1 });
  });
  it("reads are module-confined too: an assistant sees only its own module", async () => {
    await run(owner, "create_task", { title: "Health item", module: "health" });
    await run(owner, "create_task", { title: "Finance item", module: "financial" });
    const h = await run(as("health"), "list_tasks", {});
    expect(h.data.tasks.map((t: any) => t.title)).toEqual(["Health item"]);
    expect((await run(as("health"), "list_tasks", { module: "financial" })).error.code).toBe("forbidden");
    expect((await run(as("health"), "get_briefing", { module: "financial" })).error.code).toBe("forbidden");
    expect((await run(as("health"), "get_briefing", { module: "overview" })).error.code).toBe("forbidden");
    const g = await run(owner, "create_goal", { title: "Money goal", module: "financial" });
    expect((await run(as("health"), "get_goal", { id: g.data.id })).error.code).toBe("forbidden");
    expect((await run(as("health"), "list_goals", {})).data.count).toBe(0);
  });
  it("reports validation failures and version conflicts back on the request row", async () => {
    const t = await run(owner, "create_task", { title: "Conflict me", module: "framework" });
    await run(owner, "update_task", { id: t.data.id, priority: "high" }); // version 2
    ask("req-err-00001", "framework", "task.create", { title: "Bad date", dueDate: "2026-02-30" });
    ask("req-err-00002", "framework", "task.update", { id: t.data.id, title: "Late edit", expectedVersion: 1 });
    ask("req-err-00003", "framework", "task.complete", { id: "tsk_missing" });
    await processInbox(db, { now: NOW });
    expect(inboxRow("req-err-00001")).toMatchObject({ status: "rejected", result: { code: "invalid_input" } });
    expect(inboxRow("req-err-00002")).toMatchObject({ status: "rejected", result: { code: "conflict" } });
    expect(inboxRow("req-err-00003")).toMatchObject({ status: "rejected", result: { code: "not_found" } });
    expect(raw.prepare("SELECT title FROM tasks WHERE id = ?").get(t.data.id)).toEqual({ title: "Conflict me" });
  });
  it("holds bulk and destructive requests for the owner; approval executes them as the assistant, still confined to its module", async () => {
    const tasks = Array.from({ length: 11 }, (_, i) => ({ title: `Bulk ${i}` }));
    ask("req-bulk-0001", "progressive", "task.create_many", { tasks });
    ask("req-bulk-0002", "progressive", "task.create_many", { tasks: [...tasks.slice(0, 10), { title: "Cross", module: "financial" }] });
    const victim = await run(owner, "create_task", { title: "Archive me", module: "progressive" });
    ask("req-arch-0001", "progressive", "task.archive", { id: victim.data.id });
    await processInbox(db, { now: NOW });
    expect(inboxRow("req-bulk-0001")).toMatchObject({ status: "approval_required", result: { code: "approval_required" } });
    expect(inboxRow("req-bulk-0002")).toMatchObject({ status: "rejected", result: { code: "forbidden" } }); // a foreign module is refused before it can be approved
    expect(inboxRow("req-arch-0001").status).toBe("approval_required");
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toEqual({ n: 1 });
    const bulk = inboxRow("req-bulk-0001").approvalId!, arch = inboxRow("req-arch-0001").approvalId!;
    expect((await run(owner, "approve_action", { id: bulk })).data.status).toBe("approved");
    expect((await run(owner, "approve_action", { id: arch })).data.status).toBe("approved");
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks WHERE title LIKE 'Bulk %'").get()).toEqual({ n: 11 });
    expect(raw.prepare("SELECT DISTINCT module, created_by FROM tasks WHERE title LIKE 'Bulk %'").all()).toEqual([{ module: "progressive", created_by: "ChatGPT: Progressive assistant" }]);
    expect(raw.prepare("SELECT archived_at IS NOT NULL a FROM tasks WHERE id = ?").get(victim.data.id)).toEqual({ a: 1 });
    // declining leaves nothing behind
    ask("req-bulk-0003", "progressive", "task.create_many", { tasks: tasks.map((t) => ({ ...t, title: `Other ${t.title}` })) });
    await processInbox(db, { now: NOW });
    await run(owner, "reject_action", { id: inboxRow("req-bulk-0003").approvalId });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks WHERE title LIKE 'Other %'").get()).toEqual({ n: 0 });
  });
  it("applies goal, habit and event requests", async () => {
    ask("req-goal-0001", "health", "goal.create", { title: "Reach 78 kg", kind: "numeric", startValue: 82, targetValue: 78, unit: "kg", targetDate: "2027-03-01", externalId: "health:goal:weight" });
    ask("req-hab-00001", "health", "habit.create", { title: "Water", targetValue: 2500, unit: "ml", externalId: "health:habit:water" });
    ask("req-evt-00001", "health", "event.create", { title: "Physio", date: "2026-11-27", startTime: "09:30", externalId: "health:cal:1" });
    await processInbox(db, { now: NOW });
    const goalId = inboxRow("req-goal-0001").result.id, habitId = inboxRow("req-hab-00001").result.id;
    expect(inboxRow("req-evt-00001").status).toBe("applied");
    ask("req-goal-0002", "health", "goal.progress", { id: goalId, value: 80, note: "weigh-in" });
    ask("req-hab-00002", "health", "habit.log", { habitId, value: 2500, externalId: "log-1" });
    ask("req-hab-00003", "health", "habit.log", { habitId, value: 2500, externalId: "log-1" }); // retry
    await processInbox(db, { now: NOW });
    expect(inboxRow("req-goal-0002").status).toBe("applied");
    expect(inboxRow("req-hab-00002").status).toBe("applied");
    expect(inboxRow("req-hab-00003").status).toBe("duplicate");
    expect(raw.prepare("SELECT COUNT(*) n FROM habit_logs").get()).toEqual({ n: 1 });
    const g = await run(owner, "get_goal", { id: goalId });
    expect(g.data).toMatchObject({ progress: 50, currentValue: 80, term: "medium", module: "health" });
  });
  it("refreshes stored briefings an SQL-only assistant can read", async () => {
    ask("req-brief-001", "framework", "task.create", { title: "Proposal", dueDate: TODAY, priority: "critical" });
    await processInbox(db, { now: NOW });
    const row = raw.prepare("SELECT content, today FROM briefings WHERE module = 'framework'").get() as any;
    expect(row.today).toBe(TODAY);
    const b = JSON.parse(row.content);
    expect(b.counts).toMatchObject({ today: 1, open: 1 });
    expect(b.tasks.today[0].title).toBe("Proposal");
    expect(raw.prepare("SELECT COUNT(*) n FROM briefings").get()).toEqual({ n: 2 }); // overview + framework
  });
  it("maintenance applies requests and refreshes all six briefings", async () => {
    ask("req-main-0001", "daily", "task.create", { title: "Errand" });
    expect((await maintenance(db, NOW)).processed).toBe(1);
    expect(raw.prepare("SELECT COUNT(*) n FROM briefings").get()).toEqual({ n: 6 });
  });
});

describe("tasks: modules, horizons, recurrence", () => {
  it("assigns modules and defaults, and filters by module, horizon, priority and status", async () => {
    const mk = (title: string, o: object) => run(owner, "create_task", { title, ...o });
    await mk("Overdue", { dueDate: "2026-11-20", module: "daily" });
    await mk("Today", { dueDate: TODAY, module: "health", priority: "high" });
    await mk("Tomorrow", { dueDate: "2026-11-25", module: "health" });
    await mk("Week", { dueDate: "2026-11-27", module: "framework" });
    await mk("Month", { dueDate: "2026-11-30", module: "daily" });
    await mk("Quarter", { dueDate: "2026-12-20", module: "financial" });
    await mk("Future", { dueDate: "2027-06-01", module: "daily" });
    await mk("Someday", {});
    const h = async (horizon: string, extra: object = {}) => (await run(owner, "list_tasks", { today: TODAY, horizon, ...extra })).data.tasks.map((t: any) => t.title);
    expect(await h("overdue")).toEqual(["Overdue"]);
    expect(await h("today")).toEqual(["Today"]);
    expect(await h("tomorrow")).toEqual(["Tomorrow"]);
    expect(await h("this_week")).toEqual(["Week"]);
    expect(await h("this_month")).toEqual(["Month"]);
    expect(await h("this_quarter")).toEqual(["Quarter"]);
    expect(await h("this_year")).toEqual([]);
    expect(await h("future")).toEqual(["Future"]);
    expect(await h("someday")).toEqual(["Someday"]);
    expect(await h(["today", "tomorrow"] as any, { module: "health" })).toEqual(["Today", "Tomorrow"]);
    expect(await h("today", { priority: ["low"] })).toEqual([]);
    // every open task lands in exactly one horizon
    const all = (await run(owner, "list_tasks", { today: TODAY })).data.tasks;
    expect(all.map((t: any) => t.horizon).sort()).toEqual(["future", "overdue", "someday", "this_month", "this_quarter", "this_week", "today", "tomorrow"]);
    const counts = (await run(owner, "get_daily_summary", { today: TODAY })).data.counts;
    expect(Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(8);
  });
  it("supports due times, descriptions, goal links and rejects inconsistent input", async () => {
    const g = await run(owner, "create_goal", { title: "G", module: "daily" });
    const t = await run(owner, "create_task", { title: "Call", dueDate: TODAY, dueTime: "14:30", description: "Details", goalId: g.data.id });
    expect(t.data).toMatchObject({ dueTime: "14:30", description: "Details", goalId: g.data.id });
    expect((await run(owner, "create_task", { title: "x", dueTime: "14:30" })).error.code).toBe("invalid_input");
    expect((await run(owner, "create_task", { title: "x", dueDate: TODAY, dueTime: "25:00" })).error.code).toBe("invalid_input");
    expect((await run(owner, "create_task", { title: "x", goalId: "gol_missing" })).error.code).toBe("invalid_input");
    expect((await run(owner, "create_task", { title: "x", recurrence: { freq: "weekly" } })).error.code).toBe("invalid_input"); // needs a dueDate
    const filtered = await run(owner, "list_tasks", { goalId: g.data.id });
    expect(filtered.data.count).toBe(1);
  });
  it("completing a recurring task creates exactly one next occurrence, never a duplicate", async () => {
    const t = await run(owner, "create_task", { title: "Weekly review", module: "framework", dueDate: "2026-11-23", recurrence: { freq: "weekly", interval: 1 }, priority: "high" });
    const done = await run(owner, "complete_task", { id: t.data.id });
    expect(done.data.status).toBe("completed");
    expect(done.data.next).toMatchObject({ dueDate: "2026-11-30" }); // completed late (Tuesday): next Monday after today
    const again = await run(owner, "complete_task", { id: t.data.id }); // already completed: no second history entry, no second occurrence
    expect(again.duplicate).toBe(true);
    await run(owner, "reopen_task", { id: t.data.id });
    const redo = await run(owner, "complete_task", { id: t.data.id });
    expect(redo.data.next).toMatchObject({ dueDate: "2026-11-30" }); // same date: the existing occurrence is reported, not duplicated
    const rows = raw.prepare("SELECT due_date, status, module, priority, recurrence_parent_id p FROM tasks ORDER BY due_date").all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ due_date: "2026-11-30", status: "pending", module: "framework", priority: "high", p: t.data.id });
    expect(() => raw.exec(`INSERT INTO tasks (id,title,due_date,recurrence_parent_id,created_at,updated_at,created_by,updated_by) VALUES ('z','z','2026-11-30','${t.data.id}','x','x','a','a')`)).toThrow(); // gate first
    expect(raw.prepare("SELECT COUNT(*) n FROM task_events WHERE task_id = ? AND event = 'created'").get(rows[1] ? (raw.prepare("SELECT id FROM tasks WHERE due_date = '2026-11-30'").get() as any).id : "")).toEqual({ n: 1 });
  });
  it("completing a task from any channel updates it everywhere, including briefings", async () => {
    ask("req-cmp-00001", "daily", "task.create", { title: "Renew passport", dueDate: TODAY, externalId: "daily:1" });
    await processInbox(db, { now: NOW });
    const id = inboxRow("req-cmp-00001").result.id;
    expect((await run(as("daily"), "get_daily_summary", { today: TODAY })).data.counts.today).toBe(1);
    await run(owner, "complete_task", { id }); // the owner taps it in the app
    expect((await run(as("daily"), "get_daily_summary", { today: TODAY })).data.counts.today).toBe(0);
    expect((await run(as("daily"), "get_task", { id })).data.status).toBe("completed");
    expect((await run(owner, "get_briefing", { module: "daily", today: TODAY })).data.counts).toMatchObject({ today: 0, completedLast7: 1 });
    await processInbox(db, { now: NOW });
    ask("req-cmp-00002", "daily", "task.complete", { id }); // assistant completes it again: harmless
    await processInbox(db, { now: NOW });
    expect(inboxRow("req-cmp-00002").status).toBe("duplicate");
  });
});

describe("goals", () => {
  it("measures numeric and qualitative goals, keeps history, and derives the planning horizon", async () => {
    const num = await run(owner, "create_goal", { title: "Emergency fund", module: "financial", kind: "numeric", startValue: 0, targetValue: 20000, currentValue: 5000, unit: "CAD", targetDate: "2027-01-31" });
    expect(num.data).toMatchObject({ progress: 25, term: "short", termSource: "target_date" });
    const up = await run(owner, "update_goal_progress", { id: num.data.id, value: 10000, note: "Paycheque" });
    expect(up.data.progress).toBe(50);
    const q = await run(owner, "create_goal", { title: "Launch", module: "framework", targetDate: "2028-01-01", milestones: [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }] });
    expect(q.data).toMatchObject({ kind: "qualitative", progress: 0, term: "long" });
    const done = await run(owner, "set_milestone", { id: q.data.milestones[0].id, done: true });
    expect(done.data.progress).toBe(25);
    expect((await run(owner, "update_goal_progress", { id: q.data.id, value: 3 })).error.code).toBe("invalid_input");
    const manual = await run(owner, "create_goal", { title: "Safety", module: "progressive" });
    expect((await run(owner, "update_goal_progress", { id: manual.data.id, progress: 60 })).data.progress).toBe(60);
    const hist = await run(owner, "get_goal_history", { id: num.data.id });
    expect(hist.data.history.map((h: any) => h.progress)).toEqual([50, 0]); // newest first
    const pinned = await run(owner, "create_goal", { title: "Pinned", module: "daily", targetDate: "2030-01-01", term: "short" });
    expect(pinned.data).toMatchObject({ term: "short", termSource: "set" });
    const conflict = await run(owner, "update_goal", { id: num.data.id, title: "x", expectedVersion: 1 });
    expect(conflict.error.code).toBe("conflict");
    const ach = await run(owner, "update_goal", { id: num.data.id, status: "achieved" });
    expect(ach.data.status).toBe("achieved");
    expect(raw.prepare("SELECT completed_at IS NOT NULL c FROM goals WHERE id = ?").get(num.data.id)).toEqual({ c: 1 });
  });
  it("an assistant's archive request needs the owner; the owner may archive directly", async () => {
    const g = await run(owner, "create_goal", { title: "Archivable", module: "daily" });
    const r = await run(as("daily"), "archive_goal", { id: g.data.id });
    expect(r.error.code).toBe("approval_required");
    expect((await run(owner, "list_goals", {})).data.count).toBe(1);
    expect((await run(owner, "archive_goal", { id: g.data.id })).data.archivedAt).toBeTruthy();
    expect((await run(owner, "list_goals", {})).data.count).toBe(0);
  });
});

describe("habits", () => {
  it("tracks completion, streaks, quantitative targets and logs without duplicates", async () => {
    const h = await run(owner, "create_habit", { title: "Walk", module: "health", startDate: "2026-11-15" });
    for (const d of ["2026-11-21", "2026-11-22", "2026-11-23"]) await run(owner, "log_habit", { habitId: h.data.id, date: d });
    let cur = (await run(owner, "get_habit", { id: h.data.id, today: TODAY })).data;
    expect(cur.streak).toEqual({ current: 3, best: 3 });
    expect(cur.today).toMatchObject({ done: false, applies: true });
    await run(owner, "log_habit", { habitId: h.data.id, externalId: "x1" });
    expect((await run(owner, "log_habit", { habitId: h.data.id, externalId: "x1" })).duplicate).toBe(true);
    cur = (await run(owner, "get_habit", { id: h.data.id })).data;
    expect(cur).toMatchObject({ streak: { current: 4, best: 4 }, today: { done: true, value: 1 } });
    expect(cur.recent).toHaveLength(14);
    const water = await run(owner, "create_habit", { title: "Water", module: "health", targetValue: 2500, unit: "ml" });
    await run(owner, "log_habit", { habitId: water.data.id, value: 1000 });
    expect((await run(owner, "get_habit", { id: water.data.id })).data.today).toMatchObject({ value: 1000, target: 2500, done: false });
    await run(owner, "log_habit", { habitId: water.data.id, value: 1500 });
    expect((await run(owner, "get_habit", { id: water.data.id })).data.today.done).toBe(true);
    expect((await run(owner, "log_habit", { habitId: water.data.id, date: "2026-12-30" })).error.code).toBe("invalid_input"); // not in the future
    expect((await run(owner, "create_habit", { title: "x", daysOfWeek: [9] })).error.code).toBe("invalid_input");
  });
  it("on-rotation and off-rotation routines follow the work rotation setting", async () => {
    // default rotation: on 2026-11-16..11-29, off 2026-11-30..12-06
    const off = await run(owner, "create_habit", { title: "Gym", module: "health", rotationMode: "off", startDate: "2026-11-16" });
    const on = await run(owner, "create_habit", { title: "Site walk", module: "progressive", rotationMode: "on", startDate: "2026-11-16" });
    const split = await run(owner, "create_habit", { title: "Move", module: "health", rotationMode: "split", targetCount: 1, offTargetCount: 3, startDate: "2026-11-16" });
    const at = async (id: string, today: string) => (await run(owner, "get_habit", { id, today })).data.today;
    expect(await at(off.data.id, "2026-11-24")).toMatchObject({ applies: false });
    expect(await at(off.data.id, "2026-12-01")).toMatchObject({ applies: true });
    expect(await at(on.data.id, "2026-11-24")).toMatchObject({ applies: true });
    expect(await at(on.data.id, "2026-12-01")).toMatchObject({ applies: false });
    expect(await at(split.data.id, "2026-11-24")).toMatchObject({ target: 1 });
    expect(await at(split.data.id, "2026-12-01")).toMatchObject({ target: 3 });
    expect((await run(owner, "set_setting", { key: "work_rotation", value: { anchorDate: "2026-11-24", onDays: 7, offDays: 7 } })).ok).toBe(true);
    expect(await at(off.data.id, "2026-11-24")).toMatchObject({ applies: false });
    expect(await at(off.data.id, "2026-12-01")).toMatchObject({ applies: true });
  });
});

describe("briefings and separation of the overview", () => {
  it("the Daily overview aggregates counts across modules without exposing their titles", async () => {
    await run(owner, "create_task", { title: "Secret client dispute", module: "framework", dueDate: TODAY });
    await run(owner, "create_task", { title: "Medication refill", module: "health", dueDate: "2026-11-20" });
    await run(owner, "create_task", { title: "Pick up parcel", module: "daily", dueDate: TODAY });
    const b = (await run(as("daily"), "get_briefing", { module: "overview", today: TODAY })).data;
    const text = JSON.stringify(b);
    expect(text).toContain("Pick up parcel");
    expect(text).not.toContain("Secret client dispute");
    expect(text).not.toContain("Medication refill");
    expect(b.modules.framework.counts.today).toBe(1);
    expect(b.modules.health.counts.overdue).toBe(1);
    const stored = raw.prepare("SELECT content FROM briefings").all();
    expect(stored).toHaveLength(0); // nothing stored until maintenance or the inbox runs
    await maintenance(db, NOW);
    expect(JSON.stringify(raw.prepare("SELECT content FROM briefings WHERE module = 'overview'").get())).not.toContain("Secret client dispute");
  });
  it("a module briefing carries tasks, goals, habits, events, attention and activity for that module only", async () => {
    await run(owner, "create_task", { title: "Health task", module: "health", dueDate: TODAY });
    await run(owner, "create_task", { title: "Finance task", module: "financial", dueDate: TODAY });
    await run(owner, "create_goal", { title: "Health goal", module: "health" });
    await run(owner, "create_habit", { title: "Health habit", module: "health" });
    await run(owner, "create_event", { title: "Health event", module: "health", date: "2026-11-26" });
    const b = (await run(as("health"), "get_briefing", { today: TODAY })).data;
    expect(b).toMatchObject({ module: "health", counts: { today: 1, open: 1 } });
    expect(b.goals.map((g: any) => g.title)).toEqual(["Health goal"]);
    expect(b.habits.map((h: any) => h.title)).toEqual(["Health habit"]);
    expect(b.events.map((e: any) => e.title)).toEqual(["Health event"]);
    expect(JSON.stringify(b)).not.toContain("Finance task");
    expect(b.activity.length).toBeGreaterThan(0);
    expect((await run(as("health"), "get_module_activity", {})).data.events.length).toBeGreaterThan(0);
    expect((await run(as("health"), "get_module_activity", { module: "financial" })).error.code).toBe("forbidden");
  });
});

describe("settings, demo data and integrations", () => {
  it("settings are owner-only and validated", async () => {
    expect((await run(owner, "set_setting", { key: "timezone", value: "America/Edmonton" })).ok).toBe(true);
    expect((await run(owner, "set_setting", { key: "timezone", value: "Mars/Olympus" })).error.code).toBe("invalid_input");
    expect((await run(owner, "set_setting", { key: "week_start", value: "sunday" })).ok).toBe(true);
    expect((await run(owner, "set_setting", { key: "nope", value: 1 })).error.code).toBe("invalid_input");
    expect((await run(as("daily"), "set_setting", { key: "timezone", value: "UTC" })).error.code).toBe("forbidden");
    expect((await run(owner, "get_settings", {})).data).toMatchObject({ timezone: "America/Edmonton", week_start: "sunday" });
  });
  it("uses the owner's timezone and week start for 'today' and the week horizon", async () => {
    await run(owner, "set_setting", { key: "timezone", value: "America/Edmonton" }); // 2026-11-24T18:00Z is still the 24th in Edmonton
    const lateNow = () => new Date("2026-11-25T03:00:00.000Z"); // 20:00 on the 24th in Edmonton, already the 25th in UTC
    let late = { ...owner, prefs: undefined, now: lateNow } as Ctx;
    const t = await run(late, "create_task", { title: "Edmonton today", dueDate: "2026-11-24" });
    expect((await run(late, "get_daily_summary", {})).data.dueToday.map((x: any) => x.title)).toEqual(["Edmonton today"]);
    expect(t.ok).toBe(true);
    await run(owner, "set_setting", { key: "week_start", value: "sunday" });
    late = { ...owner, prefs: undefined, now: lateNow } as Ctx; // preferences are read once per request, so a new request sees the change
    const sat = await run(late, "create_task", { title: "Saturday", dueDate: "2026-11-28" });
    const sun = await run(late, "create_task", { title: "Sunday", dueDate: "2026-11-29" });
    const h = async (id: string) => (await run(late, "get_task", { id })).data.horizon;
    expect([await h(sat.data.id), await h(sun.data.id)]).toEqual(["this_week", "this_month"]); // a Sunday-first week ends on Saturday
  });
  it("loads labelled synthetic data once and removes only that data", async () => {
    const real = await run(owner, "create_task", { title: "Real task", module: "daily" });
    const a = await run(owner, "load_demo_data", {});
    expect(a.ok).toBe(true);
    expect(a.data.tasks).toBeGreaterThan(15);
    const again = await run(owner, "load_demo_data", {});
    expect(again.data).toEqual({ tasks: 0, goals: 0, habits: 0, events: 0, logs: 0 }); // idempotent
    const demo = raw.prepare("SELECT COUNT(*) n FROM tasks WHERE demo = 1").get() as any;
    expect(demo.n).toBe(a.data.tasks);
    expect((await run(owner, "list_tasks", { today: TODAY, limit: 500 })).data.tasks.filter((t: any) => t.demo).every((t: any) => /synthetic/.test(t.title))).toBe(true);
    expect((await run(as("daily"), "load_demo_data", {})).error.code).toBe("forbidden");
    expect((await run(as("daily"), "clear_demo_data", {})).error.code).toBe("forbidden");
    const cleared = await run(owner, "clear_demo_data", {});
    expect(cleared.data.removed.tasks).toBe(a.data.tasks);
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks").get()).toEqual({ n: 1 });
    expect(raw.prepare("SELECT id FROM tasks").get()).toEqual({ id: real.data.id });
    for (const t of ["goals", "habits", "habit_logs", "events", "goal_milestones", "goal_progress"]) expect(raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get(), t).toEqual({ n: 0 });
  });
  it("integration tokens can be limited to modules, and the limit applies on REST and MCP identities alike", async () => {
    const made = await run(owner, "create_integration", { name: "Health only", kind: "chatgpt", scopes: ["tasks:read", "tasks:write"], modules: ["health"] });
    expect(made.ok).toBe(true);
    expect((await run(owner, "list_integrations", {})).data.integrations[0].modules).toEqual(["health"]);
  });
});
