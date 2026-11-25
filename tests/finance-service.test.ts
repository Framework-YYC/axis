import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { processInbox } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { ownerActor, type Ctx } from "../worker/services/types";
import { accountBalance, billOccurrences, billSummary, monthSummary, netWorth, reimbursementRecon, type FinAccount, type FinBill, type FinTxn } from "../shared/finance";

const NOW = new Date("2026-11-24T18:00:00.000Z"); const TODAY = "2026-11-24";
let db: D1Database, raw: ReturnType<typeof makeDb>["raw"], owner: Ctx, fin: Ctx;
const ctxFor = (a: Ctx["actor"]): Ctx => ({ db, actor: a, requestId: "t", now: () => NOW });
const run = (c: Ctx, op: string, input: unknown = {}) => runOperation(c, op, input) as Promise<any>;
const up = (c: Ctx, kind: string, i: object) => run(c, "upsert_finance_record", { kind, ...i });
beforeEach(() => { const m = makeDb(); db = m.db; raw = m.raw; owner = ctxFor(ownerActor("web")); fin = ctxFor(assistantActor("financial")); });

async function world() {
  const mk = async (key: string, o: object) => (await up(fin, "account", { key, ...o })).data.record.id as string;
  const chq = await mk("a:chq", { name: "Chequing", type: "bank" }), sav = await mk("a:sav", { name: "Savings", type: "savings", target: 5000 });
  const visa = await mk("a:visa", { name: "Visa", type: "credit_card", creditLimit: 6000, statementDay: 18, dueDay: 12 }), loan = await mk("a:loan", { name: "Loan", type: "loan", originalPrincipal: 21000, interestRate: 5.9 });
  return { chq, sav, visa, loan };
}

describe("access and idempotency", () => {
  it("only the Financial assistant (or the owner) can touch finance records", async () => {
    expect((await up(ctxFor(assistantActor("health")), "account", { key: "x", name: "N", type: "bank" })).error.code).toBe("forbidden");
    expect((await run(ctxFor(assistantActor("daily")), "get_finance", {})).ok).toBe(false);
    expect((await up(fin, "account", { key: "a:1", name: "Chequing", type: "bank" })).ok).toBe(true);
    expect((await run(owner, "get_finance", { today: TODAY })).data.accounts.length).toBe(1);
  });
  it("the same key never duplicates; changes update only what changed", async () => {
    const a = await up(fin, "account", { key: "a:1", name: "Chequing", type: "bank" }); expect(a.data.outcome).toBe("created");
    const b = await up(fin, "account", { key: "a:1", name: "Chequing", type: "bank" }); expect(b.data.outcome).toBe("unchanged"); expect(b.duplicate).toBe(true);
    const c = await up(fin, "account", { key: "a:1", institution: "Test Bank" }); expect(c.data).toMatchObject({ outcome: "updated", record: { institution: "Test Bank", name: "Chequing" } });
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_accounts").get()).toMatchObject({ n: 1 });
  });
  it("applies through the assistant inbox as task.create with a finance block, idempotently", async () => {
    const ask = (id: string) => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?,?,?,?)").run(id, "financial", "task.create", JSON.stringify({ key: "fin:a:1", sourceRef: "Statement", finance: { kind: "account", name: "Chequing", type: "bank" } }));
    ask("req-f-00000001"); ask("req-f-00000002"); await processInbox(db, { now: NOW });
    const rows = raw.prepare("SELECT status, result FROM assistant_inbox ORDER BY id").all() as any[]; expect(rows.map((r) => r.status)).toEqual(["applied", "duplicate"]); expect(JSON.parse(rows[0].result).outcome).toBe("created");
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_accounts").get()).toMatchObject({ n: 1 });
    raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?,?,?,?)").run("req-f-00000003", "health", "task.create", JSON.stringify({ key: "x", finance: { kind: "account", name: "N", type: "bank" } })); await processInbox(db, { now: NOW });
    expect((raw.prepare("SELECT status FROM assistant_inbox WHERE id = 'req-f-00000003'").get() as any).status).toBe("rejected"); // module separation
  });
  it("finance tables are write-guarded", () => { expect(() => raw.exec("INSERT INTO fin_budgets (id,category_id,amount_minor,created_at,updated_at,updated_by) VALUES ('x','fcat_other',1,'a','a','a')")).toThrow(/blocked/); });
});

describe("money handling", () => {
  it("accepts dollars or cents, never floats or invented values, and CAD only", async () => {
    const { chq } = await world();
    const t = await up(fin, "transaction", { key: "t:1", account: chq, date: "2026-11-20", amount: -12.5, payee: "Cafe", category: "Dining out" });
    expect(t.data.record).toMatchObject({ amountMinor: -1250, kind: "expense" }); expect((await up(fin, "transaction", { key: "t:2", account: chq, date: "2026-11-20", amountMinor: -1250.5 })).ok).toBe(false);
    expect((await up(fin, "transaction", { key: "t:3", account: chq, date: "2026-11-20", amount: 0.001 })).ok).toBe(false); expect((await up(fin, "transaction", { key: "t:4", account: chq, date: "2026-11-20", amount: 0 })).ok).toBe(false);
    expect((await up(fin, "transaction", { key: "t:5", account: "No such account", date: "2026-11-20", amount: -5 })).ok).toBe(false); expect(() => raw.exec("UPDATE write_gate SET open = 1; UPDATE fin_accounts SET currency = 'USD'; UPDATE write_gate SET open = 0")).toThrow();
  });
  it("a card or loan balance is what is owed (negative); the same balance twice is unchanged; a new one on the same day updates", async () => {
    const { visa, chq } = await world();
    expect((await up(fin, "balance", { account: visa, asOf: "2026-11-20", amount: 2300 })).ok).toBe(false);
    expect((await up(fin, "balance", { account: visa, asOf: "2026-11-20", amount: -2300 })).data.outcome).toBe("created"); expect((await up(fin, "balance", { account: visa, asOf: "2026-11-20", amount: -2300 })).data.outcome).toBe("unchanged");
    expect((await up(fin, "balance", { account: visa, asOf: "2026-11-20", amount: -2250.5 })).data.outcome).toBe("updated"); expect(raw.prepare("SELECT COUNT(*) n FROM fin_balances").get()).toMatchObject({ n: 1 });
    await up(fin, "balance", { account: chq, asOf: "2026-11-20", amount: 3000, basis: "estimate" });
    const f = (await run(owner, "get_finance", { today: TODAY })).data; expect(f.balances.find((b: any) => b.accountId === chq).kind).toBe("estimate");
  });
});

