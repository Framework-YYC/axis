import { useState } from "react";
import { countsInTotals, estimateInterest } from "../../shared/finance";
import type { Recurrence } from "../../shared/recurrence";
import { api as _unused, patch, post } from "../lib/api";
import { useData } from "../lib/data";
import { pretty } from "../lib/dates";
import { money, toDollars, toMinor, useFinanceModel } from "../lib/finance";
import type { FinAccountV, FinBillV, FinIncomePlanV, FinReimbV, FinTxnV } from "../lib/types";
import { useSave } from "./editors";
import { Field, FormError, Modal, ModalActions, Select, TextArea, TextInput } from "./forms";
import { Btn, Status, Tag } from "./ui";

void _unused;
const opt = <T extends string>(rows: ReadonlyArray<[T, string]>) => rows.map(([value, label]) => ({ value, label }));
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const ACCOUNT_TYPES = opt([["bank", "Bank account"], ["savings", "Savings"], ["credit_card", "Credit card"], ["loan", "Loan"], ["investment", "Investment"], ["cash", "Cash"]]);
const num = (t: string): number | undefined => (t.trim() === "" || !Number.isFinite(Number(t)) ? undefined : Number(t));
const acctOpts = (accounts: FinAccountV[], blank?: string) => [...(blank ? [{ value: "", label: blank }] : []), ...accounts.filter((a) => !a.archivedAt).map((a) => ({ value: a.id, label: a.name }))];

/** "Repeats" in plain words, turned into a rule anchored on a real date. */
const REPEATS = opt([["monthly", "Every month"], ["biweekly", "Every 2 weeks"], ["weekly", "Every week"], ["yearly", "Every year"]]);
export function ruleFor(repeat: string, anchor: string): Recurrence {
  const day = Number(anchor.slice(8));
  return repeat === "weekly" ? { freq: "weekly", interval: 1, byWeekday: [dow(anchor)] } : repeat === "biweekly" ? { freq: "weekly", interval: 2, byWeekday: [dow(anchor)] } : repeat === "yearly" ? { freq: "yearly", interval: 1 } : { freq: "monthly", interval: 1, byMonthDay: day };
}
const repeatOf = (r?: Recurrence): string => (!r ? "monthly" : r.freq === "weekly" ? (r.interval === 2 ? "biweekly" : "weekly") : r.freq === "yearly" ? "yearly" : "monthly");

