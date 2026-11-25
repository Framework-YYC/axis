# Migrations

Version-controlled D1 migrations (`NNNN_name.sql`, applied in order by `wrangler d1 migrations apply`).

Rules
- One-way and **additive by default** (new tables, indexes, nullable columns, seed inserts).
- Anything that drops, deletes, rewrites or renames data needs the owner's explicit approval first.
- Money is `INTEGER` minor units; dates are ISO-8601 text; no personal or health values in seed data.
- `tests/migrations.test.ts` applies every file to an in-memory SQLite and checks ordering and the destructive-statement rule.
- Staging and Production use separate databases; Production migrations run only with explicit authorization.
- From 0004 every core table is write-guarded by triggers (`write_gate`). Seed or repair data through the service layer; a direct SQL write aborts. A new core table needs its guard triggers (a test enumerates the tables). Operator scripts that must write directly wrap the statements between gate-open and gate-close in one batch.
- 0005 adds task types, topic and delivery columns (nullable, additive). The `assistant_inbox` guard trigger from 0004 allows a fixed set of request names; new assistant behaviour rides on existing names (`task.create` with a `key`) so no DROP/CREATE of that trigger was needed. A first-class request name would need a trigger replacement, which needs the owner's approval.

- 0006 adds `progress_tracks`, `deliverables`, `deliverable_parts`, `procurement_items` (each with its write-guard triggers) and the nullable column `tasks.track_part`. Additive only; no existing row is rewritten.

- 0007 adds the Finance tables (`fin_categories` with default categories, `fin_accounts`, `fin_balances`, `fin_transactions`, `fin_bills`, `fin_bill_payments`, `fin_budgets`, `fin_income_plans`, `fin_reimbursements`), each with its write-guard triggers, and the nullable column `tasks.record_ref`. Additive only; no existing row is rewritten.
- 0008 (finance corrections) adds nullable columns for voiding and reversing transactions (`voided_at`, `voided_by`, `void_reason`, `reversal_of`, `reversed_by`) and for splitting loan payments (`principal_minor`, `interest_minor`) on `fin_transactions`, reversal and task-link columns on `fin_bill_payments` (`reversed_at`, `reversed_by`, `reverse_reason`, `completed_task_id`), and two tables: `fin_reimbursement_links` (which expense a claim recovers, and how much) and the append-only `fin_txn_history` (before/after of every edit, void and reversal). Write-guard triggers on both; `fin_txn_history` also refuses updates. Additive only; no existing row is rewritten, and rows recorded before it simply read as not voided, not reversed and not split.