describe("transactions, transfers and totals never double count", () => {
  it("derives kinds, excludes transfers and debt payments from spending, and keeps balances consistent", async () => {
    const { chq, sav, visa, loan } = await world();
    for (const [a, id] of [[chq, 300000], [sav, 100000], [visa, -100000], [loan, -1500000]] as const) await up(fin, "balance", { account: a, asOf: "2026-11-01", amountMinor: id });
    const T = (key: string, o: object) => up(fin, "transaction", { key, date: "2026-11-10", ...o });
    expect((await T("t:pay", { account: chq, amount: 4000, payee: "Employer", category: "Salary" })).data.record.kind).toBe("income");
    expect((await T("t:card", { account: visa, amount: -100, payee: "Shop", category: "Personal" })).data.record.kind).toBe("expense");
    expect((await T("t:cardpay", { account: chq, counterAccount: visa, amount: -100 })).data.record.kind).toBe("card_payment");
    expect((await T("t:loanpay", { account: chq, counterAccount: loan, amount: -420 })).data.record.kind).toBe("loan_payment");
    expect((await T("t:xfer", { account: chq, counterAccount: sav, amount: -500 })).data.record.kind).toBe("transfer");
    expect((await T("t:same", { account: chq, counterAccount: chq, amount: -5 })).ok).toBe(false);
    const f = (await run(owner, "get_finance", { today: TODAY })).data; const txns: FinTxn[] = f.transactions; const s = monthSummary(txns, "2026-11");
    expect(s).toMatchObject({ income: 400000, spending: 10000, debtRepaid: 52000, transfers: 50000, net: 390000 });
    const bal = (id: string) => accountBalance(id, f.balances, txns); const accs: FinAccount[] = f.accounts;
    expect(bal(chq).amountMinor).toBe(300000 + 400000 - 10000 - 42000 - 50000); expect(bal(sav).amountMinor).toBe(150000); expect(bal(visa).amountMinor).toBe(-100000 - 10000 + 10000); expect(bal(loan).amountMinor).toBe(-1500000 + 42000);
    expect(netWorth(accs, bal).net).toBe(bal(chq).amountMinor! + 150000 - 100000 - 1458000);
  });
  it("an unkeyed transaction that an assistant later reports with a key is adopted, not doubled; the owner can enter two identical purchases", async () => {
    const { chq } = await world();
    await run(owner, "create_finance_record", { kind: "transaction", account: chq, date: "2026-11-12", amount: -45.2, payee: "Grocer" });
    const r = await up(fin, "transaction", { key: "bank:123", account: chq, date: "2026-11-12", amount: -45.2, payee: "grocer" }); expect(r.data.outcome).toBe("updated");
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions").get()).toMatchObject({ n: 1 });
    await run(owner, "create_finance_record", { kind: "transaction", account: chq, date: "2026-11-13", amount: -3, payee: "Cafe" }); await run(owner, "create_finance_record", { kind: "transaction", account: chq, date: "2026-11-13", amount: -3, payee: "Cafe" });
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions").get()).toMatchObject({ n: 3 });
  });
  it("a reimbursement received is neither income nor spending, and marks the claim received", async () => {
    const { chq } = await world();
    await up(fin, "transaction", { key: "t:exp", account: chq, date: "2026-11-02", amount: -300, payee: "Hotel", category: "Other", reimbursable: true });
    const r = (await up(fin, "reimbursement", { key: "r:1", description: "Hotel", amount: 300, payer: "Employer", claimedOn: "2026-11-03" })).data.record.id;
    const f0 = (await run(owner, "get_finance", { today: TODAY })).data; expect(f0.reimbursements[0].status).toBe("outstanding");
    await up(fin, "transaction", { key: "t:rec", account: chq, date: "2026-11-20", amount: 300, payee: "Employer", reimbursement: r });
    const f = (await run(owner, "get_finance", { today: TODAY })).data; expect(f.reimbursements[0]).toMatchObject({ status: "received" });
    expect(monthSummary(f.transactions, "2026-11")).toMatchObject({ income: 0, grossSpending: 30000, reimbursed: 30000, spending: 0, net: 0 });
  });
});

