import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accountBalance, billOccurrences, billSummary, budgetUse, countsInTotals, creditUtilization, deriveTxnKind, estimateInterest, loanProgress, loanStats, monthSummary, netWorth, netWorthSeries, nextPayday, occurrencesInMonth, projectedCash, reimbursementRecon, reimbursementsOutstanding, resolveSplit, savingsProgress, txnDeltas, type AccountType, type FinAccount, type FinBill, type FinReimb, type FinTxn } from "../shared/finance";

const acct = (id: string, type: AccountType, extra: Partial<FinAccount> = {}): FinAccount => ({ id, name: id, type, creditLimitMinor: null, statementDay: null, dueDay: null, minPaymentMinor: null, interestRate: null, originalPrincipalMinor: null, targetMinor: null, targetDate: null, archivedAt: null, ...extra });
const types = new Map<string, AccountType>([["chq", "bank"], ["sav", "savings"], ["visa", "credit_card"], ["loan", "loan"]]);
let n = 0;
const txn = (date: string, amountMinor: number, o: Partial<FinTxn> & { counter?: string; reimb?: boolean } = {}): FinTxn => {
  const counterAccountId = o.counter ?? null;
  return { id: `t${++n}`, accountId: o.accountId ?? "chq", counterAccountId, date, amountMinor, kind: deriveTxnKind({ amountMinor, counterAccountId, reimbursementId: o.reimb ? "r1" : null }, types), categoryId: o.categoryId ?? null, status: o.status ?? "confirmed", billId: o.billId ?? null, billDue: o.billDue ?? null };
};

describe("transaction kinds", () => {
  it("derives the kind from the shape of the record", () => {
    expect(deriveTxnKind({ amountMinor: 5000, counterAccountId: null }, types)).toBe("income");
    expect(deriveTxnKind({ amountMinor: -5000, counterAccountId: null }, types)).toBe("expense");
    expect(deriveTxnKind({ amountMinor: -5000, counterAccountId: "sav" }, types)).toBe("transfer");
    expect(deriveTxnKind({ amountMinor: -5000, counterAccountId: "visa" }, types)).toBe("card_payment");
    expect(deriveTxnKind({ amountMinor: -5000, counterAccountId: "loan" }, types)).toBe("loan_payment");
    expect(deriveTxnKind({ amountMinor: 5000, counterAccountId: null, reimbursementId: "r1" }, types)).toBe("reimbursement");
  });
});

describe("monthly totals never double count", () => {
  const month = "2026-11";
  it("excludes transfers, and counts a card payment as a repayment, not spending again", () => {
    const t = [
      txn("2026-11-01", 400000), // pay
      txn("2026-11-03", -10000, { accountId: "visa", categoryId: "fcat_dining" }), // charged to the card: spending, once
      txn("2026-11-10", -10000, { counter: "visa" }), // the card payment from chequing
      txn("2026-11-12", -50000, { counter: "sav" }), // transfer to savings
      txn("2026-11-15", -42000, { counter: "loan" }), // loan payment
      txn("2026-11-20", -25000, { categoryId: "fcat_groceries" }),
    ];
    const s = monthSummary(t, month);
    expect(s).toMatchObject({ income: 400000, grossSpending: 35000, spending: 35000, debtRepaid: 52000, transfers: 50000, net: 365000 });
    expect(s.byCategory.get("fcat_dining")).toBe(10000);
  });
  it("nets spending by reimbursements received and keeps them out of income; ignores other months and pending items", () => {
    const t = [txn("2026-11-04", -30000), txn("2026-11-20", 30000, { reimb: true }), txn("2026-10-30", -99900), txn("2026-11-21", -5000, { status: "pending" }), txn("2026-11-25", 100000)];
    const s = monthSummary(t, "2026-11");
    expect(s).toMatchObject({ income: 100000, grossSpending: 30000, reimbursed: 30000, spending: 0, net: 100000, pending: 1 });
  });
  it("bins income and spending across the month", () => {
    const s = monthSummary([txn("2026-11-01", 1000), txn("2026-11-30", 2000)], "2026-11");
    expect(s.incomeBins.length).toBe(16); expect(s.incomeBins[0]).toBe(1000); expect(s.incomeBins[14]).toBe(2000);
  });
});

