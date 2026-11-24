import { Area, AreaChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SegBar } from "../components/charts";
import { DemoTag, LinkBtn, PageHeader, Row, StatLine, Status, Tag, Widget } from "../components/ui";
import { accounts, bills, budget, netWorthTrend, nextPayday } from "../data/synthetic";
import { localToday, pretty, relative } from "../lib/dates";
import { formatMoney, sumMinor } from "../../shared/money";
import { fillTicks } from "../../shared/viz";

const AXIS = { fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" } as const;

export default function Finance() {
  const today = localToday();
  const assets = sumMinor(accounts.filter((a) => a.balance > 0).map((a) => a.balance));
  const debts = -sumMinor(accounts.filter((a) => a.balance < 0).map((a) => a.balance));
  const last = netWorthTrend[netWorthTrend.length - 1];
  const dueTotal = sumMinor(bills().filter((b) => b.due <= nextPayday()).map((b) => b.amount));
  const i = formatMoney(assets - debts).lastIndexOf(".");
  const nw = formatMoney(assets - debts);
  return (
    <>
      <PageHeader crumb="FINANCE" title="Finance" subtitle="CAD · every amount is held as integer cents" tag={<DemoTag />} />
      <div className="stagger grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
        <Widget id="networth" title="Net worth" tag="Synthetic" className="lg:col-span-8">
          <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <p className="display num text-[56px]">{nw.slice(0, i)}<span className="text-[24px] text-faint">{nw.slice(i)}</span></p>
              <span className="pill pill-lime mt-2">↑ 2.8% this month</span>
              <div className="mt-4"><StatLine label="Assets" value={formatMoney(assets, { compact: true })} /><StatLine label="Liabilities" value={formatMoney(debts, { compact: true })} /></div>
            </div>
            <div className="h-56 min-w-0 self-end" role="img" aria-label="Net worth over six months, rising">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorthTrend} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}>
                  <defs><linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ink)" stopOpacity="0.14" /><stop offset="1" stopColor="var(--ink)" stopOpacity="0" /></linearGradient></defs>
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={AXIS} />
                  <YAxis hide domain={["dataMin - 1500", "dataMax + 800"]} />
                  <Tooltip cursor={{ stroke: "var(--faint)" }} contentStyle={{ background: "var(--card-a)", border: "none", borderRadius: 12, boxShadow: "var(--sh-soft)", fontSize: 12 }} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Net worth"]} />
                  <Area dataKey="v" type="monotone" stroke="var(--ink)" strokeWidth={1.6} fill="url(#nwfill)" isAnimationActive={false} />
                  <ReferenceDot x={last.m} y={last.v} r={5} fill="var(--lime)" stroke="var(--ink)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Widget>

        <Widget id="cashflow" title="Cash flow to payday" tag="Synthetic" className="lg:col-span-4">
          <p className="mono">Payday {pretty(nextPayday(), { weekday: "short", day: "numeric", month: "short" })}</p>
          <p className="display num mt-1.5 text-[44px]">{formatMoney(342_800)}</p>
          <p className="mono mt-1.5 !normal-case">projected after {formatMoney(dueTotal)} in bills</p>
          <ul className="mt-4">{bills().map((b) => <Row key={b.name} left={b.name} sub={relative(b.due, today)} right={formatMoney(b.amount)} />)}</ul>
        </Widget>

        <Widget id="budget" title="Planned vs actual" tag="November · synthetic" className="lg:col-span-7">
          <ul className="space-y-4">
            {budget.map((b) => {
              const ratio = b.actual / b.planned;
              return (
                <li key={b.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px]">{b.name}</span>
                    <span className="mono num !text-ink">{formatMoney(b.actual)} <span className="text-muted">/ {formatMoney(b.planned)}</span></span>
                  </div>
                  <SegBar ticks={fillTicks(32, Math.min(ratio, 1) * 100, 100, ratio > 1 ? "bad" : "on")} label={`${b.name}: ${Math.round(ratio * 100)}% of plan`} height={14} />
                  <div className="mt-1.5">{ratio > 1 ? <Status tone="bad">{Math.round((ratio - 1) * 100)}% over plan</Status> : <Status tone="ok">On track</Status>}</div>
                </li>
              );
            })}
          </ul>
        </Widget>

        <Widget id="accounts" title="Accounts" tag="Synthetic" className="lg:col-span-5" action={<LinkBtn to="/intelligence">Imports</LinkBtn>}>
          <ul>{accounts.map((a) => <Row key={a.name} left={a.name} sub={a.kind} right={<span className={a.balance < 0 ? "text-red" : ""}>{formatMoney(a.balance)}</span>} />)}</ul>
        </Widget>
      </div>
      <p className="mono mt-4 !normal-case"><Tag>NEXT</Tag> Transactions, CSV import with duplicate detection, recurring bills, savings goals and debt repayment. Transfers and card payments are never double counted. No banking credentials are ever stored.</p>
    </>
  );
}
