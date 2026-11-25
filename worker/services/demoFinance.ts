import { occurrencesInMonth } from "../../shared/finance";
import { addCycles, cycleOf } from "../../shared/progress";
import { addDays } from "../../shared/rotation";
import { payBill, saveBalance, saveBudget, saveRecord, saveTransaction } from "./finance";
import { createTask } from "./tasks";
import type { Ctx } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
/** Synthetic personal-finance data for visual review. Every record is flagged demo and every account, bill, plan and claim is named "(synthetic)". No real person, bank or amount. */
export async function loadDemoFinance(ctx: Ctx, today: string): Promise<{ finance: number; tasks: number }> {
  let n = 0, tasks = 0;
  const m0 = cycleOf(today), m1 = addCycles(m0, -1), m2 = addCycles(m0, -2), m3 = addCycles(m0, -3);
  const D = (m: string, d: number) => `${m}-${pad(d)}`;
  const ok = (r: { ok: boolean; duplicate?: boolean }) => { if (r.ok && !r.duplicate) n++; return r; };
  const A = async (key: string, o: Record<string, unknown>) => { const r = await saveRecord(ctx, "account", { key: `demo:fin:a:${key}`, demo: true, institution: "Synthetic Bank", ...o }, "upsert"); ok(r); return r.ok ? ((r.data.record as { id: string }).id) : ""; };
  const chq = await A("chq", { name: "Everyday Chequing (synthetic)", type: "bank", sortOrder: 1 });
  const sav = await A("sav", { name: "Savings (synthetic)", type: "savings", targetMinor: 500000, interestRate: 3.1, sortOrder: 2 });
  const visa = await A("visa", { name: "Rewards Visa (synthetic)", type: "credit_card", creditLimitMinor: 600000, statementDay: 18, dueDay: 12, minPaymentMinor: 5000, interestRate: 19.99, sortOrder: 3 });
  const loan = await A("loan", { name: "Vehicle Loan (synthetic)", type: "loan", originalPrincipalMinor: 2100000, interestRate: 5.9, dueDay: 27, minPaymentMinor: 42000, sortOrder: 4 });
  const B = async (acc: string, m: string, d: number, amountMinor: number, kind: "confirmed" | "estimate" = "confirmed") => ok(await saveBalance(ctx, { account: acc, asOf: D(m, d), amountMinor, basis: kind, demo: true }));
  // balance history (month ends) and the current confirmed balances
  await B(sav, m3, 28, 60000); await B(sav, m2, 28, 80000); await B(sav, m1, 28, 100000); await B(sav, m0, 1, 100000); await B(sav, m0, Math.max(1, Number(today.slice(8)) - 2), 120000);
  await B(loan, m3, 28, -1520000); await B(loan, m2, 28, -1480000); await B(loan, m1, 28, -1440000); await B(loan, m0, 1, -1440000);
  await B(visa, m1, 28, -118000); await B(visa, m0, Math.max(1, Number(today.slice(8)) - 1), -115230);
  await B(chq, m2, 28, 210000); await B(chq, m1, 28, 265000); await B(chq, m0, Math.max(1, Number(today.slice(8)) - 2), 341852);

  // income: a biweekly pay plan (an estimate) anchored on a recent Friday, plus the deposits that actually arrived
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); const lastFri = addDays(today, -((dow + 2) % 7));
  ok(await saveRecord(ctx, "income_plan", { key: "demo:fin:ip:pay", demo: true, name: "Biweekly pay (synthetic)", amountMinor: 215000, amountKind: "estimate", recurrence: { freq: "weekly", interval: 2, byWeekday: [5] }, anchorDate: addDays(lastFri, -28), account: chq }, "upsert"));
  for (const m of [m1, m0]) for (const d of occurrencesInMonth({ recurrence: { freq: "weekly", interval: 2, byWeekday: [5] }, anchorDate: addDays(lastFri, -28) }, m)) if (d <= today) ok(await saveTransaction(ctx, { key: `demo:fin:t:pay:${d}`, demo: true, account: chq, date: d, amountMinor: 215000, payee: "Employer (synthetic)", category: "Salary" }, "upsert"));
  if (D(m0, 9) <= today) ok(await saveTransaction(ctx, { key: "demo:fin:t:side", demo: true, account: chq, date: D(m0, 9), amountMinor: 30000, payee: "Freelance deposit (synthetic)", category: "Other income" }, "upsert"));

  // bills and their payments
  const bills: Array<[string, string, number, number | null, string, number, string?]> = [
    ["rent", "Rent (synthetic)", 1, 220000, "Housing", 0], ["gym", "Gym (synthetic)", 3, 4000, "Health", 0], ["ins", "Insurance (synthetic)", 5, 14000, "Insurance", 0], ["net", "Internet (synthetic)", 8, 8500, "Utilities", 0],
    ["water", "Water (synthetic)", 10, 4500, "Utilities", 0], ["visa", "Visa payment (synthetic)", 12, null, "Fees and interest", 1, visa], ["hydro", "Electricity (synthetic)", 15, null, "Utilities", 0], ["phone", "Phone (synthetic)", 20, 6500, "Utilities", 0],
    ["stream", "Streaming (synthetic)", 22, 1700, "Subscriptions", 0], ["car", "Vehicle loan payment (synthetic)", 27, 42000, "Fees and interest", 1, loan],
  ];
  const ids: Record<string, string> = {};
  for (const [k, name, day, amt, cat, , counter] of bills) {
    const r = await saveRecord(ctx, "bill", { key: `demo:fin:b:${k}`, demo: true, name, amountMinor: amt, amountKind: amt === null ? "estimate" : "fixed", account: chq, counterAccount: counter, category: cat, recurrence: { freq: "monthly", interval: 1, byMonthDay: day }, anchorDate: D(m3, day), autopay: ["rent", "ins", "net"].includes(k) }, "upsert");
    ok(r); ids[k] = r.ok ? (r.data.record as { id: string }).id : "";
  }
  const variable: Record<string, number> = { visa: 35000, hydro: 12415 };
  for (const [k, , day, amt] of bills) for (const m of [m1, m0]) {
    const due = D(m, day);
    if (due > today || (k === "water" && m === m0)) continue; // water stays unpaid this month: an overdue bill to review
    const amount = (amt ?? (k === "hydro" ? (m === m1 ? 11870 : variable.hydro) : k === "visa" ? (m === m1 ? 40000 : variable.visa) : 0)) / 100;
    ok(await payBill(ctx, { bill: ids[k], dueDate: due, amount, paidOn: due, today }));
  }
  // everyday spending (confirmed), card purchases on the Visa
  const spend: Array<[number, string, string, number, boolean?]> = [
    [2, "Grocer", "Groceries", 12840], [4, "Pharmacy", "Health", 3265], [6, "Fuel", "Transport", 7210], [7, "Cafe", "Dining out", 2480], [9, "Grocer", "Groceries", 9615], [11, "Cinema", "Entertainment", 4200, true],
    [13, "Takeaway", "Dining out", 3890, true], [14, "Fuel", "Transport", 6840], [16, "Grocer", "Groceries", 13420], [17, "Bookshop", "Personal", 3150, true], [19, "Restaurant", "Dining out", 7260, true], [21, "Grocer", "Groceries", 10975],
    [23, "Transit pass", "Transport", 3400], [24, "Hardware", "Personal", 5890, true],
  ];
  for (const m of [m1, m0]) for (const [day, payee, cat, amt, onCard] of spend) {
    const d = D(m, day); if (d > today) continue;
    ok(await saveTransaction(ctx, { key: `demo:fin:t:${m}:${day}`, demo: true, account: onCard ? visa : chq, date: d, amountMinor: -amt - (m === m1 ? 1250 : 0), payee: `${payee} (synthetic)`, category: cat }, "upsert"));
  }
  // transfers are not spending
  for (const m of [m1, m0]) if (D(m, 2) <= today) ok(await saveTransaction(ctx, { key: `demo:fin:t:sav:${m}`, demo: true, account: chq, counterAccount: sav, date: D(m, 2), amountMinor: -20000, payee: "To savings (synthetic)" }, "upsert"));
  // reimbursements: two outstanding, one received
  const expense = await saveTransaction(ctx, { key: "demo:fin:t:travel", demo: true, account: visa, date: addDays(today, -11), amountMinor: -41260, payee: "Conference travel (synthetic)", category: "Other", reimbursable: true }, "upsert"); ok(expense);
  ok(await saveRecord(ctx, "reimbursement", { key: "demo:fin:r:travel", demo: true, description: "Conference travel (synthetic)", amountMinor: 41260, payer: "Employer (synthetic)", claimedOn: addDays(today, -9), expectedDate: addDays(today, 12) }, "upsert"));
  ok(await saveRecord(ctx, "reimbursement", { key: "demo:fin:r:boots", demo: true, description: "Safety boots (synthetic)", amountMinor: 18900, payer: "Employer (synthetic)", claimedOn: addDays(today, -21) }, "upsert"));
  const recv = await saveRecord(ctx, "reimbursement", { key: "demo:fin:r:old", demo: true, description: "Parking (synthetic)", amountMinor: 7600, payer: "Employer (synthetic)", claimedOn: D(m1, 6) }, "upsert");
  if (recv.ok) { ok(recv); ok(await saveTransaction(ctx, { key: "demo:fin:t:reimb", demo: true, account: chq, date: D(m1, 20), amountMinor: 7600, payee: "Employer (synthetic)", reimbursement: (recv.data.record as { id: string }).id }, "upsert")); }
  // budgets
  for (const [cat, amt] of [["Groceries", 65000], ["Dining out", 25000], ["Transport", 22000], ["Entertainment", 15000], ["Utilities", 34000], ["Subscriptions", 8000], ["Personal", 20000]] as const) ok(await saveBudget(ctx, { category: cat, amountMinor: amt, demo: true }));
  // a financial task tied to the upcoming loan payment
  const car = ids.car ? occurrencesInMonth({ recurrence: { freq: "monthly", interval: 1, byMonthDay: 27 }, anchorDate: D(m3, 27) }, m0)[0] : null;
  if (car) { const t = await createTask(ctx, { module: "financial", demo: true, externalId: "demo:financial:t:car", title: "Pay vehicle loan (synthetic)", priority: "high", dueDate: car, recordRef: `bill:${ids.car}` }); if (t.ok && !t.duplicate) tasks++; }
  return { finance: n, tasks };
}
