import { MODULES_META } from "./modules";

export interface Hit { key: string; group: string; title: string; sub?: string; to: string }
const norm = (s: string) => s.toLowerCase();

/** Pure matcher so it can be tested: every group is capped, matching is case-insensitive substring over the visible text. */
export function searchHits(q: string, d: { tasks: Array<{ id: string; title: string; module: string; status: string }>; goals: Array<{ id: string; title: string; module: string }>; habits: Array<{ id: string; title: string; module: string }>; events: Array<{ id: string; title: string; date: string; module: string }>; txns: Array<{ id: string; payee: string | null; date: string; status?: string }>; bills: Array<{ id: string; name: string }>; accounts: Array<{ id: string; name: string }> }, perGroup = 5): Hit[] {
  const needle = norm(q.trim());
  if (needle.length < 2) return [];
  const take = <T,>(rows: T[], text: (r: T) => string) => rows.filter((r) => norm(text(r)).includes(needle)).slice(0, perGroup);
  const out: Hit[] = [];
  for (const t of take(d.tasks, (r) => r.title)) out.push({ key: `t${t.id}`, group: "Tasks", title: t.title, sub: t.status === "completed" ? "Completed" : MODULES_META[t.module as keyof typeof MODULES_META]?.label, to: `/tasks?h=all&status=${t.status === "completed" ? "completed" : "all"}&q=${encodeURIComponent(t.title)}` });
  for (const g of take(d.goals, (r) => r.title)) out.push({ key: `g${g.id}`, group: "Goals", title: g.title, sub: MODULES_META[g.module as keyof typeof MODULES_META]?.label, to: `/goals?module=${g.module}#goals` });
  for (const h of take(d.habits, (r) => r.title)) out.push({ key: `h${h.id}`, group: "Habits", title: h.title, sub: MODULES_META[h.module as keyof typeof MODULES_META]?.label, to: `/goals?module=${h.module}#habits` });
  for (const e of take(d.events, (r) => r.title)) out.push({ key: `e${e.id}`, group: "Calendar", title: e.title, sub: e.date, to: "/calendar" });
  for (const x of take(d.txns, (r) => r.payee ?? "")) out.push({ key: `x${x.id}`, group: "Transactions", title: x.payee ?? "", sub: x.date, to: "/m/financial?tab=transactions" });
  for (const b of take(d.bills, (r) => r.name)) out.push({ key: `b${b.id}`, group: "Bills", title: b.name, to: "/m/financial?tab=bills" });
  for (const a of take(d.accounts, (r) => r.name)) out.push({ key: `a${a.id}`, group: "Accounts", title: a.name, to: "/m/financial?tab=accounts" });
  return out;
}