// ---------- transactions ----------
type TxnType = "expense" | "income" | "transfer";
export function TransactionEditor({ txn, defaults, onClose }: { txn?: FinTxnV; defaults?: { accountId?: string }; onClose: () => void }) {
  const { finance, today } = useData(); const { err, saving, run } = useSave(onClose);
  const accounts = finance?.accounts ?? []; const cats = finance?.categories ?? [];
  const type0: TxnType = !txn ? "expense" : txn.kind === "expense" ? "expense" : txn.kind === "income" || txn.kind === "reimbursement" ? "income" : "transfer";
  const [f, setF] = useState({ type: type0, account: txn?.accountId ?? defaults?.accountId ?? accounts.find((a) => a.type === "bank")?.id ?? accounts[0]?.id ?? "", counter: txn?.counterAccountId ?? "", date: txn?.date ?? today, amount: txn ? toDollars(Math.abs(txn.amountMinor)) : "", payee: txn?.payee ?? "", category: txn?.categoryId ?? "", status: (txn?.status ?? "confirmed") as string, reimbursable: txn?.reimbursable ? "yes" : "no", principal: toDollars(txn?.principalMinor), interest: toDollars(txn?.interestMinor), reason: "" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [local, setLocal] = useState<string | null>(null);
  const minor = toMinor(f.amount);
  const model = useFinanceModel(today.slice(0, 7));
  const loan = f.type === "transfer" ? accounts.find((a) => a.id === f.counter && a.type === "loan") : undefined;
  const owed = loan && model ? model.balanceOf(loan.id).amountMinor : null;
  const guess = loan && owed !== null && owed !== undefined ? estimateInterest(-owed, loan.interestRate) : null;
  const save = () => {
    setLocal(null);
    if (!minor || minor <= 0 || !f.account) return;
    if (f.type === "transfer" && !f.counter) return;
    const p = f.principal.trim() ? toMinor(f.principal) : undefined, n = f.interest.trim() ? toMinor(f.interest) : undefined;
    if (loan && ((f.principal.trim() && p === undefined) || (f.interest.trim() && n === undefined))) { setLocal("Principal and interest must be amounts in dollars."); return; }
    if (loan && p !== undefined && n !== undefined && p + n !== minor) { setLocal(`Principal and interest must add up to the payment (${money(minor)}).`); return; }
    const body = { kind: "transaction", account: f.account, counterAccount: f.type === "transfer" ? f.counter : null, date: f.date, amountMinor: f.type === "income" ? minor : -minor, payee: f.payee || null, category: f.type === "transfer" ? null : f.category || null, status: f.status, reimbursable: f.type === "expense" && f.reimbursable === "yes", ...(loan && p !== undefined ? { principalMinor: p } : {}), ...(loan && n !== undefined ? { interestMinor: n } : {}) };
    void run(() => (txn ? patch(`/finance/transaction/${txn.id}`, { ...body, expectedVersion: txn.version, ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) }) : post("/finance/transaction", body)));
  };
  return (
    <Modal title={txn ? "Edit transaction" : "New transaction"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err ?? local} />
      {accounts.length === 0 && <p className="mono mb-3 !normal-case">Add an account first.</p>}
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={f.type} onChange={set("type")} options={opt<TxnType>([["expense", "Expense"], ["income", "Income"], ["transfer", "Transfer or debt payment"]])} />}</Field>
        <Field label="Amount (CAD)">{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" />}</Field>
        <Field label={f.type === "transfer" ? "From account" : "Account"}>{(id) => <Select id={id} value={f.account} onChange={set("account")} options={acctOpts(accounts)} />}</Field>
        {f.type === "transfer" && <Field label="To account" hint="Savings, a credit card or a loan. Not counted as spending.">{(id) => <Select id={id} value={f.counter} onChange={set("counter")} options={acctOpts(accounts.filter((a) => a.id !== f.account), "Choose…")} />}</Field>}
        <Field label="Date">{(id) => <TextInput id={id} type="date" value={f.date} onChange={set("date")} />}</Field>
        <Field label={f.type === "income" ? "From" : "Payee"}>{(id) => <TextInput id={id} value={f.payee} onChange={set("payee")} maxLength={200} />}</Field>
        {f.type !== "transfer" && <Field label="Category">{(id) => <Select id={id} value={f.category} onChange={set("category")} options={[{ value: "", label: "None" }, ...cats.filter((c) => c.kind === (f.type === "income" ? "income" : "expense")).map((c) => ({ value: c.id, label: c.name }))]} />}</Field>}
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={opt([["confirmed", "Confirmed"], ["pending", "Pending"]])} />}</Field>
        {f.type === "expense" && <Field label="To be reimbursed">{(id) => <Select id={id} value={f.reimbursable} onChange={set("reimbursable")} options={opt([["no", "No"], ["yes", "Yes, claim it back"]])} />}</Field>}
        {loan && <>
          <Field label="Of which principal (CAD)" hint="The part that reduces what you owe.">{(id) => <TextInput id={id} inputMode="decimal" value={f.principal} onChange={set("principal")} placeholder="Not split" />}</Field>
          <Field label="Of which interest (CAD)" hint="The cost of borrowing. Counted as spending, not as a repayment.">{(id) => <TextInput id={id} inputMode="decimal" value={f.interest} onChange={set("interest")} placeholder="Not split" />}</Field>
          <div className="md:col-span-2 -mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            {guess !== null && <><Tag>Estimate</Tag><span>One month of interest at {loan.interestRate}% on {money(-(owed as number))} is about {money(guess)}.</span><Btn variant="ghost" onClick={() => set("interest")(toDollars(guess))}>Use as interest</Btn></>}
            {!f.principal.trim() && !f.interest.trim() && <span>Leave both empty if you do not know the split: the whole payment then counts as principal and is marked not split. Nothing is saved until you confirm it.</span>}
          </div>
        </>}
        {txn && <Field label="Reason for the change (optional)" className="md:col-span-2">{(id) => <TextInput id={id} value={f.reason} onChange={set("reason")} maxLength={300} placeholder="Kept in the transaction's history" />}</Field>}
      </div>
      {txn && <p className="mono mt-4 !normal-case !tracking-normal">{txn.source.kind === "assistant" ? "Filed via your Financial assistant" : "Added by you"}{txn.demo ? " · synthetic" : ""}</p>}
    </Modal>
  );
}

// ---------- bills ----------
export function BillEditor({ bill, onClose }: { bill?: FinBillV; onClose: () => void }) {
  const { finance, today } = useData(); const { err, saving, run } = useSave(onClose);
  const accounts = finance?.accounts ?? []; const cats = finance?.categories ?? [];
  const [f, setF] = useState({ name: bill?.name ?? "", amount: toDollars(bill?.amountMinor), kind: (bill?.amountKind ?? "fixed") as string, account: bill?.accountId ?? "", counter: bill?.counterAccountId ?? "", category: bill?.categoryId ?? "", repeat: repeatOf(bill?.recurrence), anchor: bill?.anchorDate ?? today, autopay: bill?.autopay ? "yes" : "no", active: bill?.active === false ? "no" : "yes", notes: bill?.notes ?? "" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.name.trim()) return;
    const m = f.amount.trim() ? toMinor(f.amount) : null; if (m === undefined) return;
    const body = { kind: "bill", name: f.name.trim(), amountMinor: m, amountKind: m === null ? "estimate" : f.kind, account: f.account || null, counterAccount: f.counter || null, category: f.category || null, recurrence: ruleFor(f.repeat, f.anchor), anchorDate: f.anchor, autopay: f.autopay === "yes", active: f.active === "yes", notes: f.notes || null };
    void run(() => (bill ? patch(`/finance/bill/${bill.id}`, { ...body, expectedVersion: bill.version }) : post("/finance/bill", body)));
  };
  return (
    <Modal title={bill ? "Edit bill" : "New bill"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Name" className="md:col-span-2">{(id) => <TextInput id={id} value={f.name} onChange={set("name")} maxLength={120} />}</Field>
        <Field label="Amount (CAD)" hint="Leave empty if it varies and you do not know it.">{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="Not known" />}</Field>
        <Field label="The amount is">{(id) => <Select id={id} value={f.kind} onChange={set("kind")} options={opt([["fixed", "Fixed"], ["estimate", "An estimate (it varies)"]])} />}</Field>
        <Field label="Repeats">{(id) => <Select id={id} value={f.repeat} onChange={set("repeat")} options={REPEATS} />}</Field>
        <Field label="A due date" hint="The rule follows this date (the day of the month or the weekday).">{(id) => <TextInput id={id} type="date" value={f.anchor} onChange={set("anchor")} />}</Field>
        <Field label="Paid from">{(id) => <Select id={id} value={f.account} onChange={set("account")} options={acctOpts(accounts, "Not set")} />}</Field>
        <Field label="Pays off" hint="A credit card or loan: the payment is a debt repayment, not spending.">{(id) => <Select id={id} value={f.counter} onChange={set("counter")} options={acctOpts(accounts.filter((a) => a.type === "credit_card" || a.type === "loan"), "Nothing (a normal bill)")} />}</Field>
        <Field label="Category">{(id) => <Select id={id} value={f.category} onChange={set("category")} options={[{ value: "", label: "None" }, ...cats.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.name }))]} />}</Field>
        <Field label="Automatic payment">{(id) => <Select id={id} value={f.autopay} onChange={set("autopay")} options={opt([["no", "No"], ["yes", "Yes"]])} />}</Field>
        {bill && <Field label="Active">{(id) => <Select id={id} value={f.active} onChange={set("active")} options={opt([["yes", "Yes"], ["no", "No, stopped"]])} />}</Field>}
        <Field label="Notes" className="md:col-span-2">{(id) => <TextArea id={id} value={f.notes} onChange={set("notes")} rows={2} />}</Field>
      </div>
    </Modal>
  );
}