describe("paying a bill", () => {
  async function bills() {
    const w = await world();
    const rent = (await up(fin, "bill", { key: "b:rent", name: "Rent", amount: 2200, account: w.chq, category: "Housing", recurrence: { freq: "monthly", interval: 1, byMonthDay: 1 }, anchorDate: "2026-09-01" })).data.record.id;
    const hydro = (await up(fin, "bill", { key: "b:hydro", name: "Electricity", account: w.chq, category: "Utilities", recurrence: { freq: "monthly", interval: 1, byMonthDay: 15 }, anchorDate: "2026-09-15" })).data.record;
    const car = (await up(fin, "bill", { key: "b:car", name: "Vehicle loan", amount: 420, account: w.chq, counterAccount: w.loan, recurrence: { freq: "monthly", interval: 1, byMonthDay: 27 }, anchorDate: "2026-09-27" })).data.record.id;
    return { ...w, rent, hydro: hydro.id, car, hydroKind: hydro.amountKind };
  }
  it("a fixed bill records one payment and one transaction, however many times it is confirmed", async () => {
    const b = await bills();
    const p = await run(owner, "pay_bill", { today: TODAY, bill: b.rent, dueDate: "2026-11-01" }); expect(p.data).toMatchObject({ status: "paid" }); expect(p.data.transactionId).toBeTruthy();
    const again = await run(owner, "pay_bill", { today: TODAY, bill: "Rent", dueDate: "2026-11-01" }); expect(again.duplicate).toBe(true); expect(again.data.transactionId).toBe(p.data.transactionId);
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions WHERE bill_id = ?").get(b.rent)).toMatchObject({ n: 1 }); expect(raw.prepare("SELECT COUNT(*) n FROM fin_bill_payments").get()).toMatchObject({ n: 1 });
    expect(raw.prepare("SELECT amount_minor, kind, category_id FROM fin_transactions WHERE bill_id = ?").get(b.rent)).toMatchObject({ amount_minor: -220000, kind: "expense", category_id: "fcat_housing" });
    // the assistant reporting the same payment from the bank feed does not create a second transaction
    const dup = await up(fin, "transaction", { key: "bank:rent", account: b.chq, date: "2026-11-01", amount: -2200, payee: "Rent", bill: b.rent, billDue: "2026-11-01" }); expect(dup.duplicate).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions").get()).toMatchObject({ n: 1 });
  });
  it("a bill with no fixed amount needs the amount actually paid; a debt payment is a repayment, not spending", async () => {
    const b = await bills(); expect(b.hydroKind).toBe("estimate");
    expect((await run(owner, "pay_bill", { today: TODAY, bill: b.hydro, dueDate: "2026-11-15" })).ok).toBe(false);
    expect((await run(owner, "pay_bill", { today: TODAY, bill: b.hydro, dueDate: "2026-11-15", amount: 124.15 })).data.status).toBe("paid");
    await run(owner, "pay_bill", { today: TODAY, bill: b.car, dueDate: "2026-11-27", paidOn: "2026-11-24" });
    const f = (await run(owner, "get_finance", { today: TODAY })).data; const s = monthSummary(f.transactions, "2026-11");
    expect(s).toMatchObject({ grossSpending: 12415, debtRepaid: 42000 }); expect(f.transactions.find((t: any) => t.billId === b.car).kind).toBe("loan_payment");
  });
  it("skipping records no transaction; a linked financial task is completed with the payment; a completed task alone also reads as paid", async () => {
    const b = await bills();
    expect((await run(owner, "pay_bill", { today: TODAY, bill: b.rent, dueDate: "2026-12-01", skip: true })).data).toMatchObject({ status: "skipped", transactionId: null });
    const task = (await run(owner, "create_task", { title: "Pay vehicle loan", module: "financial", dueDate: "2026-11-27", recordRef: `bill:${b.car}` })).data.id;
    const p = await run(owner, "pay_bill", { today: TODAY, bill: b.car, dueDate: "2026-11-27" }); expect(p.data.taskCompleted).toBe(true);
    expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(task)).toMatchObject({ status: "completed" });
    const task2 = (await run(owner, "create_task", { title: "Pay electricity", module: "financial", dueDate: "2026-11-15", recordRef: `bill:${b.hydro}` })).data.id; await run(owner, "complete_task", { id: task2, today: TODAY });
    const f = (await run(owner, "get_finance", { today: TODAY })).data; const done = new Set<string>(f.taskLinks.filter((l: any) => l.status === "completed").map((l: any) => `${l.billId}:${l.dueDate}`));
    const occ = billOccurrences(f.bills as FinBill[], f.payments, "2026-11", TODAY, done); expect(occ.find((o) => o.name === "Electricity")).toMatchObject({ status: "paid", viaTask: true });
    expect(billSummary(occ)).toMatchObject({ total: 3, paid: 2 });
  });
  it("is available to the assistant as a bill_payment record", async () => {
    const b = await bills(); const r = await up(fin, "bill_payment", { bill: "Rent", dueDate: "2026-11-01" }); expect(r.ok).toBe(true); expect((await up(fin, "bill_payment", { bill: "Rent", dueDate: "2026-11-01" })).duplicate).toBe(true); void b;
  });
});

describe("synthetic demonstration data", () => {
  it("loads clearly flagged data whose totals respect the rules, and removes it completely", async () => {
    const r = await run(owner, "load_demo_data", { today: TODAY }); expect(r.ok).toBe(true); expect(r.data.finance).toBeGreaterThan(40);
    const f = (await run(owner, "get_finance", { today: TODAY })).data;
    expect(f.accounts.every((a: any) => a.demo && /synthetic/.test(a.name))).toBe(true); expect(f.bills.every((b: any) => b.demo && /synthetic/.test(b.name))).toBe(true);
    const s = monthSummary(f.transactions, "2026-11"); expect(s.income).toBeGreaterThan(0); expect(s.transfers).toBeGreaterThan(0); expect(s.debtRepaid).toBeGreaterThan(0);
    const occ = billOccurrences(f.bills, f.payments, "2026-11", TODAY); const sum = billSummary(occ); expect(sum.total).toBe(10); expect(sum.paid).toBeGreaterThanOrEqual(7); expect(occ.some((o) => o.status === "overdue")).toBe(true);
    expect(f.reimbursements.filter((x: any) => x.status === "outstanding").length).toBe(2); expect((await run(owner, "load_demo_data", { today: TODAY })).data.finance).toBe(0); // idempotent
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks WHERE record_ref LIKE 'bill:%'").get()).toMatchObject({ n: 1 });
    const c = await run(owner, "clear_demo_data", {}); expect(c.ok).toBe(true);
    for (const t of ["fin_accounts", "fin_transactions", "fin_bills", "fin_bill_payments", "fin_balances", "fin_budgets", "fin_income_plans", "fin_reimbursements"]) expect(raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get(), t).toMatchObject({ n: 0 });
  });
});

