import { describe, expect, it } from "vitest";
import { accountBalance, billOccurrences, billSummary, budgetUse, creditUtilization, deriveTxnKind, loanProgress, monthSummary, netWorth, netWorthSeries, nextPayday, occurrencesInMonth, projectedCash, reimbursementsOutstanding, savingsProgress, type AccountType, type FinAccount, type FinBill, type FinTxn } from "../shared/finance";

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