describe("bills and their payment status", () => {
  const rent: FinBill = { id: "rent", name: "Rent", amountMinor: 220000, amountKind: "fixed", accountId: "chq", counterAccountId: null, categoryId: "fcat_housing", recurrence: { freq: "monthly", interval: 1, byMonthDay: 1 }, anchorDate: "2026-09-01", active: true };
  const car: FinBill = { ...rent, id: "car", name: "Vehicle", amountMinor: 42000, recurrence: { freq: "monthly", interval: 1, byMonthDay: 27 }, anchorDate: "2026-09-27", counterAccountId: "loan" };
  const hydro: FinBill = { ...rent, id: "hydro", name: "Electricity", amountMinor: null, amountKind: "estimate", recurrence: { freq: "monthly", interval: 1, byMonthDay: 15 }, anchorDate: "2026-09-15" };
  const biweekly: FinBill = { ...rent, id: "gym", name: "Gym", amountMinor: 2000, recurrence: { freq: "weekly", interval: 2, byWeekday: [5] }, anchorDate: "2026-11-06" };
  it("finds the actual due dates in a month", () => {
    expect(occurrencesInMonth(car, "2026-11")).toEqual(["2026-11-27"]); expect(occurrencesInMonth(rent, "2026-11")).toEqual(["2026-11-01"]); expect(occurrencesInMonth(rent, "2026-08")).toEqual([]);
    expect(occurrencesInMonth(biweekly, "2026-11")).toEqual(["2026-11-06", "2026-11-20"]);
  });
  it("paid = payment record or the linked task completed; overdue, due and upcoming otherwise; unknown amounts are flagged", () => {
    const occ = billOccurrences([rent, car, hydro], [{ billId: "rent", dueDate: "2026-11-01", status: "paid", paidOn: "2026-11-01", amountMinor: 220000, txnId: "t1" }], "2026-11", "2026-11-24", new Set(["hydro:2026-11-15"]));
    expect(occ.map((o) => [o.name, o.status])).toEqual([["Rent", "paid"], ["Electricity", "paid"], ["Vehicle", "upcoming"]]);
    expect(occ.find((o) => o.name === "Electricity")).toMatchObject({ viaTask: true, estimate: true, amountMinor: null });
    const sum = billSummary(occ); expect(sum).toMatchObject({ total: 3, paid: 2, outstanding: 1, outstandingMinor: 42000, pct: 67 });
    expect(billOccurrences([car], [], "2026-11", "2026-11-28")[0].status).toBe("overdue"); expect(billOccurrences([car], [], "2026-11", "2026-11-27")[0].status).toBe("due");
    expect(billSummary(billOccurrences([hydro], [], "2026-11", "2026-11-01")).unknownAmounts).toBe(1);
    expect(billOccurrences([car], [{ billId: "car", dueDate: "2026-11-27", status: "skipped", paidOn: null, amountMinor: null, txnId: null }], "2026-11", "2026-11-01")[0].status).toBe("skipped");
  });
});

