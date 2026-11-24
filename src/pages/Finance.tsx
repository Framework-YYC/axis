import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { Badge, DemoBadge, PageHeader, Progress, Row, Stat, Widget } from "../components/ui";
import { accounts, bills, budget, netWorthTrend, nextPayday } from "../data/synthetic";
import { localToday, pretty, relative } from "../lib/dates";
import { formatMoney, sumMinor } from "../../shared/money";

export default function Finance() {
  const today = localToday();
  const assets = sumMinor(accounts.filter((a) => a.balance > 0).map((a) => a.balance));
  const debts = sumMinor(accounts.filter((a) => a.balance < 0).map((a) => a.balance));
  const data = budget.map((b) => ({ name: b.name, Planned: b.planned / 100, Actual: b.actual / 100 }));
  return (
    <>
      <PageHeader title="Finance" subtitle="CAD · amounts held as integer cents" actions={<DemoBadge />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Widget title="Net worth" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Net worth" value={formatMoney(assets + debts)} tone="good" />
            <Stat label="Assets" value={formatMoney(assets, { compact: true })} />
            <Stat label="Liabilities" value={formatMoney(-debts, { compact: true })} />
          </div>
          <div className="mt-4 h-40" role="img" aria-label="Net worth trend, last six months, rising">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={netWorthTrend}><XAxis dataKey="m" tickLine={false} axisLine={false} fontSize={12} stroke="var(--c-muted)" /><Area dataKey="v" type="monotone" stroke="var(--c-accent)" fill="var(--c-accent-soft)" strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer>
          </div>
        </Widget>
        <Widget title="Cash flow to next payday">
          <Stat label={`Payday ${pretty(nextPayday())}`} value={formatMoney(342_800)} hint="Projected after bills (demo)" tone="good" />
          <ul className="mt-3">{bills().map((b) => <Row key={b.name} left={b.name} sub={relative(b.due, today)} right={formatMoney(b.amount)} />)}</ul>
        </Widget>
        <Widget title="Planned vs actual, November" className="lg:col-span-2">
          <div className="h-60" role="img" aria-label="Bar chart of planned versus actual spending by category">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}><CartesianGrid vertical={false} stroke="var(--c-line)" /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--c-muted)" /><YAxis tickLine={false} axisLine={false} fontSize={12} width={44} stroke="var(--c-muted)" /><Tooltip /><Legend />
                <Bar dataKey="Planned" fill="var(--c-line)" radius={[6, 6, 0, 0]} isAnimationActive={false} /><Bar dataKey="Actual" fill="var(--c-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} /></BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2">{budget.map((b) => <li key={b.name} className="flex items-center gap-3 text-sm"><span className="w-28 truncate">{b.name}</span><div className="flex-1"><Progress label={`${b.name} budget used`} value={(b.actual / b.planned) * 100} tone={b.actual > b.planned ? "bad" : "good"} /></div>{b.actual > b.planned ? <Badge tone="bad">Over</Badge> : <Badge tone="good">On track</Badge>}</li>)}</ul>
        </Widget>
        <Widget title="Accounts">
          <ul>{accounts.map((a) => <Row key={a.name} left={a.name} sub={a.kind} right={<span className={a.balance < 0 ? "text-bad" : ""}>{formatMoney(a.balance)}</span>} />)}</ul>
        </Widget>
      </div>
      <p className="mt-4 text-xs text-muted">Planned next: transactions, CSV import with duplicate detection, recurring bills, savings goals and debt repayment. Transfers and card payments are never double counted (see shared/ledger.ts and its tests). No banking credentials are ever stored.</p>
    </>
  );
}
