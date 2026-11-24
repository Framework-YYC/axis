# Migrations

Version-controlled D1 migrations (`NNNN_name.sql`, applied in order by `wrangler d1 migrations apply`).

Rules
- One-way and **additive by default** (new tables, indexes, nullable columns, seed inserts).
- Anything that drops, deletes, rewrites or renames data needs the owner's explicit approval first.
- Money is `INTEGER` minor units; dates are ISO-8601 text; no personal or health values in seed data.
- `tests/migrations.test.ts` applies every file to an in-memory SQLite and checks ordering and the destructive-statement rule.
- Staging and Production use separate databases; Production migrations run only with explicit authorization.