export function PayBillDialog({ bill, dueDate, onClose }: { bill: FinBillV; dueDate: string; onClose: () => void }) {
  const { finance, today } = useData(); const { err, saving, run } = useSave(onClose);
  const [f, setF] = useState({ amount: bill.amountKind === "fixed" ? toDollars(bill.amountMinor) : "", paidOn: today <= dueDate ? today : dueDate, account: bill.accountId ?? "", principal: "", interest: "" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [local, setLocal] = useState<string | null>(null);
  const model = useFinanceModel(today.slice(0, 7));
  const loan = finance?.accounts.find((a) => a.id === bill.counterAccountId && a.type === "loan");
  const owed = loan && model ? model.balanceOf(loan.id).amountMinor : null;
  const guess = loan && owed !== null && owed !== undefined ? estimateInterest(-owed, loan.interestRate) : null;
  const pay = (skip: boolean) => {
    setLocal(null); const m = f.amount.trim() ? toMinor(f.amount) : undefined;
    const p = f.principal.trim() ? toMinor(f.principal) : undefined, n = f.interest.trim() ? toMinor(f.interest) : undefined;
    if (!skip && loan && ((f.principal.trim() && p === undefined) || (f.interest.trim() && n === undefined))) { setLocal("Principal and interest must be amounts in dollars."); return; }
    const total = m ?? (bill.amountKind === "fixed" ? bill.amountMinor ?? undefined : undefined);
    if (!skip && loan && p !== undefined && n !== undefined && total !== undefined && p + n !== total) { setLocal(`Principal and interest must add up to the payment (${money(total)}).`); return; }
    void run(() => post("/finance/pay-bill", { bill: bill.id, dueDate, today, ...(skip ? { skip: true } : { paidOn: f.paidOn, ...(m ? { amountMinor: m } : {}), ...(f.account ? { account: f.account } : {}), ...(loan && p !== undefined ? { principalMinor: p } : {}), ...(loan && n !== undefined ? { interestMinor: n } : {}) }) }));
  };
  return (
    <Modal title={`${bill.name}, due ${dueDate}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={() => pay(true)}>Skip this one</Btn><Btn variant="primary" onClick={() => pay(false)} disabled={saving}>Confirm paid</Btn></>}>
      <FormError message={err ?? local} />
      <div className="grid gap-3.5">
        <Field label="Amount paid (CAD)" hint={bill.amountKind === "fixed" ? "The fixed amount is used if you leave this." : "This bill varies: enter what was actually paid."}>{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder={bill.amountMinor ? money(bill.amountMinor) : "0.00"} />}</Field>
        <Field label="Paid on">{(id) => <TextInput id={id} type="date" value={f.paidOn} onChange={set("paidOn")} />}</Field>
        <Field label="Paid from">{(id) => <Select id={id} value={f.account} onChange={set("account")} options={acctOpts(finance?.accounts ?? [], "Not recorded")} />}</Field>
        {loan && <>
          <Field label="Of which principal (CAD)" hint="Reduces what you owe on the loan.">{(id) => <TextInput id={id} inputMode="decimal" value={f.principal} onChange={set("principal")} placeholder="Not split" />}</Field>
          <Field label="Of which interest (CAD)" hint="Counted as spending, not as a repayment.">{(id) => <TextInput id={id} inputMode="decimal" value={f.interest} onChange={set("interest")} placeholder="Not split" />}</Field>
          {guess !== null && <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted"><Tag>Estimate</Tag><span>One month at {loan.interestRate}% on {money(-(owed as number))} is about {money(guess)}.</span><Btn variant="ghost" onClick={() => set("interest")(toDollars(guess))}>Use as interest</Btn></div>}
        </>}
      </div>
      <p className="mono mt-3 !normal-case !tracking-normal">Confirming records one payment and one transaction. Confirming again changes nothing. Paid by mistake? You can reverse a payment later.</p>
    </Modal>
  );
}

// ---------- accounts and balances ----------
export function AccountEditor({ account, onClose }: { account?: FinAccountV; onClose: () => void }) {
  const { today } = useData(); const { err, saving, run } = useSave(onClose);
  const [f, setF] = useState({ name: account?.name ?? "", type: (account?.type ?? "bank") as string, institution: account?.institution ?? "", limit: toDollars(account?.creditLimitMinor), statementDay: String(account?.statementDay ?? ""), dueDay: String(account?.dueDay ?? ""), minPay: toDollars(account?.minPaymentMinor), rate: String(account?.interestRate ?? ""), principal: toDollars(account?.originalPrincipalMinor), target: toDollars(account?.targetMinor), targetDate: account?.targetDate ?? "", balance: "", asOf: today, archived: account?.archivedAt ? "yes" : "no" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const m = (t: string) => (t.trim() ? toMinor(t) : null);
  const save = async () => {
    if (!f.name.trim()) return;
    const body: Record<string, unknown> = { kind: "account", name: f.name.trim(), type: f.type, institution: f.institution || null, creditLimitMinor: f.type === "credit_card" ? m(f.limit) ?? null : null, statementDay: f.type === "credit_card" ? num(f.statementDay) ?? null : null, dueDay: f.type === "credit_card" || f.type === "loan" ? num(f.dueDay) ?? null : null, minPaymentMinor: f.type === "credit_card" || f.type === "loan" ? m(f.minPay) ?? null : null, interestRate: f.type === "credit_card" || f.type === "loan" || f.type === "savings" ? num(f.rate) ?? null : null, originalPrincipalMinor: f.type === "loan" ? m(f.principal) ?? null : null, targetMinor: f.type === "savings" ? m(f.target) ?? null : null, targetDate: f.type === "savings" && f.targetDate ? f.targetDate : null, archived: f.archived === "yes" };
    await run(async () => {
      const r = account ? await patch(`/finance/account/${account.id}`, { ...body, expectedVersion: account.version }) : await post<{ record: { id: string } }>("/finance/account", body);
      const bal = f.balance.trim() ? toMinor(f.balance) : undefined;
      if (r.success && !account && bal !== undefined) { const id = (r.data as { record: { id: string } }).record.id; await post("/finance/balance", { account: id, asOf: f.asOf, amountMinor: f.type === "credit_card" || f.type === "loan" ? -Math.abs(bal) : bal, basis: "confirmed" }); }
      return r;
    });
  };
  const debt = f.type === "credit_card" || f.type === "loan";
  return (
    <Modal title={account ? "Edit account" : "New account"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={() => void save()} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Name">{(id) => <TextInput id={id} value={f.name} onChange={set("name")} maxLength={120} />}</Field>
        <Field label="Type">{(id) => <Select id={id} value={f.type} onChange={set("type")} options={ACCOUNT_TYPES} />}</Field>
        <Field label="Institution (optional)">{(id) => <TextInput id={id} value={f.institution} onChange={set("institution")} maxLength={120} />}</Field>
        {!account && <Field label={debt ? "Amount owed now (optional)" : "Balance now (optional)"} hint="Only what you know. Nothing is assumed.">{(id) => <TextInput id={id} inputMode="decimal" value={f.balance} onChange={set("balance")} placeholder="Not recorded" />}</Field>}
        {!account && f.balance && <Field label="As of">{(id) => <TextInput id={id} type="date" value={f.asOf} onChange={set("asOf")} />}</Field>}
        {f.type === "credit_card" && <><Field label="Credit limit (CAD)">{(id) => <TextInput id={id} inputMode="decimal" value={f.limit} onChange={set("limit")} />}</Field><Field label="Statement day of month">{(id) => <TextInput id={id} inputMode="numeric" value={f.statementDay} onChange={set("statementDay")} />}</Field></>}
        {debt && <><Field label="Payment due day of month">{(id) => <TextInput id={id} inputMode="numeric" value={f.dueDay} onChange={set("dueDay")} />}</Field><Field label="Minimum payment (CAD)">{(id) => <TextInput id={id} inputMode="decimal" value={f.minPay} onChange={set("minPay")} />}</Field></>}
        {(debt || f.type === "savings") && <Field label="Interest rate (% a year)">{(id) => <TextInput id={id} inputMode="decimal" value={f.rate} onChange={set("rate")} />}</Field>}
        {f.type === "loan" && <Field label="Amount borrowed (CAD)" hint="Used for repayment progress.">{(id) => <TextInput id={id} inputMode="decimal" value={f.principal} onChange={set("principal")} />}</Field>}
        {f.type === "savings" && <><Field label="Savings target (CAD)">{(id) => <TextInput id={id} inputMode="decimal" value={f.target} onChange={set("target")} />}</Field><Field label="Target date (optional)">{(id) => <TextInput id={id} type="date" value={f.targetDate} onChange={set("targetDate")} />}</Field></>}
        {account && <Field label="Archived">{(id) => <Select id={id} value={f.archived} onChange={set("archived")} options={opt([["no", "No"], ["yes", "Yes, hide it"]])} />}</Field>}
      </div>
    </Modal>
  );
}

export function BalanceEditor({ account, onClose }: { account: FinAccountV; onClose: () => void }) {
  const { today } = useData(); const { err, saving, run } = useSave(onClose);
  const debt = account.type === "credit_card" || account.type === "loan";
  const [f, setF] = useState({ amount: "", asOf: today, basis: "confirmed" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => { const m = toMinor(f.amount); if (m === undefined) return; void run(() => post("/finance/balance", { account: account.id, asOf: f.asOf, amountMinor: debt ? -Math.abs(m) : m, basis: f.basis })); };
  return (
    <Modal title={`Update balance: ${account.name}`} onClose={onClose} footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5">
        <Field label={debt ? "Amount owed (CAD)" : "Balance (CAD)"} hint={debt ? "Enter what you owe as a positive number." : undefined}>{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" />}</Field>
        <Field label="As of">{(id) => <TextInput id={id} type="date" value={f.asOf} onChange={set("asOf")} />}</Field>
        <Field label="This figure is" hint="A confirmed balance comes from a statement or the bank; an estimate is your best guess.">{(id) => <Select id={id} value={f.basis} onChange={set("basis")} options={opt([["confirmed", "Confirmed"], ["estimate", "An estimate"]])} />}</Field>
      </div>
    </Modal>
  );
}

// ---------- budgets, income, reimbursements ----------
export function BudgetEditor({ month, onClose }: { month: string; onClose: () => void }) {
  const { finance } = useData(); const { err, saving, run } = useSave(onClose);
  const cats = (finance?.categories ?? []).filter((c) => c.kind === "expense");
  const [f, setF] = useState({ category: cats[0]?.id ?? "", amount: "", scope: "*" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const existing = finance?.budgets.find((b) => b.categoryId === f.category && b.cycle === f.scope);
  const save = () => { const m = toMinor(f.amount); if (m === undefined || !f.category) return; void run(() => post("/finance/budget", { category: f.category, cycle: f.scope, amountMinor: m })); };
  return (
    <Modal title="Set a budget" onClose={onClose} footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5">
        <Field label="Category">{(id) => <Select id={id} value={f.category} onChange={set("category")} options={cats.map((c) => ({ value: c.id, label: c.name }))} />}</Field>
        <Field label="Monthly budget (CAD)" hint={existing ? `Currently ${money(existing.amountMinor)}.` : undefined}>{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" />}</Field>
        <Field label="Applies to">{(id) => <Select id={id} value={f.scope} onChange={set("scope")} options={[{ value: "*", label: "Every month" }, { value: month, label: `Only ${month}` }]} />}</Field>
      </div>
    </Modal>
  );
}

export function IncomePlanEditor({ plan, onClose }: { plan?: FinIncomePlanV; onClose: () => void }) {
  const { finance, today } = useData(); const { err, saving, run } = useSave(onClose);
  const [f, setF] = useState({ name: plan?.name ?? "", amount: toDollars(plan?.amountMinor), kind: (plan?.amountKind ?? "estimate") as string, repeat: repeatOf(plan?.recurrence) === "monthly" && !plan ? "biweekly" : repeatOf(plan?.recurrence), anchor: plan?.anchorDate ?? today, account: plan?.accountId ?? "", active: plan?.active === false ? "no" : "yes" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.name.trim()) return; const m = f.amount.trim() ? toMinor(f.amount) : null; if (m === undefined) return;
    const body = { kind: "income_plan", name: f.name.trim(), amountMinor: m, amountKind: f.kind, recurrence: ruleFor(f.repeat, f.anchor), anchorDate: f.anchor, account: f.account || null, active: f.active === "yes" };
    void run(() => (plan ? patch(`/finance/income_plan/${plan.id}`, { ...body, expectedVersion: plan.version }) : post("/finance/income_plan", body)));
  };
  return (
    <Modal title={plan ? "Edit expected income" : "New expected income"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Name" className="md:col-span-2">{(id) => <TextInput id={id} value={f.name} onChange={set("name")} maxLength={120} placeholder="Pay" />}</Field>
        <Field label="Expected amount (CAD)" hint="Take-home pay. Leave empty if you do not know it.">{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="Not known" />}</Field>
        <Field label="The amount is">{(id) => <Select id={id} value={f.kind} onChange={set("kind")} options={opt([["estimate", "An estimate"], ["fixed", "Fixed"]])} />}</Field>
        <Field label="Paid">{(id) => <Select id={id} value={f.repeat} onChange={set("repeat")} options={REPEATS} />}</Field>
        <Field label="A payday" hint="The schedule follows this date.">{(id) => <TextInput id={id} type="date" value={f.anchor} onChange={set("anchor")} />}</Field>
        <Field label="Deposited to">{(id) => <Select id={id} value={f.account} onChange={set("account")} options={acctOpts(finance?.accounts ?? [], "Not set")} />}</Field>
        {plan && <Field label="Active">{(id) => <Select id={id} value={f.active} onChange={set("active")} options={opt([["yes", "Yes"], ["no", "No"]])} />}</Field>}
      </div>
      <p className="mono mt-3 !normal-case !tracking-normal">Expected income is a plan: it is never counted as income received until the deposit is recorded.</p>
    </Modal>
  );
}

export function ReimbursementEditor({ item, onClose }: { item?: FinReimbV; onClose: () => void }) {
  const { finance, today } = useData(); const { err, saving, run } = useSave(onClose);
  const [f, setF] = useState({ description: item?.description ?? "", amount: toDollars(item?.amountMinor), payer: item?.payer ?? "", claimedOn: item?.claimedOn ?? today, expected: item?.expectedDate ?? "", status: (item?.status ?? "outstanding") as string });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const mine = new Map((finance?.reimbursementLinks ?? []).filter((l) => l.reimbursementId === item?.id).map((l) => [l.txnId, l.amountMinor]));
  const [picked, setPicked] = useState<string[]>([...mine.keys()]); const [touched, setTouched] = useState(false); const [local, setLocal] = useState<string | null>(null);
  const taken = (txnId: string) => (finance?.reimbursementLinks ?? []).filter((l) => l.txnId === txnId && l.reimbursementId !== item?.id).reduce((a, l) => a + l.amountMinor, 0);
  const candidates = (finance?.transactions ?? []).filter((t) => t.kind === "expense" && countsInTotals(t) && (mine.has(t.id) || (t.reimbursable && taken(t.id) < Math.abs(t.amountMinor)))).slice(0, 40);
  const share = (id: string) => mine.get(id) ?? Math.abs(finance?.transactions.find((t) => t.id === id)?.amountMinor ?? 0) - taken(id);
  const rec = finance?.reconciliation.claims.find((c) => c.id === item?.id);
  const save = () => {
    setLocal(null);
    const m = toMinor(f.amount); if (!f.description.trim() || !m || m <= 0) return;
    const expenses = picked.map((id) => ({ txn: id, amountMinor: share(id) }));
    if (touched && expenses.reduce((a, e) => a + e.amountMinor, 0) > m) { setLocal(`The linked expenses (${money(expenses.reduce((a, e) => a + e.amountMinor, 0))}) are more than the claim (${money(m)}).`); return; }
    const body = { kind: "reimbursement", description: f.description.trim(), amountMinor: m, payer: f.payer || null, claimedOn: f.claimedOn || null, expectedDate: f.expected || null, status: f.status, ...(touched ? { expenses } : {}) };
    void run(() => (item ? patch(`/finance/reimbursement/${item.id}`, { ...body, expectedVersion: item.version }) : post("/finance/reimbursement", body)));
  };
  return (
    <Modal title={item ? "Edit reimbursement" : "New reimbursement claim"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err ?? local} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="What for" className="md:col-span-2">{(id) => <TextInput id={id} value={f.description} onChange={set("description")} maxLength={300} />}</Field>
        <Field label="Amount (CAD)">{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} />}</Field>
        <Field label="Owed by">{(id) => <TextInput id={id} value={f.payer} onChange={set("payer")} maxLength={200} />}</Field>
        <Field label="Claimed on">{(id) => <TextInput id={id} type="date" value={f.claimedOn} onChange={set("claimedOn")} />}</Field>
        <Field label="Expected by (optional)">{(id) => <TextInput id={id} type="date" value={f.expected} onChange={set("expected")} />}</Field>
        {item && <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={opt([["outstanding", "Outstanding"], ["received", "Received"], ["written_off", "Written off"]])} />}</Field>}
        <div className="md:col-span-2">
          <p className="mono mb-1.5">Expenses this claim recovers</p>
          {candidates.length === 0 ? <p className="text-[12.5px] text-muted">No expenses are marked "to be reimbursed" yet. Mark an expense when you record it, then link it here.</p> : (
            <div role="group" aria-label="Linked expenses" className="flex flex-wrap gap-1.5">
              {candidates.map((t) => { const on = picked.includes(t.id); return <button key={t.id} type="button" aria-pressed={on} onClick={() => { setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id]); setTouched(true); }} className={`min-h-11 rounded-full px-3.5 text-left text-[12.5px] font-medium md:min-h-9 ${on ? "bg-[var(--pill-bg)] text-[var(--pill-ink)]" : "inset text-muted"}`}>{on ? "Linked: " : ""}{t.payee ?? "Expense"} · {money(Math.abs(t.amountMinor))} · {pretty(t.date)}</button>; })}
            </div>
          )}
        </div>
      </div>
      {rec && (
        <div className="panel-dim mt-4 p-3.5 text-[13px]" aria-label="Reconciliation">
          <p className="mono mb-1.5">Reconciliation</p>
          <p>Claimed {money(rec.claimed)} · received {money(rec.received)} · outstanding {money(rec.outstanding)}</p>
          <p className="mt-1 text-muted">{rec.state === "over_received" ? `Received ${money(rec.overReceived)} more than claimed. Check the deposit.` : rec.reconciled ? "Matched to the deposits recorded against this claim." : "Marked received by hand: no deposit is recorded against it."}{rec.unlinked > 0 ? ` ${money(rec.unlinked)} is not linked to an expense.` : ""}</p>
        </div>
      )}
      <p className="mono mt-3 !normal-case !tracking-normal">Record each deposit as a transaction linked to this claim: the claim is received once the deposits cover it, and the money is never counted as income. Changing the status here does not move money.</p>
    </Modal>
  );
}

// ---------- corrections: transaction detail, void, reverse, reverse a bill payment ----------
const FIELD_LABEL: Record<string, string> = { amountMinor: "Amount", date: "Date", payee: "Payee", description: "Description", categoryId: "Category", accountId: "Account", counterAccountId: "To account", status: "Status", reimbursable: "To be reimbursed", kind: "Kind", principalMinor: "Principal", interestMinor: "Interest", externalId: "Reference", claimedMinor: "Claimed" };
const MONEY_FIELDS = new Set(["amountMinor", "principalMinor", "interestMinor", "claimedMinor"]);
const ACTION_LABEL: Record<string, string> = { edit: "Edited", void: "Voided", reverse: "Reversed", reversal_entry: "Created as the reversal", payment_reversed: "Bill payment reversed", link: "Reimbursement link" };
const KINDS: Record<string, string> = { income: "Income", expense: "Expense", transfer: "Transfer", card_payment: "Card payment", loan_payment: "Loan payment", reimbursement: "Reimbursement" };

/** One transaction in full, with its history and the three things that can be done to it: edit, reverse, void. Nothing is ever deleted. */
export function TransactionSheet({ txn, onClose, onEdit }: { txn: FinTxnV; onClose: () => void; onEdit: () => void }) {
  const { finance, today } = useData(); const { err, saving, run } = useSave(onClose);
  const [step, setStep] = useState<"view" | "void" | "reverse">("view"); const [reason, setReason] = useState(""); const [date, setDate] = useState(today);
  const name = (id: string | null) => (id ? finance?.accounts.find((a) => a.id === id)?.name ?? "" : "");
  const cat = (id: string | null) => (id ? finance?.categories.find((c) => c.id === id)?.name ?? "" : "");
  const original = txn.reversalOf ? finance?.transactions.find((t) => t.id === txn.reversalOf) : undefined; const reversal = txn.reversedBy ? finance?.transactions.find((t) => t.id === txn.reversedBy) : undefined;
  const frozen = !!txn.voidedAt || !!txn.reversalOf || !!txn.reversedBy;
  const exp = finance?.reconciliation.expenses.find((e) => e.txnId === txn.id); const claim = txn.reimbursementId ? finance?.reconciliation.claims.find((c) => c.id === txn.reimbursementId) : undefined;
  const history = (finance?.history ?? []).filter((h) => h.txnId === txn.id);
  const bill = txn.billId ? finance?.bills.find((b) => b.id === txn.billId) : undefined;
  const fmt = (field: string, x: unknown) => (x === null || x === undefined || x === "" ? "none" : MONEY_FIELDS.has(field) && typeof x === "number" ? money(x) : field === "categoryId" ? cat(String(x)) || String(x) : field === "accountId" || field === "counterAccountId" ? name(String(x)) || String(x) : typeof x === "boolean" || x === 0 || x === 1 ? (field === "reimbursable" ? (x ? "Yes" : "No") : String(x)) : String(x));
  const confirm = () => { if (!reason.trim()) return; void run(() => post(step === "void" ? "/finance/void-transaction" : "/finance/reverse-transaction", { id: txn.id, reason: reason.trim(), today, ...(step === "reverse" ? { date } : {}) })); };
  const state = txn.voidedAt ? "Voided" : txn.reversedBy ? "Reversed" : txn.reversalOf ? "Reversal entry" : txn.status === "pending" ? "Pending" : "Confirmed";
  const rows: Array<[string, string]> = [["Date", pretty(txn.date)], ["Kind", KINDS[txn.kind] ?? txn.kind], ["Account", name(txn.accountId)], ...(txn.counterAccountId ? [["To account", name(txn.counterAccountId)] as [string, string]] : []), ...(txn.categoryId ? [["Category", cat(txn.categoryId)] as [string, string]] : []), ["Status", state]];
  const footer = frozen ? <><span /><Btn variant="ghost" onClick={onClose}>Close</Btn></>
    : step === "view" ? <><div className="flex gap-2"><Btn variant="soft" onClick={() => setStep("reverse")}>Reverse</Btn><Btn variant="soft" onClick={() => setStep("void")}>Void</Btn></div><Btn variant="primary" onClick={onEdit}>Edit</Btn></>
    : <><Btn variant="ghost" onClick={() => setStep("view")}>Back</Btn><Btn variant="primary" onClick={confirm} disabled={saving || !reason.trim()}>{step === "void" ? "Void this transaction" : "Reverse this transaction"}</Btn></>;
  return (
    <Modal title={txn.payee || KINDS[txn.kind] || "Transaction"} onClose={onClose} footer={footer}>
      <FormError message={err} />
      <div className="flex items-baseline justify-between gap-3"><p className="num text-[28px] font-light leading-none tracking-tight">{money(txn.amountMinor, { sign: true })}</p>{state !== "Confirmed" && <Status tone={state === "Pending" ? "warn" : "idle"}>{state}</Status>}</div>
      <dl className="mt-3 text-[13.5px]">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-t border-line py-1.5 first:border-t-0"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>
      {txn.kind === "loan_payment" && <p className="mt-2 text-[13px]">{txn.principalMinor === null || txn.principalMinor === undefined ? "Not split: the whole payment counts as principal." : `Principal ${money(txn.principalMinor)} · interest ${money(Math.abs(txn.amountMinor) - txn.principalMinor)} (interest counts as spending).`}</p>}
      {bill && txn.billDue && <p className="mt-2 text-[13px] text-muted">Payment of {bill.name}, due {pretty(txn.billDue)}.</p>}
      {exp && <p className="mt-2 text-[13px]">Reimbursement: {money(exp.claimed)} claimed · {money(exp.received)} received · {money(exp.outstanding)} outstanding{exp.unclaimed > 0 ? ` · ${money(exp.unclaimed)} not claimed` : ""}.</p>}
      {!exp && txn.reimbursable && txn.kind === "expense" && !frozen && <p className="mt-2 text-[13px] text-muted">To be reimbursed, but not yet claimed.</p>}
      {claim && <p className="mt-2 text-[13px]">Received against a claim of {money(claim.claimed)}: {money(claim.received)} so far{claim.overReceived ? ` (${money(claim.overReceived)} over)` : ""}.</p>}
      {txn.voidedAt && <p className="panel-dim mt-3 p-3 text-[13px]">Voided {pretty(txn.voidedAt.slice(0, 10))} by {txn.voidedBy ?? "you"}: {txn.voidReason}. It stays on record but counts nowhere.</p>}
      {original && <p className="panel-dim mt-3 p-3 text-[13px]">Reverses {original.payee ?? "a transaction"} of {money(original.amountMinor, { sign: true })} on {pretty(original.date)}. Together they net to zero.</p>}
      {reversal && <p className="panel-dim mt-3 p-3 text-[13px]">Reversed on {pretty(reversal.date)}{reversal.description ? `: ${reversal.description.replace(/^Reversal: /, "")}` : ""}. Both stay on record and net to zero.</p>}
      {step !== "view" && !frozen && (
        <div className="mt-4 grid gap-3.5">
          <p className="text-[13px]">{step === "void" ? "Void this if it should never have been recorded. It stays on record with your reason, but no balance, total, bill or claim counts it." : "Reverse this if it really happened and was then undone. An opposite entry is added; both stay on record and net to zero."}{txn.billId ? " It also marks the bill payment as reversed, so the bill is unpaid again and its task reopens." : ""}{txn.reimbursementId ? " The claim it settled goes back to outstanding." : ""}</p>
          <Field label="Reason (kept on record)">{(id) => <TextInput id={id} value={reason} onChange={setReason} maxLength={300} placeholder={step === "void" ? "For example: entered twice" : "For example: merchant refunded it"} />}</Field>
          {step === "reverse" && <Field label="Reversal date">{(id) => <TextInput id={id} type="date" value={date} onChange={setDate} />}</Field>}
        </div>
      )}
      {history.length > 0 && step === "view" && (
        <div className="mt-4"><p className="mono mb-1.5">History</p>
          <ul className="text-[13px]">{history.map((h, i) => (
            <li key={i} className="border-t border-line py-1.5 first:border-t-0"><p className="flex justify-between gap-3"><span>{ACTION_LABEL[h.action] ?? h.action}{h.reason ? <span className="text-muted"> · {h.reason}</span> : null}</span><span className="mono shrink-0 !normal-case">{h.at.slice(5, 16).replace("T", " ")}</span></p>
              {h.action === "edit" && h.changed.length > 0 && <p className="text-muted">{h.changed.map((c) => `${FIELD_LABEL[c.field] ?? c.field}: ${fmt(c.field, c.from)} → ${fmt(c.field, c.to)}`).join(" · ")}</p>}
              <p className="mono !normal-case !tracking-normal">{h.actorLabel.replace(/^ChatGPT: /, "")}</p></li>))}</ul></div>
      )}
      <p className="mono mt-4 !normal-case !tracking-normal">{txn.source.kind === "assistant" ? "Filed via your Financial assistant" : "Added by you"}{txn.demo ? " · synthetic" : ""}</p>
    </Modal>
  );
}

/** Undo a bill payment confirmation (or a skip). The occurrence is unpaid again; its transaction is voided or reversed; the task it completed is reopened. */
export function ReversePaymentDialog({ bill, dueDate, skipped, viaTask, onClose }: { bill: FinBillV; dueDate: string; skipped?: boolean; viaTask?: boolean; onClose: () => void }) {
  const { today } = useData(); const { err, saving, run } = useSave(onClose);
  const [reason, setReason] = useState(""); const [how, setHow] = useState("void");
  const go = () => { if (!reason.trim()) return; void run(() => post("/finance/reverse-bill-payment", { bill: bill.id, dueDate, reason: reason.trim(), how, today })); };
  return (
    <Modal title={skipped ? `Undo skip: ${bill.name}` : `Reverse payment: ${bill.name}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={go} disabled={saving || !reason.trim()}>{saving ? "Saving…" : skipped ? "Undo skip" : "Reverse payment"}</Btn></>}>
      <FormError message={err} />
      <p className="mb-3.5 text-[13px]">{skipped ? `${bill.name} due ${pretty(dueDate)} goes back to unpaid.` : viaTask ? `${bill.name} due ${pretty(dueDate)} was marked paid by completing its task. The task is reopened and the bill is unpaid again.` : `${bill.name} due ${pretty(dueDate)} becomes unpaid again, its transaction no longer counts, and the task the payment completed is reopened. You can confirm it again afterwards.`}</p>
      <div className="grid gap-3.5">
        <Field label="Reason (kept on record)">{(id) => <TextInput id={id} value={reason} onChange={setReason} maxLength={300} placeholder="For example: paid from the wrong account" />}</Field>
        {!skipped && !viaTask && <Field label="How to record it" hint="Void if the payment was recorded in error. Reverse if the money really went out and came back.">{(id) => <Select id={id} value={how} onChange={setHow} options={opt([["void", "Void it: recorded in error"], ["reverse", "Reverse it: the money came back"]])} />}</Field>}
      </div>
    </Modal>
  );
}
