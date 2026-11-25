import { useMemo } from "react";
import { accountBalance, billOccurrences, billSummary, budgetUse, monthSummary, netWorth, netWorthSeries, nextPayday, projectedCash, reimbursementsOutstanding, savingsProgress, type AccountBalance } from "../../shared/finance";
import { formatMoney, parseMinor } from "../../shared/money";
import { addCycles, cycleOf } from "../../shared/progress";
import { useData } from "./data";
import type { FinanceData } from "./types";

/** Dollars for display. CAD everywhere. */
export const money = (minor: number | null | undefined, opts: { compact?: boolean; sign?: boolean; whole?: boolean } = {}): string => {
  if (minor === null || minor === undefined) return "—";
  if (opts.whole) { const w = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Math.abs(minor) / 100); return minor < 0 ? `−${w}` : opts.sign && minor > 0 ? `+${w}` : w; }
  const s = formatMoney(Math.abs(minor), { compact: opts.compact && Math.abs(minor) >= 1_000_000 });
  const out = opts.compact ? s.replace(/\.00$/, "") : s;
  return minor < 0 ? `−${out}` : opts.sign && minor > 0 ? `+${out}` : out;
};
/** Dollars typed by the owner ("12.50", "$1,200") to cents, or undefined when it is not an amount. */
export const toMinor = (text: string): number | undefined => { try { return parseMinor(text); } catch { return undefined; } };
export const toDollars = (minor: number | null | undefined): string => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));

/** Every figure the Finance screens show for one month, derived from the one synced data set by the shared, tested rules. */
export function useFinanceModel(month: string) {
  const { finance, today } = useData();
  return useMemo(() => (finance ? deriveFinance(finance, month, today) : null), [finance, month, today]);
}
export function deriveFinance(f: FinanceData, month: string, today: string) {
  const done = new Set(f.taskLinks.filter((l) => l.status === "completed").map((l) => `${l.billId}:${l.dueDate}`));
  const balances = new Map<string, AccountBalance>();
  const balanceOf = (id: string): AccountBalance => { let b = balances.get(id); if (!b) { b = accountBalance(id, f.balances, f.transactions); balances.set(id, b); } return b; };
  const live = f.accounts.filter((a) => !a.archivedAt);
  const summary = monthSummary(f.transactions, month);
  const occ = billOccurrences(f.bills, f.payments, month, today, done);
  const payday = nextPayday(f.incomePlans, today);
  const budget = budgetUse(f.budgets, month, summary.byCategory);
  const current = cycleOf(today);
  return {
    f, today, month, isCurrent: month === current, balanceOf, accounts: live, summary, occ, bills: billSummary(occ), payday, budget, done,
    net: netWorth(live, balanceOf), netSeries: netWorthSeries(live, f.balances, current, today, 6), cash: projectedCash(live, balanceOf, f.bills, f.payments, payday, today, done),
    savings: savingsProgress(live, balanceOf), reimb: reimbursementsOutstanding(f.reimbursements),
    catName: (id: string | null) => (id ? f.categories.find((c) => c.id === id)?.name ?? "" : ""), acctName: (id: string | null) => (id ? f.accounts.find((a) => a.id === id)?.name ?? "" : ""),
    months: monthsWithData(f, current),
  };
}
export type FinanceModel = NonNullable<ReturnType<typeof useFinanceModel>>;
/** The months a person can review: from the earliest transaction (or twelve months back) to this month. */
function monthsWithData(f: FinanceData, current: string): string[] {
  const earliest = f.transactions.map((t) => t.date.slice(0, 7)).sort()[0];
  const first = earliest ? [earliest, addCycles(current, -11)].sort().reverse()[0] : current;
  const out: string[] = []; for (let m = current; m >= first && out.length < 24; m = addCycles(m, -1)) out.push(m);
  return out;
}
