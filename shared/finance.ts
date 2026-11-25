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
 * - Nothing is deleted. A voided transaction is excluded from every figure as though absent. A reversed transaction and its offsetting entry are both kept: they net to zero in
 *   balances, and are left out of the income, spending and debt totals together (so a reversal dated in another month never shows as negative income).
 * - A loan payment splits into principal (reduces the loan, a debt repayment) and interest (an expense, never a repayment). An unsplit payment is all principal and is flagged.
 */
export type AccountType = "bank" | "savings" | "credit_card" | "loan" | "investment" | "cash";
export type TxnKind = "income" | "expense" | "transfer" | "card_payment" | "loan_payment" | "reimbursement";
export interface FinAccount { id: string; name: string; type: AccountType; creditLimitMinor: Minor | null; statementDay: number | null; dueDay: number | null; minPaymentMinor: Minor | null; interestRate: number | null; originalPrincipalMinor: Minor | null; targetMinor: Minor | null; targetDate: string | null; archivedAt: string | null }
export interface FinBalance { accountId: string; asOf: string; amountMinor: Minor; kind: "confirmed" | "estimate" }
export interface FinTxn {
  id: string; accountId: string; counterAccountId: string | null; date: string; amountMinor: Minor; kind: TxnKind; categoryId: string | null; status: "confirmed" | "pending"; billId: string | null; billDue: string | null;
  reimbursementId?: string | null; reimbursable?: boolean; voidedAt?: string | null; reversalOf?: string | null; reversedBy?: string | null; principalMinor?: Minor | null; interestMinor?: Minor | null;
}
export interface FinBill { id: string; name: string; amountMinor: Minor | null; amountKind: "fixed" | "estimate"; accountId: string | null; counterAccountId: string | null; categoryId: string | null; recurrence: Recurrence; anchorDate: string; active: boolean }
export interface FinPayment { billId: string; dueDate: string; status: "paid" | "skipped"; paidOn: string | null; amountMinor: Minor | null; txnId: string | null; reversedAt?: string | null }
export interface FinBudget { categoryId: string; cycle: string; amountMinor: Minor }
export interface FinIncomePlan { id: string; name: string; amountMinor: Minor | null; amountKind: "fixed" | "estimate"; recurrence: Recurrence; anchorDate: string; accountId: string | null; active: boolean }
export interface FinReimb { id: string; amountMinor: Minor; status: "outstanding" | "received" | "written_off"; expectedDate: string | null; claimedOn: string | null }

export interface FinReimbLink { reimbursementId: string; txnId: string; amountMinor: Minor }
export const isDebt = (t: AccountType) => t === "credit_card" || t === "loan";
/** A transaction that exists for the books: not voided. */
export const isLive = (t: Pick<FinTxn, "voidedAt">) => !t.voidedAt;
/** A transaction that counts in income, spending and debt totals: live, and not half of a reversed pair (the pair cancels, wherever its two dates fall). */
export const countsInTotals = (t: Pick<FinTxn, "voidedAt" | "reversalOf" | "reversedBy">) => !t.voidedAt && !t.reversalOf && !t.reversedBy;
/** A payment record that stands: a reversed payment is treated as absent, so the occurrence is unpaid again. */
export const isStanding = (p: Pick<FinPayment, "reversedAt">) => !p.reversedAt;

/**
 * Splits a loan payment. `principal` and `interest` are magnitudes in cents; either may be omitted and is derived from the total.
 * Returns null when neither is given (an unsplit payment: all of it is treated as principal). Throws a RangeError when they do not add up.
 */
export function resolveSplit(amountMinor: Minor, principal: Minor | null | undefined, interest: Minor | null | undefined): { principalMinor: Minor; interestMinor: Minor } | null {
  const total = Math.abs(amountMinor);
  if ((principal === null || principal === undefined) && (interest === null || interest === undefined)) return null;
  const p = principal ?? total - (interest as number), i = interest ?? total - (principal as number);
  if (!Number.isSafeInteger(p) || !Number.isSafeInteger(i) || p < 0 || i < 0) throw new RangeError("principal and interest cannot be negative");
  if (p + i !== total) throw new RangeError(`principal and interest must add up to the payment (${(total / 100).toFixed(2)})`);
  return { principalMinor: p, interestMinor: i };
}
const monthOf = (d: string) => d.slice(0, 7);

/** The kind of a transaction, derived from its shape (never typed in by hand). */
export function deriveTxnKind(t: { amountMinor: Minor; counterAccountId: string | null; reimbursementId?: string | null }, types: ReadonlyMap<string, AccountType>): TxnKind {
  if (t.counterAccountId) { const c = types.get(t.counterAccountId); if (!c) throw new Error("Unknown counter account"); return c === "credit_card" ? "card_payment" : c === "loan" ? "loan_payment" : "transfer"; }
  if (t.reimbursementId && t.amountMinor > 0) return "reimbursement";
  return t.amountMinor >= 0 ? "income" : "expense";
}
/**
 * Balance change per account. A transfer or card payment moves the same amount to the counter account and cancels out in net worth.
 * A loan payment reduces the loan by its principal only: the interest leaves the paying account and reduces net worth.
 */
