import { deriveTxnKind, reimbursementRecon, resolveSplit, type AccountType, type FinReimb, type FinReimbLink, type FinTxn, type TxnKind } from "../../shared/finance";
import { assertMinor, parseMinor, type Minor } from "../../shared/money";
import { validateRecurrence } from "../../shared/recurrence";
import { assertModule, Forbidden } from "./access";
import { auditStmt } from "./audit";
import { write } from "./db";
import { resolveToday } from "./prefs";
import { completeTask, reopenTask, sourceOf } from "./tasks";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

/** Everything in the Finance module belongs to the financial module: another assistant is refused, whatever it asks for. */
const MODULE = "financial";
const guard = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof Forbidden) return fail("forbidden", e.message);
    throw e;
  }
};

// ---------- parsing ----------
type FieldType = "text" | "int" | "real" | "money" | "date" | "bool" | "json" | "enum" | "ref";
interface Field { name: string; col: string; type: FieldType; required?: boolean; max?: number; values?: readonly string[]; ref?: "account" | "category" | "bill"; min?: number; maxN?: number }
const f = (name: string, col: string, type: FieldType, o: Partial<Field> = {}): Field => ({ name, col, type, ...o });

/** Money arrives as dollars (`amount`: 12.5 or "12.50") or integer cents (`amountMinor`). Never a float held as money. */
function money(i: Record<string, unknown>, base: string): Minor | null | undefined {
  const minorKey = `${base}Minor`;
  if (i[minorKey] !== undefined && i[minorKey] !== null) { const m = i[minorKey]; if (typeof m !== "number" || !Number.isSafeInteger(m)) throw new v.InvalidInput(`${minorKey} must be an integer number of cents`); return m; }
  const raw = i[base] ?? (minorKey in i && i[minorKey] === null ? null : undefined);
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const s = typeof raw === "number" ? raw.toFixed(2) : typeof raw === "string" ? raw : "";
  if (typeof raw === "number" && (!Number.isFinite(raw) || Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6)) throw new v.InvalidInput(`${base} must have at most two decimals`);
  try { const m = parseMinor(s); assertMinor(m); return m; } catch { throw new v.InvalidInput(`${base} must be an amount in dollars, e.g. 12.50`); }
}

async function resolveRef(ctx: Ctx, kind: "account" | "category" | "bill", ref: unknown, name: string): Promise<string> {
  const text = v.text(ref, name, { max: 200 })!;
  const table = kind === "account" ? "fin_accounts" : kind === "category" ? "fin_categories" : "fin_bills";
  const extra = kind === "account" ? " AND archived_at IS NULL" : kind === "category" ? " AND archived_at IS NULL" : "";
  const byId = await ctx.db.prepare(`SELECT id FROM ${table} WHERE id = ?${extra}`).bind(text).first<{ id: string }>();
  if (byId) return byId.id;
  const { results } = await ctx.db.prepare(`SELECT id FROM ${table} WHERE lower(name) = lower(?)${extra}`).bind(text).all<{ id: string }>();
  if (results.length === 1) return results[0].id;
  throw new v.InvalidInput(results.length ? `${name} "${text}" matches more than one ${kind}: use its id` : `unknown ${kind} "${text}"`);
}

async function parseFields(ctx: Ctx, fields: readonly Field[], i: Record<string, unknown>, creating: boolean): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  for (const d of fields) {
    const base = d.type === "ref" ? d.name.replace(/Id$/, "") : d.name;
    const present = d.type === "money" ? (i[d.name] !== undefined || i[`${d.name.replace(/Minor$/, "")}`] !== undefined || i[`${d.name.replace(/Minor$/, "")}Minor`] !== undefined) : d.type === "ref" ? (i[d.name] !== undefined || i[base] !== undefined) : i[d.name] !== undefined;
    if (!present) { if (creating && d.required) throw new v.InvalidInput(`${d.name} is required`); continue; }
    let val: unknown;
    switch (d.type) {
      case "text": val = i[d.name] === null ? null : v.text(i[d.name], d.name, { max: d.max ?? 300, allowNewlines: d.name === "notes" })!; break;
      case "int": { const n = i[d.name]; if (n === null) { val = null; break; } if (typeof n !== "number" || !Number.isInteger(n) || n < (d.min ?? 0) || n > (d.maxN ?? 1_000_000)) throw new v.InvalidInput(`${d.name} must be an integer ${d.min ?? 0}..${d.maxN ?? 1_000_000}`); val = n; break; }
      case "real": { const n = i[d.name]; if (n === null) { val = null; break; } if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) throw new v.InvalidInput(`${d.name} must be a number 0..100`); val = n; break; }
      case "money": { const root = d.name.replace(/Minor$/, ""); const m = money(i, root); val = m === undefined ? undefined : m; if (val === undefined) continue; break; }
      case "date": val = i[d.name] === null ? null : v.date(i[d.name], d.name, false); break;
      case "bool": val = v.bool(i[d.name], d.name) ? 1 : 0; break;
      case "json": val = JSON.stringify(validateJson(i[d.name], d.name)); break;
      case "enum": val = v.oneOf(i[d.name], d.name, d.values!); break;
      case "ref": { const raw = i[d.name] ?? i[base]; val = raw === null ? null : await resolveRef(ctx, d.ref!, raw, base); break; }
    }
    if (d.required && (val === null || val === undefined)) throw new v.InvalidInput(`${d.name} is required`);
    out.set(d.col, val);
  }
  return out;
}
function validateJson(x: unknown, name: string) { try { return validateRecurrence(x); } catch (e) { throw new v.InvalidInput(`${name}: ${e instanceof RangeError ? e.message : "invalid rule"}`); } }

const KINDS = ["account", "bill", "income_plan", "reimbursement"] as const;
type Kind = (typeof KINDS)[number];
const SPEC: Record<Kind, { table: string; prefix: string; fields: Field[]; audit: string }> = {
  account: { table: "fin_accounts", prefix: "fac", audit: "finance.account", fields: [
    f("name", "name", "text", { required: true, max: 120 }), f("type", "type", "enum", { required: true, values: ["bank", "savings", "credit_card", "loan", "investment", "cash"] }), f("institution", "institution", "text", { max: 120 }),
    f("creditLimitMinor", "credit_limit_minor", "money"), f("statementDay", "statement_day", "int", { min: 1, maxN: 31 }), f("dueDay", "due_day", "int", { min: 1, maxN: 31 }), f("minPaymentMinor", "min_payment_minor", "money"),
    f("interestRate", "interest_rate", "real"), f("originalPrincipalMinor", "original_principal_minor", "money"), f("targetMinor", "target_minor", "money"), f("targetDate", "target_date", "date"), f("sortOrder", "sort_order", "int")] },
  bill: { table: "fin_bills", prefix: "fbl", audit: "finance.bill", fields: [
    f("name", "name", "text", { required: true, max: 120 }), f("amountMinor", "amount_minor", "money"), f("amountKind", "amount_kind", "enum", { values: ["fixed", "estimate"] }), f("accountId", "account_id", "ref", { ref: "account" }),
    f("counterAccountId", "counter_account_id", "ref", { ref: "account" }), f("categoryId", "category_id", "ref", { ref: "category" }), f("recurrence", "recurrence", "json", { required: true }), f("anchorDate", "anchor_date", "date", { required: true }),
    f("autopay", "autopay", "bool"), f("active", "active", "bool"), f("notes", "notes", "text", { max: 2000 })] },
  income_plan: { table: "fin_income_plans", prefix: "fip", audit: "finance.income", fields: [
    f("name", "name", "text", { required: true, max: 120 }), f("amountMinor", "amount_minor", "money"), f("amountKind", "amount_kind", "enum", { values: ["fixed", "estimate"] }), f("recurrence", "recurrence", "json", { required: true }),
    f("anchorDate", "anchor_date", "date", { required: true }), f("accountId", "account_id", "ref", { ref: "account" }), f("active", "active", "bool"), f("notes", "notes", "text", { max: 2000 })] },
  reimbursement: { table: "fin_reimbursements", prefix: "frb", audit: "finance.reimbursement", fields: [
    f("description", "description", "text", { required: true, max: 300 }), f("amountMinor", "amount_minor", "money", { required: true }), f("payer", "payer", "text", { max: 200 }), f("claimedOn", "claimed_on", "date"),
    f("expectedDate", "expected_date", "date"), f("status", "status", "enum", { values: ["outstanding", "received", "written_off"] })] },
};

