import { beforeEach, describe, expect, it } from "vitest";
import { makeDb } from "./d1shim";
import { processInbox } from "../worker/services/inbox";
import { runOperation } from "../worker/services/operations";
import { assistantActor } from "../worker/services/assistants";
import { ownerActor, type Ctx } from "../worker/services/types";
import { accountBalance, billOccurrences, billSummary, monthSummary, netWorth, type FinAccount, type FinBill, type FinTxn } from "../shared/finance";

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