describe("balances, net worth and projected cash", () => {
  const accounts = [acct("chq", "bank"), acct("sav", "savings", { targetMinor: 500000 }), acct("visa", "credit_card", { creditLimitMinor: 1000000 }), acct("loan", "loan", { originalPrincipalMinor: 2000000 }), acct("cash", "cash")];
  const balances = [
    { accountId: "chq", asOf: "2026-11-20", amountMinor: 300000, kind: "confirmed" as const }, { accountId: "sav", asOf: "2026-11-20", amountMinor: 120000, kind: "confirmed" as const },
    { accountId: "visa", asOf: "2026-11-20", amountMinor: -230000, kind: "confirmed" as const }, { accountId: "loan", asOf: "2026-11-01", amountMinor: -1500000, kind: "estimate" as const },
  ];
  it("a balance is the latest snapshot plus later confirmed transactions, and says when it was adjusted", () => {
    const t = [txn("2026-11-22", -20000), txn("2026-11-23", -30000, { counter: "visa" }), txn("2026-11-19", -99999), txn("2026-11-24", -1000, { status: "pending" })];
    expect(accountBalance("chq", balances, t)).toMatchObject({ amountMinor: 250000, adjusted: true, kind: "confirmed", asOf: "2026-11-20" });
    expect(accountBalance("visa", balances, t).amountMinor).toBe(-200000); // paying the card reduces what is owed
    expect(accountBalance("cash", balances, t)).toEqual({ amountMinor: null, asOf: null, kind: "none", adjusted: false }); // never invented
    expect(accountBalance("loan", balances, []).kind).toBe("estimate");
  });
  it("net worth leaves out accounts with no balance and counts them", () => {
    const b = (id: string) => accountBalance(id, balances, []);
    expect(netWorth(accounts, b)).toEqual({ assets: 420000, liabilities: 1730000, net: -1310000, counted: 4, withoutBalance: 1 });
    expect(creditUtilization(accounts[2], b("visa"))).toBe(23); expect(loanProgress(accounts[3], b("loan"))).toBe(25);
    expect(savingsProgress(accounts, b)).toEqual({ saved: 120000, target: 500000, pct: 24, counted: 1 });
  });
  it("net worth history uses the latest snapshot at each month end", () => {
    const s = netWorthSeries(accounts, balances, "2026-11", "2026-11-24", 3);
    expect(s.map((x) => x.month)).toEqual(["2026-09", "2026-10", "2026-11"]); expect(s[1].net).toBeNull(); expect(s[2].net).toBe(-1310000);
  });
  it("projects cash to the next payday from known balances and unpaid bills, flagging estimates", () => {
    const plan = { id: "p", name: "Pay", amountMinor: 250000, amountKind: "fixed" as const, recurrence: { freq: "weekly" as const, interval: 2, byWeekday: [5] }, anchorDate: "2026-11-13", accountId: "chq", active: true };
    const pd = nextPayday([plan], "2026-11-24"); expect(pd).toMatchObject({ date: "2026-11-27", inDays: 3 });
    const bill: FinBill = { id: "car", name: "Vehicle", amountMinor: 42000, amountKind: "fixed", accountId: "chq", counterAccountId: "loan", categoryId: null, recurrence: { freq: "monthly", interval: 1, byMonthDay: 26 }, anchorDate: "2026-09-26", active: true };
    const p = projectedCash(accounts, (id) => accountBalance(id, balances, []), [bill], [], pd, "2026-11-24");
    expect(p).toMatchObject({ available: 258000, until: "2026-11-26", bills: 42000, missingBalances: 1, includesEstimates: false });
    expect(projectedCash(accounts, (id) => accountBalance(id, balances, [txn("2026-11-22", -1000)]), [], [], null, "2026-11-24").includesEstimates).toBe(true);
  });
  it("a plan with no balances yields no projection, not zero", () => {
    expect(projectedCash([acct("chq", "bank")], () => ({ amountMinor: null, asOf: null, kind: "none", adjusted: false }), [], [], null, "2026-11-24").available).toBeNull();
  });
});

describe("budgets and reimbursements", () => {
  it("a month-specific budget overrides the default; only budgeted categories count", () => {
    const by = new Map([["fcat_groceries", 50000], ["fcat_dining", 30000], ["fcat_other", 99999]]);
    const u = budgetUse([{ categoryId: "fcat_groceries", cycle: "*", amountMinor: 60000 }, { categoryId: "fcat_dining", cycle: "*", amountMinor: 20000 }, { categoryId: "fcat_dining", cycle: "2026-11", amountMinor: 40000 }], "2026-11", by);
    expect(u).toMatchObject({ totalBudget: 100000, used: 80000, pct: 80 }); expect(budgetUse([], "2026-11", by).pct).toBeNull();
  });
  it("sums outstanding reimbursements only", () => {
    expect(reimbursementsOutstanding([{ id: "a", amountMinor: 12000, status: "outstanding", expectedDate: null, claimedOn: "2026-11-02" }, { id: "b", amountMinor: 5000, status: "received", expectedDate: null, claimedOn: null }, { id: "c", amountMinor: 3000, status: "outstanding", expectedDate: null, claimedOn: "2026-10-20" }])).toEqual({ total: 15000, count: 2, oldest: "2026-10-20" });
  });
});