// ---------- corrections: edit, void, reverse, reverse a bill payment, loan split, reimbursement reconciliation ----------
const txns = (c: Ctx) => run(c, "get_finance", { today: TODAY }).then((r: any) => r.data.transactions as FinTxn[]);
const audit = (action: string) => (raw.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = ?").get(action) as { n: number }).n;
const history = (id: string) => raw.prepare("SELECT action, reason, changed, actor_label FROM fin_txn_history WHERE txn_id = ? ORDER BY id").all(id) as Array<{ action: string; reason: string | null; changed: string; actor_label: string }>;
async function spend(w: { chq: string }, key: string, amount: number, o: object = {}) { const r = await up(fin, "transaction", { key, account: w.chq, date: "2026-11-10", amount: -amount, payee: "Grocer", category: "Groceries", ...o }); expect(r.ok, JSON.stringify(r)).toBe(true); return r.data.record.id as string; }

describe("editing a transaction keeps its history", () => {
  it("records what changed, by whom, before and after, and bumps the version", async () => {
    const w = await world(); const id = await spend(w, "t:1", 50);
    const r = await run(owner, "update_finance_record", { kind: "transaction", id, amount: -62.5, payee: "Better Grocer", expectedVersion: 1 });
    expect(r.data).toMatchObject({ outcome: "updated", record: { amountMinor: -6250, payee: "Better Grocer", version: 2 } });
    const h = history(id); expect(h.map((x) => x.action)).toEqual(["edit"]); const changed = JSON.parse(h[0].changed);
    expect(changed).toEqual(expect.arrayContaining([{ field: "amountMinor", from: -5000, to: -6250 }, { field: "payee", from: "Grocer", to: "Better Grocer" }]));
    expect(audit("finance.transaction.update")).toBe(1);
    expect((await run(owner, "update_finance_record", { kind: "transaction", id, amount: -70, expectedVersion: 1 })).error.code).toBe("conflict"); // a stale edit is refused
    expect((await run(owner, "update_finance_record", { kind: "transaction", id, amount: -62.5 })).duplicate).toBe(true); // no change, no history row
    expect(history(id).length).toBe(1);
  });
  it("refuses changes that would break a bill payment or a reimbursement", async () => {
    const w = await world();
    const rent = (await up(fin, "bill", { key: "b:rent", name: "Rent", amount: 2200, account: w.chq, recurrence: { freq: "monthly", interval: 1, byMonthDay: 1 }, anchorDate: "2026-09-01" })).data.record.id;
    const p = await run(owner, "pay_bill", { today: TODAY, bill: rent, dueDate: "2026-11-01" });
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: p.data.transactionId, counterAccount: w.sav })).ok).toBe(false); // a bill payment cannot turn into a transfer
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: p.data.transactionId, amount: -2250, date: "2026-11-02" })).ok).toBe(true);
    expect(raw.prepare("SELECT amount_minor, paid_on FROM fin_bill_payments WHERE bill_id = ?").get(rent)).toMatchObject({ amount_minor: 225000, paid_on: "2026-11-02" }); // the payment follows the edit
  });
});

describe("voiding a transaction", () => {
  it("counts nowhere afterwards, keeps its reason, and refuses edits; voiding twice changes nothing", async () => {
    const w = await world();
    await up(fin, "balance", { account: w.chq, asOf: "2026-11-01", amount: 1000 });
    const keep = await spend(w, "t:keep", 30), bad = await spend(w, "t:bad", 70, { date: "2026-11-12" });
    const before = monthSummary(await txns(owner), "2026-11"); expect(before.grossSpending).toBe(10000);
    expect((await run(owner, "void_transaction", { id: bad })).ok).toBe(false); // a reason is required
    const r = await run(owner, "void_transaction", { id: bad, reason: "Entered twice", today: TODAY }); expect(r.data).toMatchObject({ status: "voided", record: { voidReason: "Entered twice", voidedBy: "Owner" } });
    const f = (await run(owner, "get_finance", { today: TODAY })).data; const s = monthSummary(f.transactions, "2026-11");
    expect(s.grossSpending).toBe(3000); expect(accountBalance(w.chq, f.balances, f.transactions).amountMinor).toBe(97000);
    expect(f.transactions.find((t: any) => t.id === bad).voidedAt).toBeTruthy(); // still listed, flagged
    expect((await run(owner, "void_transaction", { id: bad, reason: "again" })).duplicate).toBe(true);
    expect(history(bad).map((x) => x.action)).toEqual(["void"]); expect(audit("finance.transaction.void")).toBe(1);
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: bad, amount: -1 })).error.message).toMatch(/voided/);
    expect((await run(owner, "reverse_transaction", { id: bad, reason: "x" })).error.message).toMatch(/voided/);
    expect((await up(fin, "transaction", { key: "t:bad", account: w.chq, date: "2026-11-12", amount: -70 })).ok).toBe(false); // the same key cannot quietly revive it
    void keep;
  });
});