const rowId = (p: string) => `${p}_${crypto.randomUUID()}`;
type Row = Record<string, unknown>;
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
/** A stored row as the app and assistants see it (camelCase, money as integer cents, JSON parsed). */
function view(r: Row): Row {
  const o: Row = {};
  for (const [k, val] of Object.entries(r)) {
    const key = camel(k);
    if (k === "recurrence" && typeof val === "string") o[key] = JSON.parse(val);
    else if (["archived_at"].includes(k)) o[key] = val;
    else if (["demo", "autopay", "active", "reimbursable"].includes(k)) o[key] = val === 1;
    else if (k === "source_kind" || k === "source_name" || k === "source_assistant" || k === "source_ref") continue;
    else o[key] = val;
  }
  o.source = { kind: r.source_kind ?? "manual", name: r.source_name ?? "Orbis", assistant: r.source_assistant ?? null, ref: r.source_ref ?? null };
  return o;
}

export type Outcome = "created" | "updated" | "unchanged";
export interface Saved { kind: string; record: Row; outcome: Outcome }

/** Create, update or upsert (by the assistant's own `key`) one account, bill, income plan or reimbursement. Idempotent on the key. */
export async function saveRecord(ctx: Ctx, kind: Kind, raw: unknown, mode: "create" | "update" | "upsert"): Promise<Result<Saved>> {
  return guard<Saved>(async () => {
    assertModule(ctx.actor, MODULE);
    const i = v.obj(raw, kind); const sp = SPEC[kind]; const src = sourceOf(ctx);
    const key = v.text(i.key ?? i.externalId, "key", { max: 200, optional: true });
    if (mode === "upsert" && !key) throw new v.InvalidInput("key is required");
    let row: Row | null = null;
    if (mode === "update") { row = await ctx.db.prepare(`SELECT * FROM ${sp.table} WHERE id = ?`).bind(v.text(i.id, "id", { max: 100 })!).first<Row>(); if (!row) return fail("not_found", `No such ${kind}`); }
    else if (key) row = await ctx.db.prepare(`SELECT * FROM ${sp.table} WHERE source_name = ? AND external_id = ?`).bind(src.name, key).first<Row>();
    if (mode === "update" && i.expectedVersion !== undefined && i.expectedVersion !== row!.version) return fail("conflict", `Changed since version ${String(i.expectedVersion)}; current version is ${String(row!.version)}. Read it again and retry.`);
    const vals = await parseFields(ctx, sp.fields, i, !row);
    const at = ctx.now().toISOString();
    if (row) {
      const sets: string[] = [], args: unknown[] = [];
      for (const [col, val] of vals) if (val !== (row[col] ?? null)) { sets.push(`${col} = ?`); args.push(val); }
      if (mode !== "update" || kind === "account" || kind === "bill" || kind === "income_plan" || kind === "reimbursement") { const srcRef = v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }); if (srcRef && srcRef !== row.source_ref) { sets.push("source_ref = ?"); args.push(srcRef); } }
      if (v.bool(i.archived, "archived") !== undefined && kind !== "reimbursement") { const want = v.bool(i.archived, "archived") ? at : null; if (want !== (row.archived_at ?? null) && "archived_at" in row) { sets.push("archived_at = ?"); args.push(want); } }
      if (!sets.length) return ok({ kind, record: view(row), outcome: "unchanged" as const }, { duplicate: true });
      await write(ctx.db, [ctx.db.prepare(`UPDATE ${sp.table} SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, row.id), auditStmt(ctx, `${sp.audit}.update`, kind, row.id as string)]);
      return ok({ kind, record: view((await ctx.db.prepare(`SELECT * FROM ${sp.table} WHERE id = ?`).bind(row.id).first<Row>())!), outcome: "updated" as const });
    }
    const id = rowId(sp.prefix);
    const cols = ["id", ...vals.keys(), "source_kind", "source_name", "source_assistant", "source_ref", "external_id", "demo", "created_at", "updated_at", "created_by", "updated_by"];
    const args = [id, ...vals.values(), src.kind, src.name, src.assistant, v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }) ?? null, key ?? null, v.bool(i.demo, "demo") ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label];
    if (kind === "bill" && !vals.has("amount_kind")) { cols.push("amount_kind"); args.push(vals.get("amount_minor") == null ? "estimate" : "fixed"); }
    if (kind === "income_plan" && !vals.has("amount_kind")) { cols.push("amount_kind"); args.push("estimate"); }
    await write(ctx.db, [ctx.db.prepare(`INSERT INTO ${sp.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...args), auditStmt(ctx, `${sp.audit}.create`, kind, id)]);
    return ok({ kind, record: view((await ctx.db.prepare(`SELECT * FROM ${sp.table} WHERE id = ?`).bind(id).first<Row>())!), outcome: "created" as const });
  });
}