describe("voided and reversed transactions", () => {
  const month = "2026-11";
  const voided = (t: FinTxn): FinTxn => ({ ...t, voidedAt: "2026-11-24T10:00:00Z" });
  const reversedPair = (date: string, amount: number, reversalDate: string, o: Partial<FinTxn> & { counter?: string } = {}) => { const a = txn(date, amount, o), b = txn(reversalDate, -amount, o); return [{ ...a, reversedBy: b.id }, { ...b, reversalOf: a.id }]; };
  it("a voided transaction counts nowhere: not in totals, balances, categories or pending", () => {
    const t = [txn("2026-11-01", 400000), voided(txn("2026-11-03", -9999, { categoryId: "fcat_dining" })), voided(txn("2026-11-04", 5000)), voided(txn("2026-11-05", -1000, { status: "pending" }))];
    const s = monthSummary(t, month); expect(s).toMatchObject({ income: 400000, grossSpending: 0, pending: 0 }); expect(s.byCategory.size).toBe(0);
    const bal = [{ accountId: "chq", asOf: "2026-10-31", amountMinor: 100000, kind: "confirmed" as const }];
    expect(accountBalance("chq", bal, t).amountMinor).toBe(500000); // only the real deposit
  });
  it("a reversed pair nets to zero in balances and is left out of totals together, even across months", () => {
    const pair = reversedPair("2026-10-28", 30000, "2026-11-02"); // income received in October, reversed in November
    expect(monthSummary(pair, "2026-11").income).toBe(0); expect(monthSummary(pair, "2026-10").income).toBe(0); // no negative income in November
    const spend = reversedPair("2026-11-05", -4500, "2026-11-06", { categoryId: "fcat_dining" }); expect(monthSummary(spend, month)).toMatchObject({ grossSpending: 0, spending: 0 });
    const bal = [{ accountId: "chq", asOf: "2026-10-01", amountMinor: 100000, kind: "confirmed" as const }];
    expect(accountBalance("chq", bal, [...pair, ...spend]).amountMinor).toBe(100000);
    expect(countsInTotals(pair[0])).toBe(false); expect(countsInTotals(pair[1])).toBe(false);
    // a reversal dated after the snapshot corrects a balance that already contained the original
    expect(accountBalance("chq", [{ accountId: "chq", asOf: "2026-11-01", amountMinor: 130000, kind: "confirmed" as const }], pair).amountMinor).toBe(100000);
  });
  it("a reversed transfer and a reversed card payment change both accounts consistently and net to zero", () => {
    const pair = reversedPair("2026-11-05", -20000, "2026-11-06", { counter: "visa" });
    const bals = (id: string) => accountBalance(id, [{ accountId: id, asOf: "2026-11-01", amountMinor: id === "visa" ? -50000 : 100000, kind: "confirmed" }], pair).amountMinor;
    expect(bals("chq")).toBe(100000); expect(bals("visa")).toBe(-50000); expect(monthSummary(pair, month).debtRepaid).toBe(0);
  });
  it("a reversed bill payment makes the occurrence unpaid again", () => {
    const rent: FinBill = { id: "rent", name: "Rent", amountMinor: 220000, amountKind: "fixed", accountId: "chq", counterAccountId: null, categoryId: null, recurrence: { freq: "monthly", interval: 1, byMonthDay: 1 }, anchorDate: "2026-09-01", active: true };
    const pay = { billId: "rent", dueDate: "2026-11-01", status: "paid" as const, paidOn: "2026-11-01", amountMinor: 220000, txnId: "t1" };
    expect(billOccurrences([rent], [pay], "2026-11", "2026-11-10")[0].status).toBe("paid");
    const o = billOccurrences([rent], [{ ...pay, reversedAt: "2026-11-05T00:00:00Z" }], "2026-11", "2026-11-10")[0]; expect(o.status).toBe("overdue"); expect(o.paidOn).toBeNull();
    expect(billSummary(billOccurrences([rent], [{ ...pay, reversedAt: "x" }], "2026-11", "2026-11-10"))).toMatchObject({ paid: 0, outstanding: 1 });
  });
});

