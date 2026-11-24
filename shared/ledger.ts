import { type Minor, assertMinor } from "./money";

export type AccountType = "bank" | "credit_card" | "loan" | "investment" | "cash";
export type TxnKind = "income" | "expense" | "transfer" | "card_payment" | "loan_payment";

export interface Account {
  id: string;
  type: AccountType;
}

/**
 * One record per real-world event. `amountMinor` is signed from `accountId`'s point of view
 * (negative = money leaving). A move between two of the owner's own accounts carries `counterAccountId`
 * and is stored ONCE, never as two legs, which is what prevents double counting.
 */
export interface Txn {
  id: string;
  accountId: string;
  counterAccountId?: string;
  amountMinor: Minor;
}

export function deriveKind(txn: Txn, accounts: ReadonlyMap<string, Account>): TxnKind {
  assertMinor(txn.amountMinor);
  if (txn.counterAccountId) {
    const counter = accounts.get(txn.counterAccountId);
    if (!counter) throw new Error(`Unknown counter account for ${txn.id}`);
    if (counter.type === "credit_card") return "card_payment";
    if (counter.type === "loan") return "loan_payment";
    return "transfer";
  }
  return txn.amountMinor >= 0 ? "income" : "expense";
}

export interface CashFlow {
  income: Minor;
  expenses: Minor; // positive number
  net: Minor;
}

/** Income and spending only. Transfers and debt payments are excluded: the spending was counted when it was charged. */
export function cashFlow(txns: readonly Txn[], accounts: ReadonlyMap<string, Account>): CashFlow {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    const kind = deriveKind(t, accounts);
    if (kind === "income") income += t.amountMinor;
    else if (kind === "expense") expenses += -t.amountMinor;
  }
  return { income, expenses, net: income - expenses };
}

/** Per-account balance changes. A counter-account move yields two deltas that cancel out in net worth. */
export function balanceDeltas(txn: Txn): Array<{ accountId: string; delta: Minor }> {
  assertMinor(txn.amountMinor);
  const out = [{ accountId: txn.accountId, delta: txn.amountMinor }];
  if (txn.counterAccountId) out.push({ accountId: txn.counterAccountId, delta: -txn.amountMinor });
  return out;
}