// ---------- balances, categories, budgets ----------
export const saveBalance = (ctx: Ctx, raw: unknown): Promise<Result<Saved>> => guard<Saved>(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "balance"); const src = sourceOf(ctx);
  const accountId = await resolveRef(ctx, "account", i.accountId ?? i.account, "account");
  const asOf = v.date(i.asOf, "asOf", false)!; const amount = money(i, "amount"); if (amount === undefined || amount === null) throw new v.InvalidInput("amount is required");
  const kind = v.oneOf(i.basis, "basis", ["confirmed", "estimate"] as const, "confirmed")!;
  const type = (await ctx.db.prepare("SELECT type FROM fin_accounts WHERE id = ?").bind(accountId).first<{ type: AccountType }>())!.type;
  if ((type === "credit_card" || type === "loan") && amount > 0) throw new v.InvalidInput("a card or loan balance is what is owed, so it is negative (for example -2300.00)");
  const ex = await ctx.db.prepare("SELECT id, amount_minor FROM fin_balances WHERE account_id = ? AND as_of = ? AND kind = ?").bind(accountId, asOf, kind).first<{ id: string; amount_minor: number }>();
  if (ex && ex.amount_minor === amount) return ok({ kind: "balance", record: { id: ex.id, accountId, asOf, amountMinor: amount, kind }, outcome: "unchanged" as const }, { duplicate: true });
  const at = ctx.now().toISOString(); const id = ex?.id ?? rowId("fbal");
  await write(ctx.db, [
    ex ? ctx.db.prepare("UPDATE fin_balances SET amount_minor = ?, note = COALESCE(?, note), created_by = ? WHERE id = ?").bind(amount, v.text(i.note, "note", { max: 300, optional: true }) ?? null, ctx.actor.label, id)
       : ctx.db.prepare("INSERT INTO fin_balances (id,account_id,as_of,amount_minor,kind,note,source_kind,source_name,source_ref,demo,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, accountId, asOf, amount, kind, v.text(i.note, "note", { max: 300, optional: true }) ?? null, src.kind, src.name, v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }) ?? null, v.bool(i.demo, "demo") ? 1 : 0, at, ctx.actor.label),
    auditStmt(ctx, "finance.balance", "account", accountId),
  ]);
  return ok({ kind: "balance", record: { id, accountId, asOf, amountMinor: amount, kind }, outcome: ex ? ("updated" as const) : ("created" as const) });
});

export const saveCategory = (ctx: Ctx, raw: unknown): Promise<Result<Saved>> => guard<Saved>(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "category"); const name = v.text(i.name, "name", { max: 60 })!; const kind = v.oneOf(i.flow, "flow", ["expense", "income"] as const, "expense")!;
  const ex = await ctx.db.prepare("SELECT * FROM fin_categories WHERE lower(name) = lower(?)").bind(name).first<Row>();
  if (ex) return ok({ kind: "category", record: view(ex), outcome: "unchanged" as const }, { duplicate: true });
  const id = rowId("fcat");
  await write(ctx.db, [ctx.db.prepare("INSERT INTO fin_categories (id,name,kind,sort_order) VALUES (?,?,?,100)").bind(id, name, kind), auditStmt(ctx, "finance.category.create", "category", id)]);
  return ok({ kind: "category", record: { id, name, kind }, outcome: "created" as const });
});