describe("loan payments split into principal and interest", () => {
  const month = "2026-11";
  it("validates the split and derives the missing part", () => {
    expect(resolveSplit(-42000, undefined, undefined)).toBeNull();
    expect(resolveSplit(-42000, 34920, undefined)).toEqual({ principalMinor: 34920, interestMinor: 7080 });
    expect(resolveSplit(-42000, undefined, 7080)).toEqual({ principalMinor: 34920, interestMinor: 7080 });
    expect(resolveSplit(42000, 34920, 7080)).toEqual({ principalMinor: 34920, interestMinor: 7080 });
    expect(() => resolveSplit(-42000, 30000, 7080)).toThrow(/add up/); expect(() => resolveSplit(-42000, 50000, undefined)).toThrow(/negative/);
  });
  it("principal reduces the loan; interest leaves the paying account and lowers net worth", () => {
    const split = txn("2026-11-27", -42000, { counter: "loan" }); const t = { ...split, principalMinor: 34920, interestMinor: 7080 };
    expect(txnDeltas(t)).toEqual([{ accountId: "chq", delta: -42000 }, { accountId: "loan", delta: 34920 }]);
    expect(txnDeltas(split)).toEqual([{ accountId: "chq", delta: -42000 }, { accountId: "loan", delta: 42000 }]); // unsplit: all principal
    expect(txnDeltas({ ...t, amountMinor: 42000 })).toEqual([{ accountId: "chq", delta: 42000 }, { accountId: "loan", delta: -34920 }]); // its reversal
    const accounts = [acct("chq", "bank"), acct("loan", "loan", { originalPrincipalMinor: 2000000 })];
    const bal = [{ accountId: "chq", asOf: "2026-11-01", amountMinor: 300000, kind: "confirmed" as const }, { accountId: "loan", asOf: "2026-11-01", amountMinor: -1500000, kind: "confirmed" as const }];
    const b = (id: string) => accountBalance(id, bal, [t]);
    expect(b("chq").amountMinor).toBe(258000); expect(b("loan").amountMinor).toBe(-1465080);
    expect(netWorth(accounts, b).net).toBe(258000 - 1465080); // 42000 less than before: only the principal was swapped for debt
    expect(netWorth(accounts, (id) => accountBalance(id, bal, [])).net).toBe(300000 - 1500000);
  });
  it("principal is a debt repayment, interest is spending; unsplit payments are flagged", () => {
    const split = { ...txn("2026-11-27", -42000, { counter: "loan" }), principalMinor: 34920, interestMinor: 7080 }; const unsplit = txn("2026-11-12", -10000, { counter: "loan" });
    const s = monthSummary([split], month); expect(s).toMatchObject({ debtRepaid: 34920, interestPaid: 7080, grossSpending: 7080, spending: 7080, net: -7080, loanNotSplit: 0 });
    expect(s.byCategory.get("fcat_fees")).toBe(7080);
    expect(monthSummary([unsplit], month)).toMatchObject({ debtRepaid: 10000, interestPaid: 0, grossSpending: 0, loanNotSplit: 1 });
    expect(loanStats("loan", [split, unsplit, { ...txn("2026-10-27", -42000, { counter: "loan" }), principalMinor: 35000, interestMinor: 7000, voidedAt: "x" }])).toEqual({ principalRepaid: 44920, interestPaid: 7080, payments: 2, notSplit: 1 });
    const card = txn("2026-11-12", -30000, { counter: "visa" }); expect(monthSummary([card], month)).toMatchObject({ debtRepaid: 30000, interestPaid: 0, grossSpending: 0 });
  });
  it("estimates a month of interest only from a stated rate and a known balance", () => {
    expect(estimateInterest(1440000, 5.9)).toBe(7080); expect(estimateInterest(1440000, null)).toBeNull(); expect(estimateInterest(0, 5.9)).toBeNull();
  });
});

