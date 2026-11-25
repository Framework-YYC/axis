import { type Minor } from "./money";
import { nextOccurrence, type Recurrence } from "./recurrence";
import { addDays } from "./rotation";
import { addCycles, cycleOf, lastDayOfCycle } from "./progress";

/**
 * Finance maths. Pure and tested, so the app, the assistant and the tests agree. Rules:
 * - Only confirmed transactions count. Balances are confirmed snapshots or estimates. Expected income and bills are plans, never money received or spent.
 * - A transfer between the owner's accounts is one record with a counter account and is excluded from income and spending.
 * - A card payment or loan payment is a debt repayment: the spending was counted when it was charged, so it never counts as spending again.
 * - A reimbursement received is neither income nor a negative expense line: spending is reported net of reimbursements received that month.
 * - Missing information is missing: an unknown balance is excluded and counted, an unknown bill amount is flagged, never guessed.
 */
export type AccountType = "bank" | "savings" | "credit_card" | "loan" | "investment" | "cash";
export type TxnKind = "income" | "expense" | "transfer" | "card_payment" | "loan_payment" | "reimbursement";
export interface FinAccount { id: string; name: string; type: AccountType; creditLimitMinor: Minor | null; statementDay: number | null; dueDay: number | null; minPaymentMinor: Minor | null; interestRate: number | null; originalPrincipalMinor: Minor | null; targetMinor: Minor | null; targetDate: string | null; archivedAt: string | null }
export interface FinBalance { accountId: string; asOf: string; amountMinor: Minor; kind: "confirmed" | "estimate" }
export interface FinTxn { id: string; accountId: string; counterAccountId: string | null; date: string; amountMinor: Minor; kind: TxnKind; categoryId: string | null; status: "confirmed" | "pending"; billId: string | null; billDue: string | null }
export interface FinBill { id: string; name: string; amountMinor: Minor | null; amountKind: "fixed" | "estimate"; accountId: string | null; counterAccountId: string | null; categoryId: string | null; recurrence: Recurrence; anchorDate: string; active: boolean }
export interface FinPayment { billId: string; dueDate: string; status: "paid" | "skipped"; paidOn: string | null; amountMinor: Minor | null; txnId: string | null }
export interface FinBudget { categoryId: string; cycle: string; amountMinor: Minor }
export interface FinIncomePlan { id: string; name: string; amountMinor: Minor | null; amountKind: "fixed" | "estimate"; recurrence: Recurrence; anchorDate: string; accountId: string | null; active: boolean }
export interface FinReimb { id: string; amountMinor: Minor; status: "outstanding" | "received" | "written_off"; expectedDate: string | null; claimedOn: string | null }

export const isDebt = (t: AccountType) => t === "credit_card" || t === "loan";
const monthOf = (d: string) => d.slice(0, 7);

/** The kind of a transaction, derived from its shape (never typed in by hand). */
export function deriveTxnKind(t: { amountMinor: Minor; counterAccountId: string | null; reimbursementId?: string | null }, types: ReadonlyMap<string, AccountType>): TxnKind {
  if (t.counterAccountId) { const c = types.get(t.counterAccountId); if (!c) throw new Error("Unknown counter account"); return c === "credit_card" ? "card_payment" : c === "loan" ? "loan_payment" : "transfer"; }
  if (t.reimbursementId && t.amountMinor > 0) return "reimbursement";
  return t.amountMinor >= 0 ? "income" : "expense";
}
/** Balance change per account: a counter-account move changes both sides and cancels out in net worth. */
export const txnDeltas = (t: { accountId: string; counterAccountId: string | null; amountMinor: Minor }) => [{ accountId: t.accountId, delta: t.amountMinor }, ...(t.counterAccountId ? [{ accountId: t.counterAccountId, delta: -t.amountMinor }] : [])];