describe("reversing a transaction", () => {
  it("adds one offsetting entry; both stay, balances net to zero and totals ignore the pair", async () => {
    const w = await world(); await up(fin, "balance", { account: w.chq, asOf: "2026-11-01", amount: 1000 });
    const id = await spend(w, "t:1", 45, { date: "2026-10-28" });
    const r = await run(owner, "reverse_transaction", { id, reason: "Merchant refunded", today: TODAY }); expect(r.data).toMatchObject({ status: "reversed" }); const rid = r.data.reversalId as string;
    const f = (await run(owner, "get_finance", { today: TODAY })).data; const orig = f.transactions.find((t: any) => t.id === id), rev = f.transactions.find((t: any) => t.id === rid);
    expect(orig).toMatchObject({ reversedBy: rid, amountMinor: -4500 }); expect(rev).toMatchObject({ reversalOf: id, amountMinor: 4500, kind: "expense", date: TODAY, accountId: w.chq });
    expect(accountBalance(w.chq, f.balances, f.transactions).amountMinor).toBe(104500); // the snapshot already held the spend; the reversal (dated later) gives the money back
    expect(monthSummary(f.transactions, "2026-10").grossSpending).toBe(0); expect(monthSummary(f.transactions, "2026-11")).toMatchObject({ income: 0, grossSpending: 0 });
    expect((await run(owner, "reverse_transaction", { id, reason: "again" })).duplicate).toBe(true); expect((await run(owner, "reverse_transaction", { id, reason: "again" })).data.reversalId).toBe(rid);
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions WHERE reversal_of = ?").get(id)).toMatchObject({ n: 1 });
    expect((await run(owner, "reverse_transaction", { id: rid, reason: "undo the undo" })).ok).toBe(false); // a reversal is not itself reversed
    expect((await run(owner, "void_transaction", { id, reason: "x" })).ok).toBe(false); expect((await run(owner, "update_finance_record", { kind: "transaction", id, amount: -1 })).ok).toBe(false);
    expect(history(id).map((x) => x.action)).toEqual(["reverse"]); expect(history(rid).map((x) => x.action)).toEqual(["reversal_entry"]);
  });
  it("a reversed transfer moves both accounts back", async () => {
    const w = await world(); for (const [a, amt] of [[w.chq, 1000], [w.sav, 500]] as const) await up(fin, "balance", { account: a, asOf: "2026-11-01", amount: amt });
    const t = (await up(fin, "transaction", { key: "t:sav", account: w.chq, counterAccount: w.sav, date: "2026-11-05", amount: -200 })).data.record.id;
    let f = (await run(owner, "get_finance", { today: TODAY })).data; expect([w.chq, w.sav].map((id) => accountBalance(id, f.balances, f.transactions).amountMinor)).toEqual([80000, 70000]);
    await run(owner, "reverse_transaction", { id: t, reason: "Wrong account", today: TODAY });
    f = (await run(owner, "get_finance", { today: TODAY })).data; expect([w.chq, w.sav].map((id) => accountBalance(id, f.balances, f.transactions).amountMinor)).toEqual([100000, 50000]);
  });
});