describe("reimbursement reconciliation", () => {
  const claim = (id: string, amountMinor: number, status: FinReimb["status"] = "outstanding"): FinReimb => ({ id, amountMinor, status, expectedDate: null, claimedOn: "2026-11-02" });
  const exp = (amount: number, o: Partial<FinTxn> = {}) => ({ ...txn("2026-11-03", -amount), reimbursable: true, ...o });
  const received = (claimId: string, amount: number, o: Partial<FinTxn> = {}) => ({ ...txn("2026-11-20", amount), kind: "reimbursement" as const, reimbursementId: claimId, ...o });
  it("a claim moves from outstanding to partly received to received, and over-receipt is flagged", () => {
    const e = exp(40000); const links = [{ reimbursementId: "c1", txnId: e.id, amountMinor: 40000 }];
    const at = (rs: FinTxn[]) => reimbursementRecon([claim("c1", 40000)], links, [e, ...rs]);
    expect(at([]).claims.get("c1")).toMatchObject({ state: "outstanding", received: 0, outstanding: 40000, linked: 40000, unlinked: 0 });
    expect(at([received("c1", 15000)]).claims.get("c1")).toMatchObject({ state: "partly_received", received: 15000, outstanding: 25000 });
    expect(at([received("c1", 15000), received("c1", 25000)]).claims.get("c1")).toMatchObject({ state: "received", outstanding: 0 });
    expect(at([received("c1", 45000)]).claims.get("c1")).toMatchObject({ state: "over_received", overReceived: 5000, outstanding: 0 });
    expect(at([received("c1", 40000, { voidedAt: "x" })]).claims.get("c1")!.state).toBe("outstanding"); // a voided deposit does not count
    expect(at([received("c1", 15000, { reversedBy: "r" })]).claims.get("c1")!.received).toBe(0);
  });
  it("derives each expense's state: unclaimed, claimed, partly received, reimbursed", () => {
    const a = exp(40000), b = exp(18000), c = exp(9000), d = exp(5000, { reimbursable: false });
    const links = [{ reimbursementId: "c1", txnId: a.id, amountMinor: 40000 }, { reimbursementId: "c2", txnId: b.id, amountMinor: 18000 }];
    const r = reimbursementRecon([claim("c1", 40000), claim("c2", 18000)], links, [a, b, c, d, received("c1", 40000), received("c2", 6000)]);
    expect(r.expenses.get(a.id)).toMatchObject({ state: "reimbursed", claimed: 40000, received: 40000, outstanding: 0 });
    expect(r.expenses.get(b.id)).toMatchObject({ state: "partly_received", received: 6000, outstanding: 12000 });
    expect(r.unclaimedExpenses.map((x) => x.txnId)).toEqual([c.id]); // reimbursable but never claimed; the plain expense is not listed
  });
  it("a claim over several expenses shares what was received in proportion; a voided expense drops out of the link", () => {
    const a = exp(30000), b = exp(10000);
    const links = [{ reimbursementId: "c1", txnId: a.id, amountMinor: 30000 }, { reimbursementId: "c1", txnId: b.id, amountMinor: 10000 }];
    const r = reimbursementRecon([claim("c1", 40000)], links, [a, b, received("c1", 20000)]);
    expect(r.expenses.get(a.id)!.received).toBe(15000); expect(r.expenses.get(b.id)!.received).toBe(5000);
    const v = reimbursementRecon([claim("c1", 40000)], links, [{ ...b, voidedAt: "x" }, a]); expect(v.claims.get("c1")).toMatchObject({ linked: 30000, unlinked: 10000 });
  });
  it("a claim marked received by hand is shown as received but unreconciled; the outstanding total subtracts part payments", () => {
    const r = reimbursementRecon([claim("c1", 7600, "received")], [], []); expect(r.claims.get("c1")).toMatchObject({ state: "received", reconciled: false });
    const list = [claim("a", 12000), claim("b", 5000, "received"), claim("c", 3000)];
    expect(reimbursementsOutstanding(list, new Map([["a", 2000]]))).toMatchObject({ total: 13000, count: 2 });
    expect(reimbursementsOutstanding(list, new Map([["c", 3000]]))).toMatchObject({ total: 12000, count: 1 });
  });
});

describe("Finance corrections in the interface", () => {
  const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");
  it("transactions open a detail sheet with edit, reverse and void; voided and reversed rows say so in words; bills can be reversed", () => {
    const e = read("src/components/FinanceEditors.tsx"), v = read("src/components/FinanceViews.tsx");
    for (const c of ["TransactionSheet", "ReversePaymentDialog"]) expect(e, c).toContain(`function ${c}`);
    for (const w of ["Reverse", "Void", "Edit", "Reason (kept on record)", "Of which principal", "Of which interest", "Estimate"]) expect(e, w).toContain(w);
    for (const w of ["Show voided", "<Tag>Voided</Tag>", "<Tag>Reversed</Tag>", "<Tag>Reversal</Tag>", "Reverse payment", "Principal and interest"]) expect(v, w).toContain(w);
    expect(e + v).not.toContain("dangerouslySetInnerHTML"); expect(e + v).not.toMatch(/USD|EUR|GBP/);
  });
  it("an interest estimate is only a button that fills a field: it is never sent without the owner saving", () => {
    const e = read("src/components/FinanceEditors.tsx"); expect(e).toContain("Use as interest"); expect(e).toContain("estimateInterest");
    expect(e).not.toMatch(/interestMinor: guess/);
  });
});