export function txnDeltas(t: { accountId: string; counterAccountId: string | null; amountMinor: Minor; kind?: TxnKind; principalMinor?: Minor | null }) {
  if (!t.counterAccountId) return [{ accountId: t.accountId, delta: t.amountMinor }];
  const toCounter = t.kind === "loan_payment" && t.principalMinor !== null && t.principalMinor !== undefined ? -Math.sign(t.amountMinor) * t.principalMinor : -t.amountMinor;
  return [{ accountId: t.accountId, delta: t.amountMinor }, { accountId: t.counterAccountId, delta: toCounter }];
}

export interface MonthSummary { income: Minor; spending: Minor; grossSpending: Minor; reimbursed: Minor; debtRepaid: Minor; interestPaid: Minor; loanNotSplit: number; transfers: Minor; net: Minor; byCategory: Map<string, Minor>; incomeBins: Minor[]; spendBins: Minor[]; pending: number }
const BINS = 16;
/** Income, spending (net of reimbursements), debt repayments and transfers for one month, from confirmed transactions only. */
export function monthSummary(txns: readonly FinTxn[], month: string): MonthSummary {
  const s: MonthSummary = { income: 0, spending: 0, grossSpending: 0, reimbursed: 0, debtRepaid: 0, interestPaid: 0, loanNotSplit: 0, transfers: 0, net: 0, byCategory: new Map(), incomeBins: Array(BINS).fill(0), spendBins: Array(BINS).fill(0), pending: 0 };
  const days = Number(lastDayOfCycle(month).slice(8)), per = Math.ceil(days / BINS);
  for (const t of txns) {
    if (monthOf(t.date) !== month || !countsInTotals(t)) continue;
    if (t.status !== "confirmed") { s.pending++; continue; }
    const bin = Math.min(BINS - 1, Math.floor((Number(t.date.slice(8)) - 1) / per));
    if (t.kind === "income") { s.income += t.amountMinor; s.incomeBins[bin] += t.amountMinor; }
    else if (t.kind === "expense") { const v = -t.amountMinor; s.grossSpending += v; s.spendBins[bin] += v; if (t.categoryId) s.byCategory.set(t.categoryId, (s.byCategory.get(t.categoryId) ?? 0) + v); }
    else if (t.kind === "reimbursement") s.reimbursed += t.amountMinor;
    else if (t.kind === "card_payment") s.debtRepaid += Math.abs(t.amountMinor);
    else if (t.kind === "loan_payment") {
      const total = Math.abs(t.amountMinor), principal = t.principalMinor ?? total, interest = t.principalMinor === null || t.principalMinor === undefined ? 0 : total - principal;
      s.debtRepaid += principal; if (t.principalMinor === null || t.principalMinor === undefined) s.loanNotSplit++;
      if (interest > 0) { s.interestPaid += interest; s.grossSpending += interest; s.spendBins[bin] += interest; const c = t.categoryId ?? "fcat_fees"; s.byCategory.set(c, (s.byCategory.get(c) ?? 0) + interest); }
    }
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
  const pay = new Map(payments.filter(isStanding).map((p) => [`${p.billId}:${p.dueDate}`, p]));
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
  for (const t of txns) if (t.status === "confirmed" && isLive(t) && t.date > snap.asOf) for (const d of txnDeltas(t)) if (d.accountId === accountId) { amount += d.delta; adjusted = true; }
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
/** Claims still owed. `received` (per claim, from reconciliation) reduces what is outstanding for a partly paid claim. */
export const reimbursementsOutstanding = (list: readonly FinReimb[], received: ReadonlyMap<string, Minor> = new Map()) => {
  const o = list.filter((r) => r.status === "outstanding" && r.amountMinor - (received.get(r.id) ?? 0) > 0);
  return { total: o.reduce((a, r) => a + r.amountMinor - (received.get(r.id) ?? 0), 0), count: o.length, oldest: o.map((r) => r.claimedOn).filter(Boolean).sort()[0] ?? null };
};

// ----- loans -----
export interface LoanStats { principalRepaid: Minor; interestPaid: Minor; payments: number; notSplit: number }
/** What has gone into a loan so far: principal (reduces the debt), interest (cost) and how many payments were never split. Voided and reversed payments are left out. */
export function loanStats(loanId: string, txns: readonly FinTxn[]): LoanStats {
  const s: LoanStats = { principalRepaid: 0, interestPaid: 0, payments: 0, notSplit: 0 };
  for (const t of txns) {
    if (t.kind !== "loan_payment" || t.counterAccountId !== loanId || t.status !== "confirmed" || !countsInTotals(t)) continue;
    const total = Math.abs(t.amountMinor); s.payments++;
    if (t.principalMinor === null || t.principalMinor === undefined) { s.principalRepaid += total; s.notSplit++; } else { s.principalRepaid += t.principalMinor; s.interestPaid += total - t.principalMinor; }
  }
  return s;
}
/** One month of interest at the stated annual rate on the balance owed: a labelled estimate to help fill the split, never saved on its own. */
export const estimateInterest = (balanceOwedMinor: Minor, annualRatePct: number | null): Minor | null => (annualRatePct === null || balanceOwedMinor <= 0 ? null : Math.round((balanceOwedMinor * annualRatePct) / 100 / 12));

// ----- reimbursement reconciliation -----
export type ClaimState = "outstanding" | "partly_received" | "received" | "over_received" | "written_off";
export interface ClaimRecon { id: string; claimed: Minor; received: Minor; outstanding: Minor; overReceived: Minor; linked: Minor; unlinked: Minor; overLinked: boolean; state: ClaimState; reconciled: boolean }
export type ExpenseState = "unclaimed" | "claimed" | "partly_received" | "reimbursed";
export interface ExpenseRecon { txnId: string; amount: Minor; claimed: Minor; received: Minor; outstanding: Minor; unclaimed: Minor; state: ExpenseState }
/**
 * Reimbursements are tracked apart from income and spending. A claim is compared with the money actually received against it (confirmed, live, not reversed),
 * and with the expense(s) it links to. Receipts are allocated to a claim's expenses in proportion to their linked amounts. Over-receipt is flagged, never hidden.
 */
export function reimbursementRecon(claims: readonly FinReimb[], links: readonly FinReimbLink[], txns: readonly FinTxn[]): { claims: Map<string, ClaimRecon>; expenses: Map<string, ExpenseRecon>; unclaimedExpenses: ExpenseRecon[] } {
  const byTxn = new Map(txns.map((t) => [t.id, t]));
  const receivedBy = new Map<string, Minor>();
  for (const t of txns) if (t.kind === "reimbursement" && t.reimbursementId && t.status === "confirmed" && countsInTotals(t)) receivedBy.set(t.reimbursementId, (receivedBy.get(t.reimbursementId) ?? 0) + t.amountMinor);
  const out = new Map<string, ClaimRecon>(); const liveLinks = links.filter((l) => { const e = byTxn.get(l.txnId); return !!e && countsInTotals(e); });
  for (const c of claims) {
    const rec = receivedBy.get(c.id) ?? 0, linked = liveLinks.filter((l) => l.reimbursementId === c.id).reduce((a, l) => a + l.amountMinor, 0);
    const manual = c.status === "received" && rec === 0; // marked received by hand, with no deposit recorded against it
    const received = manual ? c.amountMinor : rec;
    const state: ClaimState = c.status === "written_off" ? "written_off" : received > c.amountMinor ? "over_received" : received === c.amountMinor ? "received" : received > 0 ? "partly_received" : "outstanding";
    out.set(c.id, { id: c.id, claimed: c.amountMinor, received, outstanding: c.status === "written_off" ? 0 : Math.max(0, c.amountMinor - received), overReceived: Math.max(0, received - c.amountMinor), linked, unlinked: Math.max(0, c.amountMinor - linked), overLinked: linked > c.amountMinor, state, reconciled: !manual });
  }
  const expenses = new Map<string, ExpenseRecon>();
  const claimById = new Map(claims.map((c) => [c.id, c]));
  for (const l of liveLinks) {
    const c = claimById.get(l.reimbursementId), cr = out.get(l.reimbursementId); if (!c || !cr || c.status === "written_off") continue;
    const sumLinks = liveLinks.filter((x) => x.reimbursementId === c.id).reduce((a, x) => a + x.amountMinor, 0);
    const share = sumLinks > 0 ? Math.min(l.amountMinor, Math.round((Math.min(cr.received, cr.claimed) * l.amountMinor) / sumLinks)) : 0;
    const e = byTxn.get(l.txnId)!; const cur = expenses.get(e.id) ?? { txnId: e.id, amount: Math.abs(e.amountMinor), claimed: 0, received: 0, outstanding: 0, unclaimed: Math.abs(e.amountMinor), state: "unclaimed" as ExpenseState };
    cur.claimed += l.amountMinor; cur.received += share; expenses.set(e.id, cur);
  }
  for (const e of expenses.values()) { e.outstanding = Math.max(0, e.claimed - e.received); e.unclaimed = Math.max(0, e.amount - e.claimed); e.state = e.received >= e.claimed ? "reimbursed" : e.received > 0 ? "partly_received" : "claimed"; }
  const unclaimedExpenses: ExpenseRecon[] = [];
  for (const t of txns) if (t.kind === "expense" && t.reimbursable && countsInTotals(t) && !expenses.has(t.id)) unclaimedExpenses.push({ txnId: t.id, amount: Math.abs(t.amountMinor), claimed: 0, received: 0, outstanding: 0, unclaimed: Math.abs(t.amountMinor), state: "unclaimed" });
  return { claims: out, expenses, unclaimedExpenses };
}