export interface MonthSummary { income: Minor; spending: Minor; grossSpending: Minor; reimbursed: Minor; debtRepaid: Minor; transfers: Minor; net: Minor; byCategory: Map<string, Minor>; incomeBins: Minor[]; spendBins: Minor[]; pending: number }
const BINS = 16;
/** Income, spending (net of reimbursements), debt repayments and transfers for one month, from confirmed transactions only. */
export function monthSummary(txns: readonly FinTxn[], month: string): MonthSummary {
  const s: MonthSummary = { income: 0, spending: 0, grossSpending: 0, reimbursed: 0, debtRepaid: 0, transfers: 0, net: 0, byCategory: new Map(), incomeBins: Array(BINS).fill(0), spendBins: Array(BINS).fill(0), pending: 0 };
  const days = Number(lastDayOfCycle(month).slice(8)), per = Math.ceil(days / BINS);
  for (const t of txns) {
    if (monthOf(t.date) !== month) continue;
    if (t.status !== "confirmed") { s.pending++; continue; }
    const bin = Math.min(BINS - 1, Math.floor((Number(t.date.slice(8)) - 1) / per));
    if (t.kind === "income") { s.income += t.amountMinor; s.incomeBins[bin] += t.amountMinor; }
    else if (t.kind === "expense") { const v = -t.amountMinor; s.grossSpending += v; s.spendBins[bin] += v; if (t.categoryId) s.byCategory.set(t.categoryId, (s.byCategory.get(t.categoryId) ?? 0) + v); }
    else if (t.kind === "reimbursement") s.reimbursed += t.amountMinor;
    else if (t.kind === "card_payment" || t.kind === "loan_payment") s.debtRepaid += Math.abs(t.amountMinor);
    else s.transfers += Math.abs(t.amountMinor);
  }
  s.spending = Math.max(0, s.grossSpending - s.reimbursed);
  s.net = s.income + s.reimbursed - s.grossSpending;
  return s;
}