describe("reversing a bill payment", () => {
  async function paid() {
    const w = await world();
    const rent = (await up(fin, "bill", { key: "b:rent", name: "Rent", amount: 2200, account: w.chq, category: "Housing", recurrence: { freq: "monthly", interval: 1, byMonthDay: 1 }, anchorDate: "2026-09-01" })).data.record.id as string;
    const task = (await run(owner, "create_task", { title: "Pay rent", module: "financial", dueDate: "2026-11-01", recordRef: `bill:${rent}` })).data.id as string;
    const p = await run(owner, "pay_bill", { today: TODAY, bill: rent, dueDate: "2026-11-01" });
    return { ...w, rent, task, p };
  }
  const occ = async () => { const f = (await run(owner, "get_finance", { today: TODAY })).data; const done = new Set<string>(f.taskLinks.filter((l: any) => l.status === "completed").map((l: any) => `${l.billId}:${l.dueDate}`)); return billOccurrences(f.bills, f.payments, "2026-11", TODAY, done)[0]; };
  it("makes the occurrence overdue again, voids its transaction and reopens the task it completed", async () => {
    const b = await paid(); expect((await occ()).status).toBe("paid"); expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(b.task)).toMatchObject({ status: "completed" });
    expect((await run(owner, "reverse_bill_payment", { bill: b.rent, dueDate: "2026-11-01" })).ok).toBe(false); // a reason is required
    const r = await run(owner, "reverse_bill_payment", { bill: "Rent", dueDate: "2026-11-01", reason: "Paid from the wrong account", today: TODAY }); expect(r.data).toMatchObject({ taskReopened: true, how: "void", transaction: b.p.data.transactionId });
    expect((await occ()).status).toBe("overdue");
    expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(b.task)).toMatchObject({ status: "pending" });
    expect(raw.prepare("SELECT voided_at, void_reason FROM fin_transactions WHERE id = ?").get(b.p.data.transactionId)).toMatchObject({ void_reason: expect.stringContaining("Paid from the wrong account") });
    expect(raw.prepare("SELECT reversed_at, reverse_reason FROM fin_bill_payments WHERE bill_id = ?").get(b.rent)).toMatchObject({ reverse_reason: "Paid from the wrong account" });
    expect(raw.prepare("SELECT COUNT(*) n FROM tasks WHERE record_ref = ?").get(`bill:${b.rent}`)).toMatchObject({ n: 1 });
    expect(monthSummary(await txns(owner), "2026-11").grossSpending).toBe(0);
    expect((await run(owner, "reverse_bill_payment", { bill: b.rent, dueDate: "2026-11-01", reason: "again" })).duplicate).toBe(true);
    expect(audit("finance.bill.reverse")).toBeGreaterThanOrEqual(1); expect(history(b.p.data.transactionId).map((x) => x.action)).toEqual(["void", "payment_reversed"]);
  });
  it("can be paid again once: the same payment record, a new transaction, no duplicate", async () => {
    const b = await paid(); await run(owner, "reverse_bill_payment", { bill: b.rent, dueDate: "2026-11-01", reason: "Mistake", today: TODAY });
    const again = await run(owner, "pay_bill", { today: TODAY, bill: b.rent, dueDate: "2026-11-01", paidOn: "2026-11-03" }); expect(again.data).toMatchObject({ status: "paid", paymentId: b.p.data.paymentId, taskCompleted: true }); expect(again.data.transactionId).not.toBe(b.p.data.transactionId);
    expect((await run(owner, "pay_bill", { today: TODAY, bill: b.rent, dueDate: "2026-11-01" })).duplicate).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_bill_payments").get()).toMatchObject({ n: 1 }); expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions WHERE voided_at IS NULL AND bill_id = ?").get(b.rent)).toMatchObject({ n: 1 });
    expect(monthSummary(await txns(owner), "2026-11").grossSpending).toBe(220000); expect((await occ()).status).toBe("paid");
  });
  it("leaves a task alone that the owner had already reopened or completed themselves, and reverses by reversal when asked", async () => {
    const b = await paid(); await run(owner, "reopen_task", { id: b.task, today: TODAY });
    const r = await run(owner, "reverse_bill_payment", { bill: b.rent, dueDate: "2026-11-01", reason: "Refunded", how: "reverse", today: TODAY }); expect(r.data).toMatchObject({ how: "reverse", taskReopened: false });
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_transactions WHERE reversal_of = ?").get(b.p.data.transactionId)).toMatchObject({ n: 1 }); expect((await occ()).status).toBe("overdue");
  });
  it("voiding the payment's transaction directly reverses the payment too; a task-only 'paid' can be reopened", async () => {
    const b = await paid(); await run(owner, "void_transaction", { id: b.p.data.transactionId, reason: "Entered in error", today: TODAY });
    expect((await occ()).status).toBe("overdue"); expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(b.task)).toMatchObject({ status: "pending" });
    const car = (await up(fin, "bill", { key: "b:gym", name: "Gym", amount: 40, account: b.chq, recurrence: { freq: "monthly", interval: 1, byMonthDay: 3 }, anchorDate: "2026-09-03" })).data.record.id;
    const t2 = (await run(owner, "create_task", { title: "Pay gym", module: "financial", dueDate: "2026-11-03", recordRef: `bill:${car}` })).data.id; await run(owner, "complete_task", { id: t2, today: TODAY });
    expect((await run(owner, "reverse_bill_payment", { bill: car, dueDate: "2026-11-03", reason: "Not actually paid", today: TODAY })).data.taskReopened).toBe(true);
    expect(raw.prepare("SELECT status FROM tasks WHERE id = ?").get(t2)).toMatchObject({ status: "pending" });
  });
});

describe("loan payments: principal and interest", () => {
  async function loanBill() {
    const w = await world(); await up(fin, "balance", { account: w.chq, asOf: "2026-11-01", amount: 3000 }); await up(fin, "balance", { account: w.loan, asOf: "2026-11-01", amount: -14400 });
    const car = (await up(fin, "bill", { key: "b:car", name: "Vehicle loan", amount: 420, account: w.chq, counterAccount: w.loan, recurrence: { freq: "monthly", interval: 1, byMonthDay: 27 }, anchorDate: "2026-09-27" })).data.record.id;
    return { ...w, car };
  }
  it("splits a bill payment: principal reduces the loan, interest is spending, net worth falls by the interest only", async () => {
    const b = await loanBill();
    expect((await run(owner, "pay_bill", { today: TODAY, bill: b.car, dueDate: "2026-11-27", principal: 300, interest: 100 })).ok).toBe(false); // does not add up to 420
    const p = await run(owner, "pay_bill", { today: TODAY, bill: b.car, dueDate: "2026-11-27", paidOn: "2026-11-24", interest: 70.8 }); expect(p.ok).toBe(true);
    const f = (await run(owner, "get_finance", { today: TODAY })).data; const t = f.transactions.find((x: any) => x.id === p.data.transactionId);
    expect(t).toMatchObject({ kind: "loan_payment", amountMinor: -42000, principalMinor: 34920, interestMinor: 7080 });
    expect(monthSummary(f.transactions, "2026-11")).toMatchObject({ debtRepaid: 34920, interestPaid: 7080, grossSpending: 7080 });
    expect(accountBalance(b.loan, f.balances, f.transactions).amountMinor).toBe(-1440000 + 34920); expect(accountBalance(b.chq, f.balances, f.transactions).amountMinor).toBe(300000 - 42000);
    const nw = netWorth(f.accounts as FinAccount[], (id) => accountBalance(id, f.balances, f.transactions)); const was = netWorth(f.accounts as FinAccount[], (id) => accountBalance(id, f.balances, []));
    expect(nw.net - was.net).toBe(-7080);
  });
  it("an unsplit payment is all principal and flagged; a later edit can add the split and rejects one that does not add up", async () => {
    const b = await loanBill(); const t = (await up(fin, "transaction", { key: "t:loan", account: b.chq, counterAccount: b.loan, date: "2026-11-20", amount: -420 })).data.record.id;
    let f = (await run(owner, "get_finance", { today: TODAY })).data; expect(monthSummary(f.transactions, "2026-11")).toMatchObject({ debtRepaid: 42000, interestPaid: 0, loanNotSplit: 1 });
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: t, principal: 350, interest: 80 })).ok).toBe(false);
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: t, principal: 349.2 })).data.record).toMatchObject({ principalMinor: 34920, interestMinor: 7080 });
    f = (await run(owner, "get_finance", { today: TODAY })).data; expect(monthSummary(f.transactions, "2026-11")).toMatchObject({ debtRepaid: 34920, interestPaid: 7080, loanNotSplit: 0 });
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: t, amount: -430 })).ok).toBe(false); // the total changed, so the split must be restated
    expect((await run(owner, "update_finance_record", { kind: "transaction", id: t, amount: -430, principal: 350 })).data.record).toMatchObject({ principalMinor: 35000, interestMinor: 8000 });
    expect(JSON.parse(history(t).slice(-1)[0].changed)).toEqual(expect.arrayContaining([{ field: "principalMinor", from: 34920, to: 35000 }]));
    const w = await world(); void w;
  });
  it("principal and interest are refused on anything that is not a payment on a loan", async () => {
    const w = await world(); expect((await up(fin, "transaction", { key: "t:x", account: w.chq, date: "2026-11-05", amount: -10, principal: 5, interest: 5 })).ok).toBe(false);
  });
  it("reversing a split payment puts the principal back on the loan", async () => {
    const b = await loanBill(); const t = (await up(fin, "transaction", { key: "t:loan", account: b.chq, counterAccount: b.loan, date: "2026-11-20", amount: -420, principal: 349.2 })).data.record.id;
    await run(owner, "reverse_transaction", { id: t, reason: "Bank returned the payment", today: TODAY });
    const f = (await run(owner, "get_finance", { today: TODAY })).data; expect(accountBalance(b.loan, f.balances, f.transactions).amountMinor).toBe(-1440000); expect(accountBalance(b.chq, f.balances, f.transactions).amountMinor).toBe(300000);
    expect(monthSummary(f.transactions, "2026-11")).toMatchObject({ debtRepaid: 0, interestPaid: 0 });
  });
});

