import { ChevronDown, FlaskConical, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { describeRecurrence } from "../../shared/recurrence";
import { cycleLabel } from "../../shared/progress";
import { isDebt, type BillOccurrence } from "../../shared/finance";
import { cx } from "../lib/cx";
import { useData } from "../lib/data";
import { pretty, relative } from "../lib/dates";
import { money, useFinanceModel, type FinanceModel } from "../lib/finance";
import type { FinAccountV, FinBillV, FinIncomePlanV, FinReimbV, FinTxnV } from "../lib/types";
import { Spark } from "./charts";
import { AccountEditor, BalanceEditor, BillEditor, BudgetEditor, IncomePlanEditor, PayBillDialog, ReimbursementEditor, TransactionEditor } from "./FinanceEditors";
import { Card } from "./InstrumentCard";
import { Btn, Empty, Segmented, Status, Tag, Widget } from "./ui";
import { CapsuleBars, DotGrid, RadialGauge, SegmentedProgress, SplitBar } from "./viz";

const Quiet = ({ children }: { children: string }) => <p className="py-1 text-[13px] opacity-70">{children}</p>;
const dayLabel = (d: string) => pretty(d, { weekday: "short", month: "short", day: "numeric" });
const KIND_LABEL: Record<string, string> = { income: "Income", expense: "Expense", transfer: "Transfer", card_payment: "Card payment", loan_payment: "Loan payment", reimbursement: "Reimbursement" };
const TYPE_LABEL: Record<string, string> = { bank: "Bank", savings: "Savings", credit_card: "Credit card", loan: "Loan", investment: "Investment", cash: "Cash" };

/** The month under review, kept in the URL so it survives navigation and reloads. */
export function useMonth(current: string): [string, (m: string) => void] {
  const [sp, setSp] = useSearchParams();
  const m = sp.get("month");
  return [m && /^\d{4}-\d{2}$/.test(m) ? m : current, (v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v === current) n.delete("month"); else n.set("month", v); return n; }, { replace: true })];
}
function MonthSelect({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  return (
    <label className="relative inline-flex h-11 items-center rounded-full pl-3.5 pr-8 text-[13px] md:h-10" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
      <span className="sr-only">Month</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none rounded-full bg-transparent pl-3.5 pr-8 text-transparent outline-none">{months.map((m) => <option key={m} value={m}>{cycleLabel(m)}</option>)}</select>
      <span aria-hidden className="truncate">{cycleLabel(value)}</span>
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}
function Shell({ children, month, setMonth, model, title }: { children: React.ReactNode; month: string; setMonth: (m: string) => void; model: FinanceModel; title?: string }) {
  const demo = model.f.accounts.some((a) => a.demo) || model.f.transactions.some((t) => t.demo);
  return (
    <div className="@container">
      <div data-cascade className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">{title && <h2 className="text-[17px] font-medium tracking-tight">{title}</h2>}{demo && <p className="mono mt-0.5 inline-flex items-center gap-1.5 !normal-case !tracking-normal"><FlaskConical size={12} aria-hidden /> Synthetic demonstration data</p>}</div>
        <MonthSelect months={model.months} value={month} onChange={setMonth} />
      </div>
      {children}
    </div>
  );
}
function Loading({ model }: { model: FinanceModel | null }) {
  const { loading } = useData();
  return model ? null : <Empty>{loading ? "Loading…" : "Finance data is not available."}</Empty>;
}
const NoData = ({ model, onAdd }: { model: FinanceModel; onAdd: () => void }) => (model.accounts.length === 0 && model.f.transactions.length === 0 ? (
  <Widget title="Set up Finance"><Empty>No accounts or transactions yet. Add an account to begin, or let your Financial assistant sync from your statements. Nothing is assumed: balances stay blank until you or the assistant record them.</Empty><div className="mt-3"><Btn variant="primary" icon={Plus} onClick={onAdd}>Add an account</Btn></div></Widget>
) : null);

// ---------- Overview ----------
export function FinanceOverview() {
  const { today } = useData(); const current = today.slice(0, 7);
  const [month, setMonth] = useMonth(current);
  const m = useFinanceModel(month);
  const [pay, setPay] = useState<{ bill: FinBillV; due: string } | null>(null);
  const [addAccount, setAddAccount] = useState(false);
  if (!m) return <Loading model={m} />;
  const s = m.summary, budget = m.budget;
  const planned = m.occ.filter((o) => o.debt && o.status !== "skipped").reduce((a, o) => a + (o.amountMinor ?? o.paidAmountMinor ?? 0), 0);
  const debtPct = planned > 0 ? Math.min(100, Math.round((s.debtRepaid / planned) * 100)) : s.debtRepaid > 0 ? 100 : 0;
  const open = m.occ.filter((o) => o.status !== "paid" && o.status !== "skipped").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const top = Math.max(1, s.income, s.spending);
  const series = m.netSeries.filter((x) => x.net !== null).map((x) => x.net as number);
  const floor = Math.min(0, ...series);
  return (
    <Shell month={month} setMonth={setMonth} model={m}>
      {addAccount && <AccountEditor onClose={() => setAddAccount(false)} />}
      <NoData model={m} onAdd={() => setAddAccount(true)} />
      <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-12 @[640px]:gap-3">
        <Card tone="sage" to={`/m/financial?tab=transactions&month=${month}`} label="Monthly income" aria={`Monthly income ${money(s.income)}`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
          <CapsuleBars className="mt-4" values={s.incomeBins} ink="var(--w-on)" height={70} label="Income received through the month" />
          <div className="mt-auto pt-2"><p className="num text-[24px] font-light leading-none tracking-tight">{money(s.income, { whole: true })}</p><p className="mt-1 text-[12.5px] opacity-75">{m.isCurrent ? "Received this month" : "Received"}</p></div>
        </Card>
        <Card tone="butter" to={`/m/financial?tab=bills&month=${month}`} label="Bills paid" aria={`${m.bills.paid} of ${m.bills.total} bills paid`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
          <RadialGauge pct={m.bills.pct} size={96} ink="var(--w-butter-on)" hatch="var(--w-butter-on)" fill="var(--w-butter-on)" className="mt-3" label={`${m.bills.pct} percent of bills paid`} />
          <div className="mt-auto pt-2"><p className="num text-[24px] font-light leading-none tracking-tight">{m.bills.total === 0 ? "—" : <>{m.bills.paid} of {m.bills.total}</>}</p><p className="mt-1 text-[12.5px] opacity-75">{m.bills.total === 0 ? "No bills this month" : `${money(m.bills.outstandingMinor, { whole: true })} remaining${m.bills.unknownAmounts ? ` + ${m.bills.unknownAmounts} unknown` : ""}`}</p></div>
        </Card>
        <Card tone="blue" to={`/m/financial?tab=budgets&month=${month}`} label="Monthly spending" aria={`Monthly spending ${money(s.spending)}`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
          <CapsuleBars className="mt-4" values={s.spendBins} ink="var(--w-blue-ink)" height={70} label="Spending through the month" />
          <div className="mt-auto pt-2"><p className="num text-[24px] font-light leading-none tracking-tight">{money(s.spending, { whole: true })}</p><p className="mt-1 text-[12.5px] opacity-75">{budget.pct === null ? "No budget set" : `${budget.pct}% of monthly budget`}</p></div>
        </Card>
        <Card tone="charcoal" label="Debt repayment" aria={`Debt repaid ${money(s.debtRepaid)}`} className="min-h-[196px] @[640px]:col-span-6 @[1000px]:col-span-3">
          <DotGrid pct={debtPct} className="mt-5" label={`${debtPct} percent of scheduled debt payments made`} />
          <div className="mt-auto pt-2"><p className="num text-[24px] font-light leading-none tracking-tight">{money(s.debtRepaid, { whole: true })}</p><p className="mt-1 text-[12.5px] opacity-75">{planned > 0 ? `of ${money(planned, { whole: true })} scheduled` : "Paid towards debt"}</p></div>
        </Card>

        <Card tone="charcoal" label="Monthly cash flow" className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-7">
          <p className={cx("absolute right-3.5 top-3 num text-[17px]", s.net >= 0 ? "text-[var(--g-sage)]" : "text-red")}>{money(s.net, { sign: true, whole: true })}</p>
          <div className="mt-4 space-y-3.5">
            {([["Income", s.income, "var(--g-sage)"], ["Spending", s.spending, "var(--w-blue)"]] as const).map(([l, v, c]) => (
              <div key={l}><div className="mb-1.5 flex items-baseline justify-between text-[13px]"><span className="opacity-75">{l}</span><span className="num text-[16px]">{money(v)}</span></div><SplitBar height={6} parts={[{ value: v, color: c }, { value: top - v, color: "transparent" }]} label={`${l} ${money(v)}`} /></div>
            ))}
          </div>
          <p className="mt-3 text-[12px] opacity-65">Transfers ({money(s.transfers)}) and debt payments ({money(s.debtRepaid)}) are not counted as spending.{s.reimbursed ? ` Spending is net of ${money(s.reimbursed)} reimbursed.` : ""}{s.pending ? ` ${s.pending} pending not counted.` : ""}</p>
        </Card>
        <Card tone="charcoal" to="/m/financial?tab=accounts" label="Next payday" className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-5">
          {m.payday ? (
            <div className="mt-3">
              <p className="num text-[24px] font-light leading-none tracking-tight">{dayLabel(m.payday.date)}</p>
              <p className="mt-1 text-[12.5px] opacity-75">{m.payday.inDays === 0 ? "Today" : `In ${m.payday.inDays} day${m.payday.inDays === 1 ? "" : "s"}`} · expected {m.payday.plan.amountMinor === null ? "amount not known" : money(m.payday.plan.amountMinor)} {m.payday.plan.amountMinor !== null && m.payday.plan.amountKind === "estimate" && <Tag>Estimate</Tag>}</p>
              <div className="mt-3 border-t border-line pt-3"><p className="mono">Projected cash until payday</p><p className="num mt-1 text-[20px] font-light leading-none">{m.cash.available === null ? "—" : money(m.cash.available)} {m.cash.includesEstimates && m.cash.available !== null && <Tag>Estimate</Tag>}</p>
                <p className="mt-1 text-[12px] opacity-65">{m.cash.available === null ? "Record a bank balance to see this." : `${money(m.cash.startingBalance)} now, less ${money(m.cash.bills)} of bills due before ${dayLabel(m.payday.date)}${m.cash.unknownBills ? ` (${m.cash.unknownBills} with no amount)` : ""}${m.cash.missingBalances ? `. ${m.cash.missingBalances} account without a balance.` : ""}`}</p></div>
            </div>
          ) : <Quiet>No pay schedule yet. Add your expected income in Accounts to see your next payday and projected cash.</Quiet>}
        </Card>

        <Card tone="charcoal" to={`/m/financial?tab=bills&month=${month}`} label="Upcoming bills" className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-6">
          {open.length === 0 ? <Quiet>{m.bills.total === 0 ? "No bills scheduled this month." : "Every bill this month is paid."}</Quiet> : (
            <ul className="mt-2">{open.slice(0, 5).map((o) => (
              <li key={`${o.billId}${o.dueDate}`} className="flex items-center gap-2.5 border-t border-line first:border-t-0">
                <button onClick={(e) => { e.preventDefault(); const b = m.f.bills.find((x) => x.id === o.billId); if (b) setPay({ bill: b, due: o.dueDate }); }} className="hit flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left md:!min-h-0 md:py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{o.name}</span><span className="mono block !normal-case !tracking-normal">{dayLabel(o.dueDate)}{o.estimate ? " · amount varies" : ""}</span></span>
                  <span className="num text-[14px]">{o.amountMinor === null ? "—" : money(o.amountMinor)}</span>
                  <Status tone={o.status === "overdue" ? "bad" : o.status === "due" ? "lime" : "neutral"}>{o.status === "overdue" ? "Overdue" : relative(o.dueDate, m.today)}</Status>
                </button>
              </li>))}</ul>
          )}
        </Card>
        <Card tone="sage" to="/m/financial?tab=accounts" label="Reimbursements" className="col-span-1 min-h-[150px] @[640px]:col-span-3 @[1000px]:col-span-3">
          <div className="mt-auto pt-6"><p className="num text-[24px] font-light leading-none tracking-tight">{money(m.reimb.total, { whole: true })}</p><p className="mt-1 text-[12.5px] opacity-75">{m.reimb.count === 0 ? "Nothing outstanding" : `${m.reimb.count} outstanding${m.reimb.oldest ? ` · since ${pretty(m.reimb.oldest)}` : ""}`}</p></div>
        </Card>
        <Card tone="charcoal" to="/m/financial?tab=accounts" label="Savings progress" className="col-span-1 min-h-[150px] @[640px]:col-span-3 @[1000px]:col-span-3">
          {m.savings.pct === null ? <Quiet>Set a target on a savings account.</Quiet> : (
            <div className="mt-auto pt-5"><SegmentedProgress value={m.savings.saved} total={m.savings.target} segments={14} height={14} label={`${m.savings.pct} percent of the savings target`} /><p className="num mt-3 text-[22px] font-light leading-none">{money(m.savings.saved, { whole: true })}</p><p className="mt-1 text-[12px] opacity-75">of {money(m.savings.target, { whole: true })} · {m.savings.pct}%</p></div>
          )}
        </Card>
        <Card tone="charcoal" to="/m/financial?tab=accounts" label="Net worth" className="col-span-2 @[640px]:col-span-12 @[1000px]:col-span-12">
          <div className="mt-3 grid items-center gap-4 @[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div><p className="num text-[30px] font-light leading-none tracking-tight">{m.net.counted ? money(m.net.net, { whole: true }) : "—"}</p><p className="mt-1.5 text-[12.5px] opacity-75">{m.net.counted ? `${money(m.net.assets, { whole: true })} assets · ${money(m.net.liabilities, { whole: true })} owed` : "No balances recorded yet"}{m.net.withoutBalance ? ` · ${m.net.withoutBalance} account${m.net.withoutBalance > 1 ? "s" : ""} without a balance` : ""}</p>
              {m.net.counted > 0 && <SplitBar className="mt-3" height={6} parts={[{ value: m.net.assets, color: "var(--g-sage)" }, { value: m.net.liabilities, color: "var(--w-terra)" }]} label="Assets and liabilities" />}</div>
            {series.length > 1 ? <div><Spark values={series.map((x) => x - floor)} label="Net worth over the last months" /><p className="mono mt-1 !normal-case">Last {series.length} month ends, from recorded balances</p></div> : <Quiet>Record balances over a few months to see your net worth trend.</Quiet>}
          </div>
        </Card>
      </div>
      {pay && <PayBillDialog bill={pay.bill} dueDate={pay.due} onClose={() => setPay(null)} />}
    </Shell>
  );
}

// ---------- Transactions ----------
type KindFilter = "all" | "income" | "expense" | "transfers" | "reimbursement";
export function TransactionsView() {
  const { today } = useData(); const [month, setMonth] = useMonth(today.slice(0, 7));
  const m = useFinanceModel(month); const [edit, setEdit] = useState<{ txn?: FinTxnV } | null>(null); const [kind, setKind] = useState<KindFilter>("all"); const [acct, setAcct] = useState("all");
  if (!m) return <Loading model={m} />;
  const rows = m.f.transactions.filter((t) => t.date.startsWith(month)).filter((t) => acct === "all" || t.accountId === acct || t.counterAccountId === acct)
    .filter((t) => kind === "all" ? true : kind === "transfers" ? t.kind === "transfer" || t.kind === "card_payment" || t.kind === "loan_payment" : t.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
  const byDay = new Map<string, FinTxnV[]>(); for (const t of rows) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  const s = m.summary;
  return (
    <Shell month={month} setMonth={setMonth} model={m}>
      <div data-cascade className="panel mb-3 grid grid-cols-3 gap-2 p-3.5 text-center">
        {([["Income", s.income], ["Spending", s.spending], ["Net", s.net]] as const).map(([l, v]) => <div key={l}><p className="mono">{l}</p><p className={cx("num mt-1 text-[18px] font-light", l === "Net" && (v < 0 ? "text-red" : ""))}>{l === "Net" ? money(v, { sign: true }) : money(v)}</p></div>)}
      </div>
      <div data-cascade className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "income", label: "Income" }, { value: "expense", label: "Expenses" }, { value: "transfers", label: "Transfers" }, { value: "reimbursement", label: "Reimbursed" }]} />
        <label className="relative inline-flex h-10 items-center rounded-full pl-3.5 pr-8 text-[13px]" style={{ boxShadow: "0 0 0 1px var(--line)" }}><span className="sr-only">Account</span>
          <select value={acct} onChange={(e) => setAcct(e.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none rounded-full bg-transparent pl-3.5 pr-8 text-transparent outline-none"><option value="all">All accounts</option>{m.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <span aria-hidden className="truncate">{acct === "all" ? "All accounts" : m.acctName(acct)}</span><ChevronDown size={14} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute right-3 text-muted" /></label>
        <Btn variant="primary" icon={Plus} onClick={() => setEdit({})}>New transaction</Btn>
      </div>
      {rows.length === 0 ? <Widget title="Transactions"><Empty>No transactions for {cycleLabel(month)}.</Empty></Widget> : (
        <div className="space-y-3">{[...byDay].map(([d, list]) => (
          <Widget key={d} title={dayLabel(d)} tag={money(list.reduce((a, t) => a + (t.kind === "income" || t.kind === "expense" || t.kind === "reimbursement" ? t.amountMinor : 0), 0), { sign: true })}>
            <ul>{list.map((t) => (
              <li key={t.id} className="border-t border-line first:border-t-0">
                <button onClick={() => setEdit({ txn: t })} className="hit flex w-full items-center gap-3 py-1.5 text-left md:py-2">
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 truncate text-[14.5px]">{t.payee || m.catName(t.categoryId) || KIND_LABEL[t.kind]}{t.demo && <FlaskConical size={11} className="shrink-0 text-faint" aria-label="Synthetic" />}{t.status === "pending" && <Tag>Pending</Tag>}</p>
                    <p className="mono truncate !normal-case !tracking-normal">{[KIND_LABEL[t.kind], t.categoryId ? m.catName(t.categoryId) : null, m.acctName(t.accountId), t.counterAccountId ? `→ ${m.acctName(t.counterAccountId)}` : null].filter(Boolean).join(" · ")}</p></div>
                  <span className={cx("num shrink-0 text-[15px]", t.kind === "transfer" || t.kind === "card_payment" || t.kind === "loan_payment" ? "text-muted" : t.amountMinor > 0 ? "text-[var(--g-sage)]" : "")}>{money(t.amountMinor, { sign: true })}</span>
                </button>
              </li>))}</ul>
          </Widget>))}</div>
      )}
      {edit && <TransactionEditor txn={edit.txn} onClose={() => setEdit(null)} />}
    </Shell>
  );
}

// ---------- Bills ----------
export function BillsView() {
  const { today } = useData(); const [month, setMonth] = useMonth(today.slice(0, 7));
  const m = useFinanceModel(month); const [pay, setPay] = useState<{ bill: FinBillV; due: string } | null>(null); const [edit, setEdit] = useState<{ bill?: FinBillV } | null>(null);
  if (!m) return <Loading model={m} />;
  const bill = (id: string) => m.f.bills.find((b) => b.id === id);
  const Row = ({ o }: { o: BillOccurrence }) => (
    <li className="border-t border-line first:border-t-0">
      <button onClick={() => { const b = bill(o.billId); if (!b) return; if (o.status === "paid" || o.status === "skipped") setEdit({ bill: b }); else setPay({ bill: b, due: o.dueDate }); }} className="hit flex w-full items-center gap-3 py-1.5 text-left md:py-2">
        <div className="min-w-0 flex-1"><p className="truncate text-[14.5px]">{o.name}</p><p className="mono truncate !normal-case !tracking-normal">{o.status === "paid" ? `Paid${o.paidOn ? ` ${pretty(o.paidOn)}` : ""}${o.viaTask ? " · via its task" : ""}` : o.status === "skipped" ? "Skipped" : `Due ${dayLabel(o.dueDate)}`}{o.debt ? " · debt payment" : ""}{o.estimate && o.status !== "paid" ? " · amount varies" : ""}</p></div>
        <span className="num shrink-0 text-[15px]">{money(o.paidAmountMinor ?? o.amountMinor)}</span>
        <Status tone={o.status === "paid" ? "ok" : o.status === "overdue" ? "bad" : o.status === "due" ? "lime" : o.status === "skipped" ? "idle" : "neutral"}>{o.status === "paid" ? "Paid" : o.status === "overdue" ? "Overdue" : o.status === "skipped" ? "Skipped" : relative(o.dueDate, m.today)}</Status>
      </button>
    </li>
  );
  const unpaid = m.occ.filter((o) => o.status !== "paid" && o.status !== "skipped"), paid = m.occ.filter((o) => o.status === "paid" || o.status === "skipped");
  return (
    <Shell month={month} setMonth={setMonth} model={m}>
      <div data-cascade className="panel mb-3 flex items-center gap-4 p-3.5">
        <RadialGauge pct={m.bills.pct} size={72} label={`${m.bills.pct} percent of bills paid`} />
        <div className="min-w-0 flex-1"><p className="num text-[22px] font-light leading-none">{m.bills.paid} of {m.bills.total} paid</p><p className="mt-1.5 text-[13px] text-muted">{money(m.bills.paidMinor)} paid · {money(m.bills.outstandingMinor)} outstanding{m.bills.unknownAmounts ? ` · ${m.bills.unknownAmounts} with no amount` : ""}</p></div>
        <Btn variant="primary" icon={Plus} onClick={() => setEdit({})}>New bill</Btn>
      </div>
      <div className="grid gap-3 @[960px]:grid-cols-2">
        <Widget title="To pay" count={unpaid.length}>{unpaid.length === 0 ? <Empty>{m.occ.length ? "Everything is paid." : "No bills this month."}</Empty> : <ul>{unpaid.map((o) => <Row key={`${o.billId}${o.dueDate}`} o={o} />)}</ul>}</Widget>
        <Widget title="Payment history" count={paid.length}>{paid.length === 0 ? <Empty>No payments recorded this month.</Empty> : <ul>{paid.map((o) => <Row key={`${o.billId}${o.dueDate}`} o={o} />)}</ul>}</Widget>
        <Widget title="Schedule" tag="All recurring bills" className="@[960px]:col-span-2">
          <ul>{m.f.bills.map((b) => (
            <li key={b.id} className="border-t border-line first:border-t-0">
              <button onClick={() => setEdit({ bill: b })} className="hit flex w-full items-center gap-3 py-1.5 text-left md:py-2">
                <div className="min-w-0 flex-1"><p className={cx("truncate text-[14.5px]", !b.active && "text-muted line-through")}>{b.name}{b.demo && <FlaskConical size={11} className="ml-1.5 inline text-faint" aria-label="Synthetic" />}</p><p className="mono truncate !normal-case !tracking-normal">{describeRecurrence(b.recurrence)}{b.accountId ? ` · from ${m.acctName(b.accountId)}` : ""}{b.counterAccountId ? ` · pays ${m.acctName(b.counterAccountId)}` : ""}{b.autopay ? " · automatic" : ""}</p></div>
                <span className="num shrink-0 text-[14px]">{b.amountMinor === null ? "Varies" : money(b.amountMinor)}{b.amountKind === "estimate" && b.amountMinor !== null ? " ~" : ""}</span>
              </button>
            </li>))}{m.f.bills.length === 0 && <Empty>No bills yet. Add rent, utilities and loan payments to track them.</Empty>}</ul>
        </Widget>
      </div>
      {pay && <PayBillDialog bill={pay.bill} dueDate={pay.due} onClose={() => setPay(null)} />}
      {edit && <BillEditor bill={edit.bill} onClose={() => setEdit(null)} />}
    </Shell>
  );
}

// ---------- Accounts ----------
function AccountCard({ a, m, onBalance, onEdit }: { a: FinAccountV; m: FinanceModel; onBalance: () => void; onEdit: () => void }) {
  const b = m.balanceOf(a.id); const debt = isDebt(a.type);
  const hist = m.f.balances.filter((x) => x.accountId === a.id && x.kind === "confirmed").sort((x, y) => x.asOf.localeCompare(y.asOf)).slice(-8).map((x) => x.amountMinor);
  const util = a.type === "credit_card" && a.creditLimitMinor && b.amountMinor !== null ? Math.max(0, Math.round((-b.amountMinor / a.creditLimitMinor) * 100)) : null;
  const prog = a.type === "loan" && a.originalPrincipalMinor && b.amountMinor !== null ? Math.max(0, Math.min(100, Math.round(((a.originalPrincipalMinor + b.amountMinor) / a.originalPrincipalMinor) * 100))) : null;
  const sv = a.type === "savings" && a.targetMinor && b.amountMinor !== null ? Math.min(100, Math.round((b.amountMinor / a.targetMinor) * 100)) : null;
  return (
    <Widget title={a.name} tag={TYPE_LABEL[a.type]} className="!p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="num text-[26px] font-light leading-none tracking-tight">{b.amountMinor === null ? "—" : money(debt ? -b.amountMinor : b.amountMinor)}</p>
          <p className="mt-1.5 text-[12.5px] text-muted">{b.amountMinor === null ? "No balance recorded" : debt ? "Owed" : "Balance"}{b.amountMinor !== null && <>{" · "}{b.kind === "estimate" ? <Tag>Estimate</Tag> : `Confirmed ${pretty(b.asOf!)}`}{b.adjusted && b.kind === "confirmed" ? <> {" "}<Tag>Updated since</Tag></> : null}</>}</p></div>
        {hist.length > 1 && <div className="w-24 shrink-0"><Spark values={hist.map((x) => x - Math.min(...hist))} label={`${a.name} balance history`} /></div>}
      </div>
      {util !== null && <div className="mt-3"><SegmentedProgress value={util} total={100} segments={20} height={10} color={util > 70 ? "var(--w-terra)" : "var(--g-sage)"} label={`${util} percent of the credit limit used`} /><p className="mt-1.5 text-[12.5px] text-muted">{util}% of {money(a.creditLimitMinor)} limit{a.statementDay ? ` · statement day ${a.statementDay}` : ""}{a.dueDay ? ` · payment due day ${a.dueDay}` : ""}{a.minPaymentMinor ? ` · minimum ${money(a.minPaymentMinor)}` : ""}</p></div>}
      {prog !== null && <div className="mt-3"><SegmentedProgress value={prog} total={100} segments={20} height={10} label={`${prog} percent repaid`} /><p className="mt-1.5 text-[12.5px] text-muted">{prog}% repaid of {money(a.originalPrincipalMinor)}{a.interestRate !== null ? ` · ${a.interestRate}% interest` : ""}{a.dueDay ? ` · due day ${a.dueDay}` : ""}</p></div>}
      {sv !== null && <div className="mt-3"><SegmentedProgress value={sv} total={100} segments={20} height={10} label={`${sv} percent of the target`} /><p className="mt-1.5 text-[12.5px] text-muted">{sv}% of {money(a.targetMinor)} target{a.targetDate ? ` by ${pretty(a.targetDate)}` : ""}{a.interestRate !== null ? ` · ${a.interestRate}% interest` : ""}</p></div>}
      <div className="mt-3 flex gap-2"><Btn variant="soft" onClick={onBalance}>Update balance</Btn><Btn variant="ghost" onClick={onEdit}>Edit</Btn></div>
    </Widget>
  );
}
export function AccountsView() {
  const { today } = useData(); const m = useFinanceModel(today.slice(0, 7));
  const [acct, setAcct] = useState<{ account?: FinAccountV } | null>(null); const [bal, setBal] = useState<FinAccountV | null>(null);
  const [plan, setPlan] = useState<{ plan?: FinIncomePlanV } | null>(null); const [reimb, setReimb] = useState<{ item?: FinReimbV } | null>(null);
  if (!m) return <Loading model={m} />;
  const groups: Array<[string, FinAccountV[]]> = [["Cash and bank", m.accounts.filter((a) => a.type === "bank" || a.type === "cash")], ["Savings and investments", m.accounts.filter((a) => a.type === "savings" || a.type === "investment")], ["Credit cards", m.accounts.filter((a) => a.type === "credit_card")], ["Loans", m.accounts.filter((a) => a.type === "loan")]];
  return (
    <div className="@container">
      <div data-cascade className="mb-3 flex items-center justify-between gap-3"><p className="mono !normal-case !tracking-normal">A balance is a confirmed figure or an estimate, with its date. Nothing is assumed when none is recorded.</p><Btn variant="primary" icon={Plus} onClick={() => setAcct({})}>New account</Btn></div>
      <NoData model={m} onAdd={() => setAcct({})} />
      <div className="space-y-5">
        {groups.filter(([, l]) => l.length).map(([title, list]) => (
          <section key={title} data-cascade><p className="mono mb-2 px-1">{title}</p><div className="grid gap-3 @[640px]:grid-cols-2 @[1000px]:grid-cols-3">{list.map((a) => <AccountCard key={a.id} a={a} m={m} onBalance={() => setBal(a)} onEdit={() => setAcct({ account: a })} />)}</div></section>
        ))}
        <div className="grid gap-3 @[960px]:grid-cols-2">
          <Widget title="Expected income" tag="A plan" action={<Btn variant="soft" icon={Plus} onClick={() => setPlan({})}>Add</Btn>}>
            {m.f.incomePlans.length === 0 ? <Empty>No pay schedule yet.</Empty> : <ul>{m.f.incomePlans.map((p) => (
              <li key={p.id} className="border-t border-line first:border-t-0"><button onClick={() => setPlan({ plan: p })} className="hit flex w-full items-center gap-3 py-1.5 text-left md:py-2"><div className="min-w-0 flex-1"><p className="truncate text-[14.5px]">{p.name}</p><p className="mono truncate !normal-case !tracking-normal">{describeRecurrence(p.recurrence)}{p.accountId ? ` · to ${m.acctName(p.accountId)}` : ""}</p></div><span className="num text-[14px]">{p.amountMinor === null ? "Not known" : money(p.amountMinor)}{p.amountKind === "estimate" && p.amountMinor !== null ? " ~" : ""}</span></button></li>))}</ul>}
          </Widget>
          <Widget title="Reimbursements" count={m.reimb.count} action={<Btn variant="soft" icon={Plus} onClick={() => setReimb({})}>Add</Btn>}>
            {m.f.reimbursements.length === 0 ? <Empty>No claims.</Empty> : <ul>{m.f.reimbursements.map((r) => (
              <li key={r.id} className="border-t border-line first:border-t-0"><button onClick={() => setReimb({ item: r })} className="hit flex w-full items-center gap-3 py-1.5 text-left md:py-2"><div className="min-w-0 flex-1"><p className="truncate text-[14.5px]">{r.description}</p><p className="mono truncate !normal-case !tracking-normal">{r.payer ?? ""}{r.claimedOn ? ` · claimed ${pretty(r.claimedOn)}` : ""}{r.expectedDate ? ` · expected ${pretty(r.expectedDate)}` : ""}</p></div><span className="num text-[14px]">{money(r.amountMinor)}</span><Status tone={r.status === "received" ? "ok" : r.status === "written_off" ? "idle" : "lime"}>{r.status === "received" ? "Received" : r.status === "written_off" ? "Written off" : "Outstanding"}</Status></button></li>))}</ul>}
          </Widget>
        </div>
      </div>
      {acct && <AccountEditor account={acct.account} onClose={() => setAcct(null)} />}
      {bal && <BalanceEditor account={bal} onClose={() => setBal(null)} />}
      {plan && <IncomePlanEditor plan={plan.plan} onClose={() => setPlan(null)} />}
      {reimb && <ReimbursementEditor item={reimb.item} onClose={() => setReimb(null)} />}
    </div>
  );
}

// ---------- Budgets ----------
export function BudgetsView() {
  const { today } = useData(); const [month, setMonth] = useMonth(today.slice(0, 7));
  const m = useFinanceModel(month); const [edit, setEdit] = useState(false);
  if (!m) return <Loading model={m} />;
  const b = m.budget;
  return (
    <Shell month={month} setMonth={setMonth} model={m}>
      <div data-cascade className="panel mb-3 flex items-center gap-4 p-4">
        <RadialGauge pct={Math.min(100, b.pct ?? 0)} size={84} fill={b.pct !== null && b.pct > 100 ? "var(--w-terra)" : "var(--g-sage)"} label={b.pct === null ? "No budget" : `${b.pct} percent of the budget used`} />
        <div className="min-w-0 flex-1"><p className="num text-[24px] font-light leading-none">{b.pct === null ? "No budget set" : `${b.pct}% used`}</p><p className="mt-1.5 text-[13px] text-muted">{b.pct === null ? "Set monthly budgets for your spending categories." : `${money(b.used)} of ${money(b.totalBudget)} · ${money(Math.max(0, b.totalBudget - b.used))} left`}</p></div>
        <Btn variant="primary" icon={Plus} onClick={() => setEdit(true)}>Set budget</Btn>
      </div>
      {b.rows.length === 0 ? <Widget title="Categories"><Empty>No budgets yet.</Empty></Widget> : (
        <Widget title="By category" count={b.rows.length}><ul>{b.rows.sort((x, y) => y.pct - x.pct).map((r) => (
          <li key={r.categoryId} className="border-t border-line py-2.5 first:border-t-0"><div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]"><span className="truncate">{m.catName(r.categoryId)}</span><span className="num text-muted">{money(r.spent)} of {money(r.budget)}</span></div>
            <SplitBar height={7} parts={[{ value: Math.min(r.spent, r.budget), color: r.pct > 100 ? "var(--w-terra)" : "var(--g-sage)" }, { value: Math.max(0, r.budget - r.spent), color: "transparent" }]} label={`${m.catName(r.categoryId)} ${r.pct} percent`} /></li>))}</ul></Widget>
      )}
      {edit && <BudgetEditor month={month} onClose={() => setEdit(false)} />}
    </Shell>
  );
}

// ---------- Reports ----------
export function ReportsView() {
  const { today } = useData(); const [month, setMonth] = useMonth(today.slice(0, 7));
  const m = useFinanceModel(month);
  if (!m) return <Loading model={m} />;
  const s = m.summary; const cats = [...s.byCategory].sort((a, b) => b[1] - a[1]); const top = Math.max(1, ...cats.map(([, v]) => v));
  return (
    <Shell month={month} setMonth={setMonth} model={m}>
      <div className="grid gap-3 @[960px]:grid-cols-2">
        <Widget title="Summary" tag={cycleLabel(month)}>
          <dl className="text-[14px]">{([["Income received", money(s.income)], ["Spending (gross)", money(s.grossSpending)], ["Reimbursements received", money(s.reimbursed)], ["Spending (net)", money(s.spending)], ["Net cash flow", money(s.net, { sign: true })], ["Debt repaid (not spending)", money(s.debtRepaid)], ["Transfers (not counted)", money(s.transfers)], ["Pending, not counted", String(s.pending)]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-t border-line py-2 first:border-t-0"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>)}</dl>
        </Widget>
        <Widget title="Spending by category" count={cats.length}>
          {cats.length === 0 ? <Empty>No categorised spending this month.</Empty> : <ul>{cats.map(([id, v]) => <li key={id} className="border-t border-line py-2 first:border-t-0"><div className="mb-1 flex justify-between text-[13.5px]"><span>{m.catName(id)}</span><span className="num">{money(v)}</span></div><SplitBar height={5} parts={[{ value: v, color: "var(--w-blue)" }, { value: top - v, color: "transparent" }]} label={`${m.catName(id)} ${money(v)}`} /></li>)}</ul>}
        </Widget>
        <Widget title="Net worth" tag="Month ends" className="@[960px]:col-span-2"><ul>{m.netSeries.map((x) => <li key={x.month} className="flex justify-between gap-3 border-t border-line py-2 text-[14px] first:border-t-0"><span className="text-muted">{cycleLabel(x.month)}</span><span className="num">{x.net === null ? "No balances yet" : money(x.net)}</span></li>)}</ul></Widget>
      </div>
    </Shell>
  );
}