// ----- bills -----
/** Every due date of a bill inside a month (the rule anchored on a real due date). */
export function occurrencesInMonth(b: Pick<FinBill, "recurrence" | "anchorDate">, month: string): string[] {
  const end = lastDayOfCycle(month), out: string[] = [];
  let d: string | null = b.anchorDate;
  for (let i = 0; d && d <= end && i < 400; i++) { if (monthOf(d) === month) out.push(d); d = nextOccurrence(b.recurrence, d, d); }
  return out;
}
/** The first due date on or after `from`. */
export function firstOnOrAfter(rule: Recurrence, anchor: string, from: string): string | null {
  let d: string | null = anchor;
  for (let i = 0; d && i < 2000; i++) { if (d >= from) return d; d = nextOccurrence(rule, d, d); }
  return null;
}
export interface BillOccurrence { billId: string; name: string; dueDate: string; amountMinor: Minor | null; estimate: boolean; status: "paid" | "skipped" | "overdue" | "due" | "upcoming"; paidOn: string | null; paidAmountMinor: Minor | null; txnId: string | null; viaTask: boolean; debt: boolean }
/** Bill occurrences for a month with their payment status. Paid = a payment record, or the linked task completed. */
export function billOccurrences(bills: readonly FinBill[], payments: readonly FinPayment[], month: string, today: string, taskDone: ReadonlySet<string> = new Set()): BillOccurrence[] {
  const pay = new Map(payments.map((p) => [`${p.billId}:${p.dueDate}`, p]));
  const out: BillOccurrence[] = [];
  for (const b of bills) {
    if (!b.active) continue;
    for (const d of occurrencesInMonth(b, month)) {
      const p = pay.get(`${b.id}:${d}`); const viaTask = !p && taskDone.has(`${b.id}:${d}`);
      const status = p ? p.status : viaTask ? "paid" : d < today ? "overdue" : d === today ? "due" : "upcoming";
      out.push({ billId: b.id, name: b.name, dueDate: d, amountMinor: b.amountMinor, estimate: b.amountKind === "estimate" || b.amountMinor === null, status, paidOn: p?.paidOn ?? null, paidAmountMinor: p?.amountMinor ?? null, txnId: p?.txnId ?? null, viaTask, debt: !!b.counterAccountId });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
}
export interface BillSummary { total: number; paid: number; outstanding: number; paidMinor: Minor; outstandingMinor: Minor; unknownAmounts: number; pct: number }
export function billSummary(occ: readonly BillOccurrence[]): BillSummary {
  const live = occ.filter((o) => o.status !== "skipped"); const paid = live.filter((o) => o.status === "paid"), open = live.filter((o) => o.status !== "paid");
  return { total: live.length, paid: paid.length, outstanding: open.length, paidMinor: paid.reduce((a, o) => a + (o.paidAmountMinor ?? o.amountMinor ?? 0), 0), outstandingMinor: open.reduce((a, o) => a + (o.amountMinor ?? 0), 0), unknownAmounts: open.filter((o) => o.amountMinor === null).length, pct: live.length ? Math.round((paid.length / live.length) * 100) : 0 };
}

// ----- balances and net worth -----
export interface AccountBalance { amountMinor: Minor | null; asOf: string | null; kind: "confirmed" | "estimate" | "none"; adjusted: boolean }
/** Current balance = the latest snapshot (confirmed preferred) plus confirmed transactions dated after it. Anything adjusted or estimated is flagged. */
export function accountBalance(accountId: string, balances: readonly FinBalance[], txns: readonly FinTxn[]): AccountBalance {
  const mine = balances.filter((b) => b.accountId === accountId).sort((a, b) => b.asOf.localeCompare(a.asOf) || (a.kind === "confirmed" ? -1 : 1));
  const snap = mine[0];
  if (!snap) return { amountMinor: null, asOf: null, kind: "none", adjusted: false };
  let amount = snap.amountMinor, adjusted = false;
  for (const t of txns) if (t.status === "confirmed" && t.date > snap.asOf) for (const d of txnDeltas(t)) if (d.accountId === accountId) { amount += d.delta; adjusted = true; }
  return { amountMinor: amount, asOf: snap.asOf, kind: snap.kind, adjusted };
}
export interface NetWorth { assets: Minor; liabilities: Minor; net: Minor; counted: number; withoutBalance: number }
export function netWorth(accounts: readonly FinAccount[], balanceOf: (id: string) => AccountBalance): NetWorth {
  let assets = 0, liabilities = 0, counted = 0, without = 0;
  for (const a of accounts) { if (a.archivedAt) continue; const b = balanceOf(a.id); if (b.amountMinor === null) { without++; continue; } counted++; if (b.amountMinor >= 0) assets += b.amountMinor; else liabilities += -b.amountMinor; }
  return { assets, liabilities, net: assets - liabilities, counted, withoutBalance: without };
}
/** Net worth at the end of each of the last `months` months, from the latest snapshot at or before that date (accounts without one yet are left out). */
export function netWorthSeries(accounts: readonly FinAccount[], balances: readonly FinBalance[], currentMonth: string, today: string, months = 6): Array<{ month: string; net: Minor | null }> {
  return Array.from({ length: months }, (_, i) => {
    const month = addCycles(currentMonth, i - (months - 1)), at = month === currentMonth ? today : lastDayOfCycle(month);
    let net: Minor | null = null;
    for (const a of accounts) { const s = balances.filter((b) => b.accountId === a.id && b.asOf <= at).sort((x, y) => y.asOf.localeCompare(x.asOf))[0]; if (s) net = (net ?? 0) + s.amountMinor; }
    return { month, net };
  });
}

// ----- income, cash planning, budgets, savings, debt -----
export interface Payday { date: string; plan: FinIncomePlan; inDays: number }
export function nextPayday(plans: readonly FinIncomePlan[], today: string): Payday | null {
  let best: Payday | null = null;
  for (const p of plans) { if (!p.active) continue; const d = firstOnOrAfter(p.recurrence, p.anchorDate, today); if (d && (!best || d < best.date)) best = { date: d, plan: p, inDays: Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000) }; }
  return best;
}
export interface ProjectedCash { available: Minor | null; until: string; bills: Minor; unknownBills: number; includesEstimates: boolean; missingBalances: number; startingBalance: Minor }
/** Cash expected to remain until the next payday (or the end of the month with none): bank and cash balances now, less the unpaid bills due before then. An estimate, and it says so. */
export function projectedCash(accounts: readonly FinAccount[], balanceOf: (id: string) => AccountBalance, bills: readonly FinBill[], payments: readonly FinPayment[], payday: Payday | null, today: string, taskDone: ReadonlySet<string> = new Set()): ProjectedCash {
  const until = payday ? addDays(payday.date, -1) : lastDayOfCycle(cycleOf(today));
  let start = 0, missing = 0, est = false;
  for (const a of accounts) { if (a.archivedAt || (a.type !== "bank" && a.type !== "cash")) continue; const b = balanceOf(a.id); if (b.amountMinor === null) { missing++; continue; } start += b.amountMinor; if (b.kind === "estimate" || b.adjusted) est = true; }
  let due = 0, unknown = 0;
  for (const m of new Set([cycleOf(today), cycleOf(until)])) for (const o of billOccurrences(bills, payments, m, today, taskDone)) if (o.status !== "paid" && o.status !== "skipped" && o.dueDate >= (o.status === "overdue" ? "0" : today) && o.dueDate <= until) { if (o.amountMinor === null) unknown++; else { due += o.amountMinor; if (o.estimate) est = true; } }
  return { available: missing && start === 0 ? null : start - due, until, bills: due, unknownBills: unknown, includesEstimates: est || unknown > 0, missingBalances: missing, startingBalance: start };
}
export interface BudgetUse { totalBudget: Minor; used: Minor; pct: number | null; rows: Array<{ categoryId: string; budget: Minor; spent: Minor; pct: number }> }
/** Budget use for a month: a month-specific budget overrides the default ('*'). Only budgeted categories count toward use. */
export function budgetUse(budgets: readonly FinBudget[], month: string, byCategory: ReadonlyMap<string, Minor>): BudgetUse {
  const per = new Map<string, Minor>();
  for (const b of budgets) if (b.cycle === "*") per.set(b.categoryId, b.amountMinor);
  for (const b of budgets) if (b.cycle === month) per.set(b.categoryId, b.amountMinor);
  const rows = [...per].map(([categoryId, budget]) => { const spent = byCategory.get(categoryId) ?? 0; return { categoryId, budget, spent, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0 }; });
  const total = rows.reduce((a, r) => a + r.budget, 0), used = rows.reduce((a, r) => a + r.spent, 0);
  return { totalBudget: total, used, pct: total > 0 ? Math.round((used / total) * 100) : null, rows };
}
export const creditUtilization = (a: FinAccount, bal: AccountBalance): number | null => (a.type === "credit_card" && a.creditLimitMinor && bal.amountMinor !== null ? Math.max(0, Math.round((-bal.amountMinor / a.creditLimitMinor) * 100)) : null);
export const loanProgress = (a: FinAccount, bal: AccountBalance): number | null => (a.type === "loan" && a.originalPrincipalMinor && bal.amountMinor !== null ? Math.max(0, Math.min(100, Math.round(((a.originalPrincipalMinor + bal.amountMinor) / a.originalPrincipalMinor) * 100))) : null);
export function savingsProgress(accounts: readonly FinAccount[], balanceOf: (id: string) => AccountBalance): { saved: Minor; target: Minor; pct: number | null; counted: number } {
  let saved = 0, target = 0, counted = 0;
  for (const a of accounts) { if (a.archivedAt || a.type !== "savings" || !a.targetMinor) continue; const b = balanceOf(a.id); if (b.amountMinor === null) continue; saved += b.amountMinor; target += a.targetMinor; counted++; }
  return { saved, target, pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : null, counted };
}
export const reimbursementsOutstanding = (list: readonly FinReimb[]) => { const o = list.filter((r) => r.status === "outstanding"); return { total: o.reduce((a, r) => a + r.amountMinor, 0), count: o.length, oldest: o.map((r) => r.claimedOn).filter(Boolean).sort()[0] ?? null }; };