describe("reimbursements reconcile against their expenses", () => {
  async function claimed() {
    const w = await world(); await up(fin, "balance", { account: w.chq, asOf: "2026-11-01", amount: 1000 });
    const exp = await spend(w, "t:trip", 400, { payee: "Conference travel", category: "Other", reimbursable: true }), exp2 = await spend(w, "t:meal", 60, { payee: "Client dinner" });
    const c = await up(fin, "reimbursement", { key: "r:trip", description: "Trip", amount: 460, payer: "Employer", claimedOn: "2026-11-11", expenses: [{ txn: exp, amount: 400 }, { txn: "t:meal" }] });
    expect(c.ok, JSON.stringify(c)).toBe(true); return { ...w, exp, exp2, claim: c.data.record.id as string };
  }
  it("links one claim to several expenses, replaceable and audited; refuses to claim more than was spent", async () => {
    const w = await claimed();
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_reimbursement_links WHERE reimbursement_id = ?").get(w.claim)).toMatchObject({ n: 2 });
    expect(raw.prepare("SELECT reimbursable FROM fin_transactions WHERE id = ?").get(w.exp2)).toMatchObject({ reimbursable: 1 });
    expect((await up(fin, "reimbursement", { key: "r:trip", expenses: [{ txn: w.exp, amount: 500 }] })).ok).toBe(false); // more than the 400 it cost
    expect((await up(fin, "reimbursement", { key: "r:other", description: "Other", amount: 100, expenses: [{ txn: w.exp, amount: 100 }] })).ok).toBe(false); // 400 already claimed in full
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_reimbursements").get()).toMatchObject({ n: 1 }); // a refused link leaves no half-made claim
    expect((await up(fin, "reimbursement", { key: "r:trip", expenses: [{ txn: w.exp, amount: 400 }, { txn: w.exp2 }] })).data.outcome).toBe("unchanged");
    await up(fin, "reimbursement", { key: "r:trip", expenses: [{ txn: w.exp, amount: 400 }] }); // drop the meal
    expect(raw.prepare("SELECT COUNT(*) n FROM fin_reimbursement_links").get()).toMatchObject({ n: 1 }); expect(audit("finance.reimbursement.link")).toBeGreaterThanOrEqual(2);
    expect(history(w.exp2).map((h) => h.action)).toEqual(["link", "link"]);
  });
  it("a part payment leaves the claim outstanding; the rest settles it; a voided deposit reopens it", async () => {
    const w = await claimed();
    const dep = async (key: string, amt: number) => (await up(fin, "transaction", { key, account: w.chq, date: "2026-11-18", amount: amt, payee: "Employer", reimbursement: w.claim })).data.record.id as string;
    const d1 = await dep("d:1", 200); let f = (await run(owner, "get_finance", { today: TODAY })).data;
    expect(f.reimbursements[0]).toMatchObject({ status: "outstanding", receivedTxnId: d1 }); expect(f.reconciliation.claims[0]).toMatchObject({ state: "partly_received", received: 20000, outstanding: 26000 });
    expect(f.reconciliation.expenses.find((e: any) => e.txnId === w.exp)).toMatchObject({ state: "partly_received" });
    const d2 = await dep("d:2", 260); f = (await run(owner, "get_finance", { today: TODAY })).data; expect(f.reimbursements[0].status).toBe("received"); expect(f.reconciliation.claims[0]).toMatchObject({ state: "received", outstanding: 0, overReceived: 0 });
    expect(reimbursementRecon(f.reimbursements, f.reimbursementLinks, f.transactions).claims.get(w.claim)!.state).toBe("received"); // the client derives the same answer
    const s = monthSummary(f.transactions, "2026-11"); expect(s).toMatchObject({ income: 0, reimbursed: 46000, grossSpending: 46000, spending: 0 }); // never income, spending is net
    await run(owner, "void_transaction", { id: d2, reason: "Bounced", today: TODAY }); f = (await run(owner, "get_finance", { today: TODAY })).data;
    expect(f.reimbursements[0]).toMatchObject({ status: "outstanding", receivedTxnId: d1 }); expect(f.reconciliation.claims[0].state).toBe("partly_received");
    expect((await dep("d:3", 400)) && ((await run(owner, "get_finance", { today: TODAY })).data.reconciliation.claims[0].overReceived)).toBe(14000); // over-receipt is flagged
  });
  it("lists a reimbursable expense that was never claimed", async () => {
    const w = await world(); await spend(w, "t:lonely", 25, { reimbursable: true, payee: "Parking" });
    expect((await run(owner, "get_finance", { today: TODAY })).data.reconciliation.unclaimedExpenses).toEqual([expect.objectContaining({ amount: 2500, state: "unclaimed" })]);
  });
});

