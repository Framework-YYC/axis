import { useState } from "react";
import type { Recurrence } from "../../shared/recurrence";
import { api as _unused, patch, post } from "../lib/api";
import { useData } from "../lib/data";
import { money, toDollars, toMinor } from "../lib/finance";
import type { FinAccountV, FinBillV, FinIncomePlanV, FinReimbV, FinTxnV } from "../lib/types";
import { useSave } from "./editors";
import { Field, FormError, Modal, ModalActions, Select, TextArea, TextInput } from "./forms";
import { Btn } from "./ui";

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
  const [f, setF] = useState({ type: type0, account: txn?.accountId ?? defaults?.accountId ?? accounts.find((a) => a.type === "bank")?.id ?? accounts[0]?.id ?? "", counter: txn?.counterAccountId ?? "", date: txn?.date ?? today, amount: txn ? toDollars(Math.abs(txn.amountMinor)) : "", payee: txn?.payee ?? "", category: txn?.categoryId ?? "", status: (txn?.status ?? "confirmed") as string, reimbursable: txn?.reimbursable ? "yes" : "no" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const minor = toMinor(f.amount);
  const save = () => {
    if (!minor || minor <= 0 || !f.account) return;
    if (f.type === "transfer" && !f.counter) return;
    const body = { kind: "transaction", account: f.account, counterAccount: f.type === "transfer" ? f.counter : null, date: f.date, amountMinor: f.type === "income" ? minor : -minor, payee: f.payee || null, category: f.type === "transfer" ? null : f.category || null, status: f.status, reimbursable: f.type === "expense" && f.reimbursable === "yes" };
    void run(() => (txn ? patch(`/finance/transaction/${txn.id}`, { ...body, expectedVersion: txn.version }) : post("/finance/transaction", body)));
  };
  return (
    <Modal title={txn ? "Edit transaction" : "New transaction"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
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
  const [f, setF] = useState({ amount: bill.amountKind === "fixed" ? toDollars(bill.amountMinor) : "", paidOn: today <= dueDate ? today : dueDate, account: bill.accountId ?? "" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const pay = (skip: boolean) => { const m = f.amount.trim() ? toMinor(f.amount) : undefined; void run(() => post("/finance/pay-bill", { bill: bill.id, dueDate, today, ...(skip ? { skip: true } : { paidOn: f.paidOn, ...(m ? { amountMinor: m } : {}), ...(f.account ? { account: f.account } : {}) }) })); };
  return (
    <Modal title={`${bill.name}, due ${dueDate}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={() => pay(true)}>Skip this one</Btn><Btn variant="primary" onClick={() => pay(false)} disabled={saving}>Confirm paid</Btn></>}>
      <FormError message={err} />
      <div className="grid gap-3.5">
        <Field label="Amount paid (CAD)" hint={bill.amountKind === "fixed" ? "The fixed amount is used if you leave this." : "This bill varies: enter what was actually paid."}>{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder={bill.amountMinor ? money(bill.amountMinor) : "0.00"} />}</Field>
        <Field label="Paid on">{(id) => <TextInput id={id} type="date" value={f.paidOn} onChange={set("paidOn")} />}</Field>
        <Field label="Paid from">{(id) => <Select id={id} value={f.account} onChange={set("account")} options={acctOpts(finance?.accounts ?? [], "Not recorded")} />}</Field>
      </div>
      <p className="mono mt-3 !normal-case !tracking-normal">Confirming records one payment and one transaction. Confirming again changes nothing.</p>
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
  const { today } = useData(); const { err, saving, run } = useSave(onClose);
  const [f, setF] = useState({ description: item?.description ?? "", amount: toDollars(item?.amountMinor), payer: item?.payer ?? "", claimedOn: item?.claimedOn ?? today, expected: item?.expectedDate ?? "", status: (item?.status ?? "outstanding") as string });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    const m = toMinor(f.amount); if (!f.description.trim() || !m || m <= 0) return;
    const body = { kind: "reimbursement", description: f.description.trim(), amountMinor: m, payer: f.payer || null, claimedOn: f.claimedOn || null, expectedDate: f.expected || null, status: f.status };
    void run(() => (item ? patch(`/finance/reimbursement/${item.id}`, { ...body, expectedVersion: item.version }) : post("/finance/reimbursement", body)));
  };
  return (
    <Modal title={item ? "Edit reimbursement" : "New reimbursement claim"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="What for" className="md:col-span-2">{(id) => <TextInput id={id} value={f.description} onChange={set("description")} maxLength={300} />}</Field>
        <Field label="Amount (CAD)">{(id) => <TextInput id={id} inputMode="decimal" value={f.amount} onChange={set("amount")} />}</Field>
        <Field label="Owed by">{(id) => <TextInput id={id} value={f.payer} onChange={set("payer")} maxLength={200} />}</Field>
        <Field label="Claimed on">{(id) => <TextInput id={id} type="date" value={f.claimedOn} onChange={set("claimedOn")} />}</Field>
        <Field label="Expected by (optional)">{(id) => <TextInput id={id} type="date" value={f.expected} onChange={set("expected")} />}</Field>
        {item && <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={opt([["outstanding", "Outstanding"], ["received", "Received"], ["written_off", "Written off"]])} />}</Field>}
      </div>
      <p className="mono mt-3 !normal-case !tracking-normal">Record the deposit as an income transaction linked to this claim to mark it received with the money; changing the status here does not move money.</p>
    </Modal>
  );
}