export const saveBudget = (ctx: Ctx, raw: unknown): Promise<Result<Saved>> => guard<Saved>(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "budget"); const categoryId = await resolveRef(ctx, "category", i.categoryId ?? i.category, "category");
  const cycle = v.text(i.cycle, "cycle", { max: 7, optional: true }) ?? "*"; if (cycle !== "*" && !/^\d{4}-\d{2}$/.test(cycle)) throw new v.InvalidInput("cycle must be * (every month) or YYYY-MM");
  const amount = money(i, "amount"); if (amount === undefined || amount === null || amount < 0) throw new v.InvalidInput("amount is required");
  const ex = await ctx.db.prepare("SELECT id, amount_minor FROM fin_budgets WHERE category_id = ? AND cycle = ?").bind(categoryId, cycle).first<{ id: string; amount_minor: number }>();
  if (ex && ex.amount_minor === amount) return ok({ kind: "budget", record: { id: ex.id, categoryId, cycle, amountMinor: amount }, outcome: "unchanged" as const }, { duplicate: true });
  const at = ctx.now().toISOString(); const id = ex?.id ?? rowId("fbg");
  await write(ctx.db, [ex ? ctx.db.prepare("UPDATE fin_budgets SET amount_minor = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(amount, at, ctx.actor.label, id) : ctx.db.prepare("INSERT INTO fin_budgets (id,category_id,cycle,amount_minor,demo,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?)").bind(id, categoryId, cycle, amount, v.bool(i.demo, "demo") ? 1 : 0, at, at, ctx.actor.label), auditStmt(ctx, "finance.budget", "budget", id)]);
  return ok({ kind: "budget", record: { id, categoryId, cycle, amountMinor: amount }, outcome: ex ? ("updated" as const) : ("created" as const) });
});

// ---------- transactions ----------
const TXN_FIELDS: Field[] = [
  f("accountId", "account_id", "ref", { ref: "account", required: true }), f("counterAccountId", "counter_account_id", "ref", { ref: "account" }), f("date", "date", "date", { required: true }),
  f("amountMinor", "amount_minor", "money", { required: true }), f("payee", "payee", "text", { max: 200 }), f("description", "description", "text", { max: 500 }), f("categoryId", "category_id", "ref", { ref: "category" }),
  f("status", "status", "enum", { values: ["confirmed", "pending"] }), f("reimbursable", "reimbursable", "bool"),
  f("principalMinor", "principal_minor", "money"), f("interestMinor", "interest_minor", "money"),
];
const LIVE = "voided_at IS NULL AND reversed_by IS NULL AND reversal_of IS NULL";
/** The history row for a transaction (what was changed and why). Joins the same batch as the change. */
const historyStmt = (ctx: Ctx, txnId: string, action: "edit" | "void" | "reverse" | "reversal_entry" | "payment_reversed" | "link", reason: string | null, changed: Array<{ field: string; from: unknown; to: unknown }>) =>
  ctx.db.prepare("INSERT INTO fin_txn_history (txn_id, at, action, actor_label, channel, reason, changed) VALUES (?,?,?,?,?,?,?)").bind(txnId, ctx.now().toISOString(), action, ctx.actor.label, ctx.actor.channel, reason, JSON.stringify(changed));
/** Keeps a reimbursement claim in step with the deposits recorded against it: received once the live deposits cover it, otherwise outstanding. A written-off claim stays written off. */
const claimSyncStmt = (ctx: Ctx, claimId: string, at: string) =>
  ctx.db.prepare(`UPDATE fin_reimbursements SET
    status = CASE WHEN status = 'written_off' THEN status WHEN COALESCE((SELECT SUM(amount_minor) FROM fin_transactions WHERE reimbursement_id = fin_reimbursements.id AND kind = 'reimbursement' AND status = 'confirmed' AND ${LIVE}), 0) >= amount_minor THEN 'received' ELSE 'outstanding' END,
    received_txn_id = (SELECT id FROM fin_transactions WHERE reimbursement_id = fin_reimbursements.id AND kind = 'reimbursement' AND ${LIVE} ORDER BY date DESC, created_at DESC LIMIT 1),
    updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(at, ctx.actor.label, claimId);

/** A transaction by its id, or by the assistant's own key. */
async function findTxn(ctx: Ctx, i: Record<string, unknown>): Promise<Row | null> {
  const id = v.text(i.id ?? i.transaction, "id", { max: 200, optional: true });
  if (id) { const byId = await ctx.db.prepare("SELECT * FROM fin_transactions WHERE id = ?").bind(id).first<Row>(); if (byId) return byId; }
  const key = v.text(i.key ?? i.externalId ?? id, "key", { max: 200, optional: true });
  if (!key) throw new v.InvalidInput("id (or key) is required");
  return await ctx.db.prepare("SELECT * FROM fin_transactions WHERE source_name = ? AND external_id = ?").bind(sourceOf(ctx).name, key).first<Row>();
}
const txnView = async (ctx: Ctx, id: string) => view((await ctx.db.prepare("SELECT * FROM fin_transactions WHERE id = ?").bind(id).first<Row>())!);
const refuseIfFrozen = (row: Row, doing: string) => {
  if (row.voided_at) throw new v.InvalidInput(`This transaction was voided${row.void_reason ? ` (${String(row.void_reason)})` : ""} and cannot be ${doing}. Record a new transaction instead.`);
  if (row.reversal_of) throw new v.InvalidInput(`This is the offsetting entry that reverses another transaction and cannot be ${doing}.`);
  if (row.reversed_by) throw new v.InvalidInput(`This transaction has been reversed and cannot be ${doing}. The reversal keeps it on record.`);
};
/** Reads a loan payment's principal/interest (dollars or cents) from the input. undefined = neither given. The part not given is derived from the total. */
function readSplit(i: Record<string, unknown>) {
  const p = money(i, "principal"), n = money(i, "interest");
  return p === undefined && n === undefined ? undefined : { principal: p ?? null, interest: n ?? null };
}

/**
 * One confirmed or pending transaction. The kind (income, expense, transfer, card payment, loan payment, reimbursement) is derived from its shape.
 * A bill payment (`bill` + `billDue`) is recorded once: if that occurrence already has its transaction, that one is returned instead of a second.
 * Receiving a reimbursement (`reimbursement`) is reconciled against its claim. A loan payment may carry `principal` and `interest` (they must add up to it).
 * An edit keeps a before/after history row; a voided, reversed or reversing transaction cannot be edited. Idempotent on `key`.
 */
export const saveTransaction = (ctx: Ctx, raw: unknown, mode: "create" | "update" | "upsert"): Promise<Result<Saved>> => guard<Saved>(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "transaction"); const src = sourceOf(ctx);
  const key = v.text(i.key ?? i.externalId, "key", { max: 200, optional: true });
  if (mode === "upsert" && !key) throw new v.InvalidInput("key is required");
  let row: Row | null = null;
  if (mode === "update") { row = await ctx.db.prepare("SELECT * FROM fin_transactions WHERE id = ?").bind(v.text(i.id, "id", { max: 100 })!).first<Row>(); if (!row) return fail("not_found", "No such transaction"); }
  else if (key) row = await ctx.db.prepare("SELECT * FROM fin_transactions WHERE source_name = ? AND external_id = ?").bind(src.name, key).first<Row>();
  if (row) refuseIfFrozen(row, "edited");
  if (row && mode === "update" && i.expectedVersion !== undefined && i.expectedVersion !== row.version) return fail("conflict", `Changed since version ${String(i.expectedVersion)}; current version is ${String(row.version)}. Read it again and retry.`);
  const vals = await parseFields(ctx, TXN_FIELDS, i, !row);
  vals.delete("principal_minor"); vals.delete("interest_minor");
  const amount = (vals.get("amount_minor") as number | undefined) ?? (row?.amount_minor as number);
  if (amount === 0) throw new v.InvalidInput("amount cannot be zero");
  const accountId = (vals.get("account_id") as string | undefined) ?? (row?.account_id as string);
  const counterId = vals.has("counter_account_id") ? (vals.get("counter_account_id") as string | null) : ((row?.counter_account_id as string | null) ?? null);
  if (counterId && counterId === accountId) throw new v.InvalidInput("a transfer needs two different accounts");
  const { results: accs } = await ctx.db.prepare("SELECT id, type FROM fin_accounts").all<{ id: string; type: AccountType }>();
  const types = new Map(accs.map((a) => [a.id, a.type]));
  let billId: string | null = (row?.bill_id as string | null) ?? null, billDue: string | null = (row?.bill_due as string | null) ?? null, reimbId: string | null = (row?.reimbursement_id as string | null) ?? null;
  if (i.bill !== undefined || i.billId !== undefined) { if (row) throw new v.InvalidInput("a recorded transaction cannot be attached to a different bill"); billId = await resolveRef(ctx, "bill", i.billId ?? i.bill, "bill"); billDue = v.date(i.billDue, "billDue", false)!; }
  if (i.reimbursement !== undefined || i.reimbursementId !== undefined) { if (row) throw new v.InvalidInput("a recorded transaction cannot be attached to a different reimbursement claim"); reimbId = v.text(i.reimbursementId ?? i.reimbursement, "reimbursement", { max: 100 })!; if (!(await ctx.db.prepare("SELECT id FROM fin_reimbursements WHERE id = ?").bind(reimbId).first())) throw new v.InvalidInput("unknown reimbursement"); }
  if (reimbId && (amount < 0 || counterId)) throw new v.InvalidInput("a reimbursement received is money in, to one account");
  const kind: TxnKind = deriveTxnKind({ amountMinor: amount, counterAccountId: counterId, reimbursementId: reimbId }, types);
  if (row && billId && kind !== row.kind) throw new v.InvalidInput("this is a bill payment: it cannot change into a different kind of transaction. Reverse or void it, then record the right one.");
  // loan split
  const given = readSplit(i);
  let split: { principalMinor: number; interestMinor: number } | null = null;
  if (kind === "loan_payment") {
    const carried = row && !given && (row.principal_minor !== null && row.principal_minor !== undefined) ? { principal: row.principal_minor as number, interest: row.interest_minor as number | null } : null;
    try { split = resolveSplit(amount, given ? given.principal : carried?.principal, given ? given.interest : carried?.interest); } catch (e) { if (e instanceof RangeError) throw new v.InvalidInput(e.message + (carried && !given ? ". The payment amount changed: send principal and interest again" : "")); throw e; }
  } else if (given && (given.principal || given.interest)) throw new v.InvalidInput("principal and interest apply only to a payment on a loan");
  const at = ctx.now().toISOString();
  // A bill occurrence that already has its (standing) transaction is the same payment: return it, never a second.
  if (billId && billDue && !row) {
    const p = await ctx.db.prepare("SELECT txn_id FROM fin_bill_payments WHERE bill_id = ? AND due_date = ? AND reversed_at IS NULL").bind(billId, billDue).first<{ txn_id: string | null }>();
    if (p?.txn_id) { const ex = await ctx.db.prepare("SELECT * FROM fin_transactions WHERE id = ?").bind(p.txn_id).first<Row>(); if (ex) return ok({ kind: "transaction", record: view(ex), outcome: "unchanged" as const }, { duplicate: true });
    }
  }
  if (row) {
    const sets: string[] = [], args: unknown[] = [], changed: Array<{ field: string; from: unknown; to: unknown }> = [];
    for (const [col, val] of vals) if (val !== (row[col] ?? null)) { sets.push(`${col} = ?`); args.push(val); changed.push({ field: camel(col), from: row[col] ?? null, to: val }); }
    if (kind !== row.kind) { sets.push("kind = ?"); args.push(kind); changed.push({ field: "kind", from: row.kind, to: kind }); }
    const wantP = split?.principalMinor ?? null, wantI = split?.interestMinor ?? null;
    if (wantP !== (row.principal_minor ?? null)) { sets.push("principal_minor = ?"); args.push(wantP); changed.push({ field: "principalMinor", from: row.principal_minor ?? null, to: wantP }); }
    if (wantI !== (row.interest_minor ?? null)) { sets.push("interest_minor = ?"); args.push(wantI); changed.push({ field: "interestMinor", from: row.interest_minor ?? null, to: wantI }); }
    if (!sets.length) return ok({ kind: "transaction", record: view(row), outcome: "unchanged" as const }, { duplicate: true });
    const stmts = [ctx.db.prepare(`UPDATE fin_transactions SET ${sets.join(", ")}, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?`).bind(...args, at, ctx.actor.label, row.id), historyStmt(ctx, row.id as string, "edit", v.text(i.reason, "reason", { max: 300, optional: true }) ?? null, changed), auditStmt(ctx, "finance.transaction.update", "transaction", row.id as string)];
    if (billId && (vals.has("amount_minor") || vals.has("date"))) stmts.push(ctx.db.prepare("UPDATE fin_bill_payments SET amount_minor = ?, paid_on = ? WHERE txn_id = ? AND reversed_at IS NULL").bind(Math.abs(amount), (vals.get("date") as string | undefined) ?? row.date, row.id));
    if (reimbId) stmts.push(claimSyncStmt(ctx, reimbId, at));
    await write(ctx.db, stmts);
    return ok({ kind: "transaction", record: await txnView(ctx, row.id as string), outcome: "updated" as const });
  }
  // An unkeyed twin (same account, date, amount and payee) that an assistant is now reporting with a key is adopted, not duplicated.
  if (key && ctx.actor.type === "integration") {
    const twin = await ctx.db.prepare(`SELECT * FROM fin_transactions WHERE account_id = ? AND date = ? AND amount_minor = ? AND external_id IS NULL AND ${LIVE} AND lower(COALESCE(payee,'')) = lower(?) LIMIT 1`).bind(accountId, vals.get("date"), amount, (vals.get("payee") as string | undefined) ?? "").first<Row>();
    if (twin) { await write(ctx.db, [ctx.db.prepare("UPDATE fin_transactions SET external_id = ?, source_name = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").bind(key, src.name, at, ctx.actor.label, twin.id), historyStmt(ctx, twin.id as string, "edit", "Matched to the assistant's own record", [{ field: "externalId", from: null, to: key }]), auditStmt(ctx, "finance.transaction.update", "transaction", twin.id as string)]); return ok({ kind: "transaction", record: await txnView(ctx, twin.id as string), outcome: "updated" as const }); }
  }
  const id = rowId("ftx");
  const stmts = [
    ctx.db.prepare("INSERT INTO fin_transactions (id,account_id,counter_account_id,date,amount_minor,kind,payee,description,category_id,status,bill_id,bill_due,reimbursement_id,reimbursable,principal_minor,interest_minor,source_kind,source_name,source_assistant,source_ref,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, accountId, counterId, vals.get("date"), amount, kind, vals.get("payee") ?? null, vals.get("description") ?? null, vals.get("category_id") ?? null, vals.get("status") ?? "confirmed", billId, billDue, reimbId, vals.get("reimbursable") ?? 0, split?.principalMinor ?? null, split?.interestMinor ?? null, src.kind, src.name, src.assistant, v.text(i.sourceRef, "sourceRef", { max: 300, optional: true }) ?? null, key ?? null, v.bool(i.demo, "demo") ? 1 : 0, at, at, ctx.actor.label, ctx.actor.label),
    auditStmt(ctx, "finance.transaction.create", "transaction", id),
  ];
  if (billId && billDue) stmts.push(ctx.db.prepare("INSERT INTO fin_bill_payments (id,bill_id,due_date,status,paid_on,amount_minor,txn_id,demo,created_at,created_by) VALUES (?,?,?,'paid',?,?,?,?,?,?) ON CONFLICT (bill_id, due_date) DO UPDATE SET status = 'paid', paid_on = excluded.paid_on, amount_minor = excluded.amount_minor, txn_id = excluded.txn_id, reversed_at = NULL, reversed_by = NULL, reverse_reason = NULL, completed_task_id = NULL").bind(rowId("fbp"), billId, billDue, vals.get("date"), Math.abs(amount), id, v.bool(i.demo, "demo") ? 1 : 0, at, ctx.actor.label));
  if (reimbId) stmts.push(claimSyncStmt(ctx, reimbId, at));
  await write(ctx.db, stmts);
  return ok({ kind: "transaction", record: await txnView(ctx, id), outcome: "created" as const });
});

// ---------- voiding and reversing ----------
export interface Corrected { id: string; status: "voided" | "reversed"; reversalId: string | null; billPaymentReversed: boolean; taskReopened: boolean; record: Row }
/** What else a voided or reversed transaction takes with it: the bill payment it confirmed (and the task that payment completed) and the claim it settled. Statements to add after the change itself. */
async function sideEffects(ctx: Ctx, row: Row, at: string, why: string): Promise<{ stmts: D1PreparedStatement[]; reopenTask: string | null; paymentReversed: boolean }> {
  const stmts: D1PreparedStatement[] = []; let reopenTask: string | null = null; let paymentReversed = false;
  const pay = await ctx.db.prepare("SELECT * FROM fin_bill_payments WHERE txn_id = ? AND reversed_at IS NULL").bind(row.id).first<Row>();
  if (pay) { paymentReversed = true; reopenTask = (pay.completed_task_id as string | null) ?? null; stmts.push(ctx.db.prepare("UPDATE fin_bill_payments SET reversed_at = ?, reversed_by = ?, reverse_reason = ? WHERE id = ?").bind(at, ctx.actor.label, why, pay.id), historyStmt(ctx, row.id as string, "payment_reversed", why, [{ field: "billPayment", from: "paid", to: "reversed" }]), auditStmt(ctx, "finance.bill.reverse", "bill", pay.bill_id as string)); }
  if (row.reimbursement_id) stmts.push(claimSyncStmt(ctx, row.reimbursement_id as string, at));
  return { stmts, reopenTask, paymentReversed };
}
async function reopenIfCompleted(ctx: Ctx, taskId: string | null, today: string): Promise<boolean> {
  if (!taskId) return false;
  const t = await ctx.db.prepare("SELECT status FROM tasks WHERE id = ?").bind(taskId).first<{ status: string }>();
  if (!t || t.status !== "completed") return false; // already reopened, or changed since: leave it alone
  return (await reopenTask(ctx, { id: taskId, today })).ok;
}

/** Voids a transaction: it stays on record with its reason but counts nowhere, as though it had never happened. A second void changes nothing. */
export const voidTransaction = (ctx: Ctx, raw: unknown): Promise<Result<Corrected>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "input"); const reason = v.text(i.reason, "reason", { max: 300 })!; const today = await resolveToday(ctx, i, v);
  const row = await findTxn(ctx, i); if (!row) return fail("not_found", "No such transaction");
  if (row.voided_at) return ok({ id: row.id as string, status: "voided", reversalId: null, billPaymentReversed: false, taskReopened: false, record: view(row) }, { duplicate: true });
  refuseIfFrozen(row, "voided");
  const at = ctx.now().toISOString(); const fx = await sideEffects(ctx, row, at, `Voided: ${reason}`);
  await write(ctx.db, [
    ctx.db.prepare("UPDATE fin_transactions SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND voided_at IS NULL").bind(at, ctx.actor.label, reason, at, ctx.actor.label, row.id),
    historyStmt(ctx, row.id as string, "void", reason, [{ field: "voidedAt", from: null, to: at }]), auditStmt(ctx, "finance.transaction.void", "transaction", row.id as string), ...fx.stmts,
  ]);
  const taskReopened = await reopenIfCompleted(ctx, fx.reopenTask, today);
  return ok({ id: row.id as string, status: "voided", reversalId: null, billPaymentReversed: fx.paymentReversed, taskReopened, record: await txnView(ctx, row.id as string) });
});

/** Reverses a transaction with one offsetting entry (the opposite amount, same accounts). Both stay on record; together they net to zero. A second reversal returns the first. */
export const reverseTransaction = (ctx: Ctx, raw: unknown): Promise<Result<Corrected>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "input"); const reason = v.text(i.reason, "reason", { max: 300 })!; const today = await resolveToday(ctx, i, v);
  const row = await findTxn(ctx, i); if (!row) return fail("not_found", "No such transaction");
  if (row.reversed_by) return ok({ id: row.id as string, status: "reversed", reversalId: row.reversed_by as string, billPaymentReversed: false, taskReopened: false, record: view(row) }, { duplicate: true });
  refuseIfFrozen(row, "reversed");
  const at = ctx.now().toISOString(); const date = v.date(i.date, "date") ?? today; const rid = rowId("ftx"); const src = sourceOf(ctx);
  const fx = await sideEffects(ctx, row, at, `Reversed: ${reason}`);
  await write(ctx.db, [
    ctx.db.prepare("INSERT INTO fin_transactions (id,account_id,counter_account_id,date,amount_minor,kind,payee,description,category_id,status,reversal_of,principal_minor,interest_minor,source_kind,source_name,source_assistant,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(rid, row.account_id, row.counter_account_id ?? null, date, -(row.amount_minor as number), row.kind, row.payee ?? null, `Reversal: ${reason}`.slice(0, 500), row.category_id ?? null, row.id, row.principal_minor ?? null, row.interest_minor ?? null, src.kind, src.name, src.assistant, `reversal:${row.id}`, row.demo ?? 0, at, at, ctx.actor.label, ctx.actor.label),
    ctx.db.prepare("UPDATE fin_transactions SET reversed_by = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND reversed_by IS NULL").bind(rid, at, ctx.actor.label, row.id),
    historyStmt(ctx, row.id as string, "reverse", reason, [{ field: "reversedBy", from: null, to: rid }]), historyStmt(ctx, rid, "reversal_entry", reason, [{ field: "reversalOf", from: null, to: row.id }]),
    auditStmt(ctx, "finance.transaction.reverse", "transaction", row.id as string), ...fx.stmts,
  ]);
  const taskReopened = await reopenIfCompleted(ctx, fx.reopenTask, today);
  return ok({ id: row.id as string, status: "reversed", reversalId: rid, billPaymentReversed: fx.paymentReversed, taskReopened, record: await txnView(ctx, row.id as string) });
});

/**
 * Reverses a bill payment confirmation: the occurrence is unpaid (or overdue) again, its transaction is voided (default) or reversed (`how: "reverse"`, when money really moved back),
 * and the task that payment completed is reopened (a task the owner had already reopened or changed is left alone). The same due date can be paid again afterwards, once.
 */
export const reverseBillPayment = (ctx: Ctx, raw: unknown): Promise<Result<{ billId: string; dueDate: string; transaction: string | null; how: string; taskReopened: boolean }>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "input"); const reason = v.text(i.reason, "reason", { max: 300 })!; const today = await resolveToday(ctx, i, v);
  const billId = await resolveRef(ctx, "bill", i.billId ?? i.bill, "bill"); const dueDate = v.date(i.dueDate, "dueDate", false)!;
  const how = v.oneOf(i.how, "how", ["void", "reverse"] as const, "void")!;
  const pay = await ctx.db.prepare("SELECT * FROM fin_bill_payments WHERE bill_id = ? AND due_date = ?").bind(billId, dueDate).first<Row>();
  if (pay?.reversed_at) return ok({ billId, dueDate, transaction: (pay.txn_id as string | null) ?? null, how, taskReopened: false }, { duplicate: true });
  const at = ctx.now().toISOString();
  if (!pay) { // marked paid only through its task: reopen that task
    const t = await ctx.db.prepare("SELECT id FROM tasks WHERE record_ref = ? AND due_date = ? AND status = 'completed' AND archived_at IS NULL LIMIT 1").bind(`bill:${billId}`, dueDate).first<{ id: string }>();
    if (!t) return fail("not_found", "That occurrence is not recorded as paid");
    await write(ctx.db, [auditStmt(ctx, "finance.bill.reverse", "bill", billId)]);
    return ok({ billId, dueDate, transaction: null, how, taskReopened: await reopenIfCompleted(ctx, t.id, today) });
  }
  const txnId = (pay.txn_id as string | null) ?? null;
  const txn = txnId ? await ctx.db.prepare("SELECT * FROM fin_transactions WHERE id = ?").bind(txnId).first<Row>() : null;
  if (txn && !txn.voided_at && !txn.reversed_by) {
    const r = how === "reverse" ? await reverseTransaction(ctx, { id: txn.id, reason: `Bill payment reversed: ${reason}`, today }) : await voidTransaction(ctx, { id: txn.id, reason: `Bill payment reversed: ${reason}`, today });
    if (!r.ok) return r as unknown as Result<never>;
    // voiding or reversing the transaction already reversed the payment; record the owner's reason on it
    await write(ctx.db, [ctx.db.prepare("UPDATE fin_bill_payments SET reverse_reason = ? WHERE id = ?").bind(reason, pay.id)]);
    return ok({ billId, dueDate, transaction: txnId, how, taskReopened: r.data.taskReopened });
  }
  // a skipped occurrence, a payment recorded without a transaction, or one whose transaction was already corrected
  await write(ctx.db, [ctx.db.prepare("UPDATE fin_bill_payments SET reversed_at = ?, reversed_by = ?, reverse_reason = ? WHERE id = ? AND reversed_at IS NULL").bind(at, ctx.actor.label, reason, pay.id), auditStmt(ctx, "finance.bill.reverse", "bill", billId)]);
  return ok({ billId, dueDate, transaction: txnId, how, taskReopened: await reopenIfCompleted(ctx, (pay.completed_task_id as string | null) ?? null, today) });
});

// ---------- reimbursement claims and the expenses they recover ----------
/** A reimbursement claim, with the expenses it recovers (`expenses`: [{ txn, amount | amountMinor }]). Linking replaces the claim's links; each change is audited. */
export const saveReimbursement = (ctx: Ctx, raw: unknown, mode: "create" | "update" | "upsert"): Promise<Result<Saved>> => guard<Saved>(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "reimbursement");
  const links = i.expenses === undefined ? undefined : await readLinks(ctx, i.expenses);
  if (links) { // checked before anything is saved, so a refused link leaves no half-made claim
    const key = v.text(i.key ?? i.externalId, "key", { max: 200, optional: true });
    const pre = mode === "update" ? v.text(i.id, "id", { max: 100 }) : key ? (await ctx.db.prepare("SELECT id FROM fin_reimbursements WHERE source_name = ? AND external_id = ?").bind(sourceOf(ctx).name, key).first<{ id: string }>())?.id : null;
    const claimAmount = money(i, "amount") ?? (pre ? ((await ctx.db.prepare("SELECT amount_minor FROM fin_reimbursements WHERE id = ?").bind(pre).first<{ amount_minor: number }>())?.amount_minor ?? null) : null);
    const total = links.reduce((a, l) => a + l.amountMinor, 0);
    if (claimAmount !== null && claimAmount !== undefined && total > claimAmount) throw new v.InvalidInput(`the linked expenses (${(total / 100).toFixed(2)}) are more than the claim (${(claimAmount / 100).toFixed(2)})`);
    for (const l of links) {
      const other = (await ctx.db.prepare("SELECT COALESCE(SUM(amount_minor),0) AS n FROM fin_reimbursement_links WHERE txn_id = ? AND reimbursement_id != ?").bind(l.txnId, pre ?? "").first<{ n: number }>())!.n;
      if (other + l.amountMinor > l.expenseMinor) throw new v.InvalidInput(`more is claimed against "${l.label}" than it cost (${(l.expenseMinor / 100).toFixed(2)})`);
    }
  }
  const r = await saveRecord(ctx, "reimbursement", i, mode); if (!r.ok || links === undefined) return r;
  const claim = r.data.record; const claimId = claim.id as string;
  const existing = (await ctx.db.prepare("SELECT * FROM fin_reimbursement_links WHERE reimbursement_id = ?").bind(claimId).all<Row>()).results;
  const keep = new Map(links.map((l) => [l.txnId, l])); const at = ctx.now().toISOString(); const stmts: D1PreparedStatement[] = []; let changedAny = false;
  for (const l of links) {
    const have = existing.find((e) => e.txn_id === l.txnId);
    if (!have) { changedAny = true; stmts.push(ctx.db.prepare("INSERT INTO fin_reimbursement_links (id,reimbursement_id,txn_id,amount_minor,created_at,created_by) VALUES (?,?,?,?,?,?)").bind(rowId("frl"), claimId, l.txnId, l.amountMinor, at, ctx.actor.label), ctx.db.prepare("UPDATE fin_transactions SET reimbursable = 1, updated_at = ?, updated_by = ?, version = version + (reimbursable = 0) WHERE id = ?").bind(at, ctx.actor.label, l.txnId), historyStmt(ctx, l.txnId, "link", `Linked to claim "${String(claim.description)}"`, [{ field: "claimedMinor", from: 0, to: l.amountMinor }])); }
    else if (have.amount_minor !== l.amountMinor) { changedAny = true; stmts.push(ctx.db.prepare("UPDATE fin_reimbursement_links SET amount_minor = ? WHERE id = ?").bind(l.amountMinor, have.id), historyStmt(ctx, l.txnId, "link", `Claim "${String(claim.description)}" amount changed`, [{ field: "claimedMinor", from: have.amount_minor, to: l.amountMinor }])); }
  }
  for (const e of existing) if (!keep.has(e.txn_id as string)) { changedAny = true; stmts.push(ctx.db.prepare("DELETE FROM fin_reimbursement_links WHERE id = ?").bind(e.id), historyStmt(ctx, e.txn_id as string, "link", `Unlinked from claim "${String(claim.description)}"`, [{ field: "claimedMinor", from: e.amount_minor, to: 0 }])); }
  if (!changedAny) return r;
  stmts.push(auditStmt(ctx, "finance.reimbursement.link", "reimbursement", claimId));
  await write(ctx.db, stmts);
  return ok({ ...r.data, outcome: r.data.outcome === "unchanged" ? ("updated" as const) : r.data.outcome });
});
async function readLinks(ctx: Ctx, raw: unknown): Promise<Array<{ txnId: string; amountMinor: number; expenseMinor: number; label: string }>> {
  if (!Array.isArray(raw) || raw.length > 50) throw new v.InvalidInput("expenses must be a list of { txn, amount }");
  const out = new Map<string, { txnId: string; amountMinor: number; expenseMinor: number; label: string }>();
  for (const e of raw) {
    const o = v.obj(e, "expense"); const t = await findTxn(ctx, { id: o.txn ?? o.id ?? o.transaction, key: o.key });
    if (!t) throw new v.InvalidInput("a linked expense does not exist");
    if (t.kind !== "expense" || t.voided_at || t.reversed_by || t.reversal_of) throw new v.InvalidInput("only a live expense can be linked to a claim");
    const exp = Math.abs(t.amount_minor as number); const amt = money(o, "amount") ?? exp; if (amt <= 0 || amt > exp) throw new v.InvalidInput(`the claimed part of "${String(t.payee ?? t.id)}" must be between 0.01 and what it cost`);
    out.set(t.id as string, { txnId: t.id as string, amountMinor: amt, expenseMinor: exp, label: String(t.payee ?? t.id) });
  }
  return [...out.values()];
}

// ---------- paying a bill ----------
/**
 * Confirms a bill payment: one payment record per due date and (when the amount is known) one transaction, in one batch. Confirming twice changes nothing.
 * A fixed bill uses its amount; a bill with an estimated amount needs the amount actually paid (it is never guessed). A linked open task is completed.
 * A payment on a loan may give `principal` and `interest` (they must add up to it). `skip: true` records that this occurrence will not be paid.
 * A payment that was reversed can be confirmed again: the same record is used, with a new transaction.
 */
export const payBill = (ctx: Ctx, raw: unknown): Promise<Result<{ paymentId: string; status: string; transactionId: string | null; taskCompleted: boolean }>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw, "input"); const today = await resolveToday(ctx, i, v);
  const billId = await resolveRef(ctx, "bill", i.billId ?? i.bill, "bill"); const dueDate = v.date(i.dueDate, "dueDate", false)!;
  const bill = (await ctx.db.prepare("SELECT * FROM fin_bills WHERE id = ?").bind(billId).first<Row>())!;
  const existing = await ctx.db.prepare("SELECT * FROM fin_bill_payments WHERE bill_id = ? AND due_date = ?").bind(billId, dueDate).first<Row>();
  if (existing && !existing.reversed_at) return ok({ paymentId: existing.id as string, status: existing.status as string, transactionId: (existing.txn_id as string | null) ?? null, taskCompleted: false }, { duplicate: true });
  const skip = v.bool(i.skip, "skip") === true; const at = ctx.now().toISOString(); const paymentId = (existing?.id as string | undefined) ?? rowId("fbp"); const paidOn = v.date(i.paidOn, "paidOn") ?? today;
  const stmts: D1PreparedStatement[] = []; let txnId: string | null = null; let amount: Minor | null = null;
  if (!skip) {
    const given = money(i, "amount"); amount = given ?? (bill.amount_kind === "fixed" ? (bill.amount_minor as number | null) : null);
    if (amount === null || amount === undefined) { if (bill.account_id || i.account) throw new v.InvalidInput("this bill's amount is not fixed: enter the amount actually paid"); amount = null; }
    const accountId = i.account !== undefined || i.accountId !== undefined ? await resolveRef(ctx, "account", i.accountId ?? i.account, "account") : (bill.account_id as string | null);
    if (amount !== null && accountId) {
      txnId = rowId("ftx"); const src = sourceOf(ctx);
      const { results: accs } = await ctx.db.prepare("SELECT id, type FROM fin_accounts").all<{ id: string; type: AccountType }>(); const types = new Map(accs.map((a) => [a.id, a.type]));
      const counter = (bill.counter_account_id as string | null) ?? null; const signed = -Math.abs(amount); const kind = deriveTxnKind({ amountMinor: signed, counterAccountId: counter }, types);
      const g = readSplit(i); let split: { principalMinor: number; interestMinor: number } | null = null;
      if (g) { if (kind !== "loan_payment") throw new v.InvalidInput("principal and interest apply only to a payment on a loan"); try { split = resolveSplit(signed, g.principal, g.interest); } catch (e) { if (e instanceof RangeError) throw new v.InvalidInput(e.message); throw e; } }
      // a re-payment after a reversal gets its own key (the first transaction keeps its key, voided or reversed)
      const prior = (await ctx.db.prepare("SELECT COUNT(*) AS n FROM fin_transactions WHERE bill_id = ? AND bill_due = ?").bind(billId, dueDate).first<{ n: number }>())!.n;
      stmts.push(ctx.db.prepare("INSERT INTO fin_transactions (id,account_id,counter_account_id,date,amount_minor,kind,payee,category_id,status,bill_id,bill_due,principal_minor,interest_minor,source_kind,source_name,source_assistant,external_id,demo,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(txnId, accountId, counter, paidOn, signed, kind, bill.name, bill.category_id ?? null, billId, dueDate, split?.principalMinor ?? null, split?.interestMinor ?? null, src.kind, src.name, src.assistant, `bill:${billId}:${dueDate}${prior ? `:${prior + 1}` : ""}`, bill.demo ?? 0, at, at, ctx.actor.label, ctx.actor.label), auditStmt(ctx, "finance.transaction.create", "transaction", txnId));
    }
  }
  if (existing) stmts.push(ctx.db.prepare("UPDATE fin_bill_payments SET status = ?, paid_on = ?, amount_minor = ?, txn_id = ?, reversed_at = NULL, reversed_by = NULL, reverse_reason = NULL, completed_task_id = NULL WHERE id = ?").bind(skip ? "skipped" : "paid", skip ? null : paidOn, skip ? null : amount, txnId, paymentId), auditStmt(ctx, skip ? "finance.bill.skip" : "finance.bill.pay", "bill", billId));
  else stmts.push(ctx.db.prepare("INSERT INTO fin_bill_payments (id,bill_id,due_date,status,paid_on,amount_minor,txn_id,demo,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(paymentId, billId, dueDate, skip ? "skipped" : "paid", skip ? null : paidOn, skip ? null : amount, txnId, bill.demo ?? 0, at, ctx.actor.label), auditStmt(ctx, skip ? "finance.bill.skip" : "finance.bill.pay", "bill", billId));
  await write(ctx.db, stmts);
  // Keep the financial task in step: the open task about this bill occurrence is completed too (and remembered, so reversing the payment can reopen exactly it).
  let taskCompleted = false;
  const t = await ctx.db.prepare("SELECT id FROM tasks WHERE record_ref = ? AND due_date = ? AND status != 'completed' AND archived_at IS NULL LIMIT 1").bind(`bill:${billId}`, dueDate).first<{ id: string }>();
  if (t && !skip) { const r = await completeTask(ctx, { id: t.id, today }); taskCompleted = r.ok; if (r.ok) await write(ctx.db, [ctx.db.prepare("UPDATE fin_bill_payments SET completed_task_id = ? WHERE id = ?").bind(t.id, paymentId)]); }
  return ok({ paymentId, status: skip ? "skipped" : "paid", transactionId: txnId, taskCompleted });
});

// ---------- reading ----------
/** Everything the Finance screens and assistants need in one read: accounts, balances, categories, bills, payments, budgets, income plans, reimbursements and a window of transactions. */
export const getFinance = (ctx: Ctx, raw: unknown): Promise<Result<Record<string, unknown>>> => guard(async () => {
  assertModule(ctx.actor, MODULE);
  const i = v.obj(raw ?? {}, "input"); const today = await resolveToday(ctx, i, v);
  const from = v.date(i.from, "from") ?? `${(() => { const [y, m] = today.slice(0, 7).split("-").map(Number); const t = y * 12 + (m - 1) - 12; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; })()}-01`;
  const q = async (sql: string, ...a: unknown[]) => (await ctx.db.prepare(sql).bind(...a).all<Row>()).results.map(view);
  const [accounts, balances, categories, transactions, bills, payments, budgets, incomePlans, reimbursements, links, reimbursementLinks, history] = await Promise.all([
    q("SELECT * FROM fin_accounts ORDER BY archived_at IS NOT NULL, sort_order, name"), q("SELECT * FROM fin_balances ORDER BY as_of"), q("SELECT * FROM fin_categories WHERE archived_at IS NULL ORDER BY kind DESC, sort_order, name"),
    q("SELECT * FROM fin_transactions WHERE date >= ? ORDER BY date DESC, created_at DESC LIMIT 3000", from), q("SELECT * FROM fin_bills ORDER BY name"), q("SELECT * FROM fin_bill_payments WHERE due_date >= ?", from),
    q("SELECT * FROM fin_budgets"), q("SELECT * FROM fin_income_plans ORDER BY name"), q("SELECT * FROM fin_reimbursements ORDER BY COALESCE(claimed_on, created_at) DESC"),
    q("SELECT substr(record_ref, 6) AS billId, due_date AS dueDate, status FROM tasks WHERE record_ref LIKE 'bill:%' AND due_date IS NOT NULL AND archived_at IS NULL"),
    q("SELECT reimbursement_id AS reimbursementId, txn_id AS txnId, amount_minor AS amountMinor FROM fin_reimbursement_links"),
    q("SELECT h.txn_id AS txnId, h.at, h.action, h.actor_label AS actorLabel, h.channel, h.reason, h.changed FROM fin_txn_history h JOIN fin_transactions t ON t.id = h.txn_id WHERE t.date >= ? ORDER BY h.at DESC, h.id DESC LIMIT 600", from),
  ]);
  const rec = reimbursementRecon(reimbursements as unknown as FinReimb[], reimbursementLinks as unknown as FinReimbLink[], transactions as unknown as FinTxn[]);
  const reconciliation = { claims: [...rec.claims.values()], expenses: [...rec.expenses.values()], unclaimedExpenses: rec.unclaimedExpenses };
  return ok({ today, currency: "CAD", accounts, balances, categories, transactions, bills, payments, budgets, incomePlans, reimbursements, taskLinks: links, reimbursementLinks, history: history.map((h) => ({ ...h, changed: typeof h.changed === "string" ? JSON.parse(h.changed) : h.changed })), reconciliation });
});