describe("corrections are confined to the Financial assistant and ride the inbox", () => {
  it("another assistant is refused; the Financial assistant corrects through task.create with a finance block, idempotently", async () => {
    const w = await world(); const id = await spend(w, "t:1", 20);
    for (const op of ["void_transaction", "reverse_transaction"]) expect((await run(ctxFor(assistantActor("health")), op, { id, reason: "x" })).error.code).toBe("forbidden");
    expect((await run(ctxFor(assistantActor("daily")), "reverse_bill_payment", { bill: "x", dueDate: "2026-11-01", reason: "x" })).ok).toBe(false);
    const ask = (rid: string, finance: object, key: string) => raw.prepare("INSERT INTO assistant_inbox (id, assistant, op, payload) VALUES (?,?,?,?)").run(rid, "financial", "task.create", JSON.stringify({ key, sourceRef: "Statement", finance }));
    ask("req-v-00000001", { kind: "void_transaction", key: "t:1", reason: "Duplicate of the card statement line" }, "fin:void:1"); ask("req-v-00000002", { kind: "void_transaction", key: "t:1", reason: "Duplicate of the card statement line" }, "fin:void:1b");
    await processInbox(db, { now: NOW });
    const rows = raw.prepare("SELECT status, result FROM assistant_inbox ORDER BY id").all() as any[]; expect(rows.map((r) => r.status)).toEqual(["applied", "duplicate"]);
    expect(raw.prepare("SELECT voided_at, voided_by FROM fin_transactions WHERE id = ?").get(id)).toMatchObject({ voided_by: "ChatGPT: Financial assistant" });
    expect((await run(owner, "void_transaction", { id, reason: "x" })).duplicate).toBe(true);
    expect(raw.prepare("SELECT open FROM write_gate").get()).toMatchObject({ open: 0 });
  });
  it("every correction writes its history and audit rows with the change (a refused one writes nothing)", async () => {
    const w = await world(); const id = await spend(w, "t:1", 20); const rows = () => [(raw.prepare("SELECT COUNT(*) n FROM fin_txn_history").get() as any).n, (raw.prepare("SELECT COUNT(*) n FROM audit_log").get() as any).n];
    const before = rows(); await run(owner, "void_transaction", { id: "nope", reason: "x" }); await run(owner, "void_transaction", { id, reason: "" }); expect(rows()[0]).toBe(before[0]); expect(audit("finance.transaction.void")).toBe(0); expect(raw.prepare("SELECT voided_at FROM fin_transactions WHERE id = ?").get(id)).toMatchObject({ voided_at: null });
    await run(owner, "void_transaction", { id, reason: "ok", today: TODAY }); expect(rows()[0]).toBe(before[0] + 1); expect(audit("finance.transaction.void")).toBe(1);
    expect(() => raw.exec("UPDATE fin_txn_history SET reason = 'x'")).toThrow(); expect(() => raw.exec("INSERT INTO fin_txn_history (txn_id, at, action, actor_label) VALUES ('a','b','edit','c')")).toThrow(/blocked/);
  });
});

describe("the synthetic data shows the corrections without moving the approved figures", () => {
  it("loads a split loan payment, a linked claim, a voided and a reversed transaction and a reversed bill payment", async () => {
    await run(owner, "load_demo_data", { today: TODAY }); const f = (await run(owner, "get_finance", { today: TODAY })).data;
    const loan = f.transactions.find((t: any) => t.kind === "loan_payment"); expect(loan).toMatchObject({ principalMinor: 34920, interestMinor: 7080 });
    expect(f.reimbursementLinks).toHaveLength(1); expect(f.reconciliation.claims.find((c: any) => c.claimed === 41260)).toMatchObject({ linked: 41260, state: "outstanding" });
    expect(f.transactions.filter((t: any) => t.voidedAt).map((t: any) => t.payee)).toEqual(expect.arrayContaining(["Duplicate grocer charge (synthetic)"])); expect(f.transactions.some((t: any) => t.reversalOf)).toBe(true);
    expect(f.payments.filter((p: any) => p.reversedAt)).toHaveLength(1);
    const nov = monthSummary(f.transactions, "2026-11"); expect(nov.income).toBe(460000); // two paydays and a deposit, exactly as before the corrections existed
    const occ = billOccurrences(f.bills, f.payments, "2026-11", TODAY); expect(billSummary(occ)).toMatchObject({ total: 10 });
    expect((await run(owner, "load_demo_data", { today: TODAY })).data.finance).toBe(0); // idempotent, corrections included
    await run(owner, "clear_demo_data", {});
    for (const t of ["fin_transactions", "fin_reimbursement_links", "fin_txn_history", "fin_bill_payments"]) expect(raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get(), t).toMatchObject({ n: 0 });
  });
});
