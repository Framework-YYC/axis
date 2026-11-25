# Architecture

## Decisions
| Area | Decision | Why |
|---|---|---|
| Hosting | One Cloudflare Worker with Static Assets, `run_worker_first: true` | Every request (files too) passes authentication; no unauthenticated path to the app. |
| Frontend | React 19, TypeScript, Vite, Tailwind v4, Lucide, Recharts, React Router; pages lazy-loaded | As specified. System font stack (SF on Apple), no third-party requests, strict CSP. |
| Backend | Plain TypeScript Worker, no framework | The surface is small; fewer dependencies to trust. Only `jose` (JWT) is used. |
| Database | D1 (SQLite). Separate `axis-staging` and `axis-production`. Migrations in `migrations/`. | As specified. Money is integer minor units. |
| Auth | Cloudflare Access for people; Worker re-validates the Access JWT (issuer, audience, signature, owner email). Scoped revocable bearer tokens for integrations on `/api/v1` and `/mcp` only. | Defence in depth; alternate hostnames cannot bypass. |
| Storage | R2 deferred until files are needed. | Not needed in Phase 2. |
| PWA | Manifest, icons, a service worker that caches only hashed `/assets/*` | Installable on iPhone/iPad; never caches API data or pages. |

## Request flow
```
browser ──Access──► Worker ─ authenticate(Access JWT) ─┐
ChatGPT/Shortcut ──► Worker ─ authenticate(bearer)  ───┤
                                                       ▼
                         /api/v1/*  or  /mcp   ──►  runOperation(ctx, name, input)
                                                       │ scope check · validation · idempotency · approvals · audit
                                                       ▼
                                                  services/* ──► D1
                         everything else ──► ASSETS (SPA)
```
`worker/services/operations.ts` is the single catalogue. REST (`routes/api.ts`) maps method+path to an operation; MCP (`routes/mcp.ts`) lists the operations the actor's scopes allow. No business logic lives in either adapter. `shared/` (money, ledger classification, rotation, units, import envelope) is used by both Worker and UI.

## Delivery and the public repository
Source is public by design; nothing in it is a secret and no control depends on its secrecy. Flow: pull request -> `ci.yml` (no secrets) -> merge to `staging` -> `deploy-staging.yml` (tests, additive D1 migration, `wrangler deploy --env staging`, unauthenticated smoke test) using the `staging` GitHub environment. Production is a manual, explicitly approved step and has no workflow. Runtime secrets are Cloudflare Worker Secrets. Staging resources: Worker `axis-staging`, D1 `axis-staging` (`600a5970-…`), host `axis-staging.frameworktools.ca`, two Access applications (owner-only for the host; bypass for `/api/v1` and `/mcp` only). Constraint found: the build session's proxy-held credential cannot upload Static Assets (it overwrites the upload session's Authorization header), so deployment is done by GitHub Actions (or Cloudflare Workers Builds) with owner-held credentials.

## Layout
`worker/` Worker (auth, http, routes, services) · `src/` app (components, pages, lib, data) · `shared/` pure logic · `migrations/` · `tests/` · `docs/`.

## Data model (so far)
`settings`, `categories` (7 seeded), `audit_log`, `integrations`, `api_tokens` (hash only), `pending_approvals`, `idempotency_keys`, `tasks`, `task_events`. Later modules add accounts/transactions/budgets, health logs, goals/habits, events, briefings and import batches, each as an additive migration.

## Finance correctness
A transfer is **one** record with a counter-account, never two legs. `deriveKind` classifies income, expense, transfer, card payment and loan payment; `cashFlow` counts income and spending only, so a card purchase and its later payment are counted once. Tests pin this.

## Health ingestion
A browser cannot read HealthKit. Planned path: an Apple Shortcut (or later a companion app) posts `axis.import.v1` envelopes with `type: health_metric` to `/api/v1/imports` using a write-scoped token limited to `health:write`; records are deduplicated by `externalId` or content hash and, for bulk batches, held for approval.

## Technical concerns
1. **Same Cloudflare account as Framework/Nexus/clients.** Axis resources are separate (own Worker, D1, hostnames) but the account, the zone `frameworktools.ca` and the proxy credential are shared. Full isolation would need a separate Cloudflare account. Recommended before real financial or health data goes in.
2. **Cloudflare Access vs ChatGPT.** See CHATGPT_INTEGRATION.md: the integration paths need an Access bypass and Worker-side OAuth.
3. **D1 is encrypted at rest by Cloudflare but not end-to-end encrypted.** Health and finance data is readable by anyone with account and database access. Acceptable only with tight account access; consider field-level encryption later.
4. **Tailwind/Recharts bundle.** Charts add about 100 KB gzipped on chart pages; they are lazy-loaded.
5. **Time zones.** Dates are calendar strings; "today" comes from the device (or an explicit `today` argument for assistants).
6. **Idempotency record is written after the change**, not in the same batch; a crash between the two could allow one duplicate on retry (externalId still prevents it).

## Assistant-centred architecture (2026-11-24)
Five modules (Daily, Health, Financial, Framework, Progressive), one database, one service layer. The module is a column on tasks, goals, habits, events and the briefing; separation is enforced by the services, not by separate stores.

- **Navigation:** Overview, Tasks, the five modules (`/m/<module>` with tabs Overview, Tasks, Goals, Habits, Briefing, Activity, Metrics), Calendar, Goals & Habits, Settings. Desktop: floating rail and contextual panel. iPad: rail plus chips. iPhone: floating dock (Overview, Tasks, Assistants, Calendar, More).
- **Tasks:** one table. Time horizons (Overdue, Today, Tomorrow, This week, This month, This quarter, This year, Future, Someday) are computed in `shared/horizons.ts` from the due date, today and the owner's time zone and week start; they are never stored and are mutually exclusive. Recurrence (`shared/recurrence.ts`) creates the next occurrence once, guarded by a unique index on (series, due date).
- **Goals** (`shared/goals.ts`): numeric or qualitative, term derived from the target date (short under 90 days, medium to one year, long beyond), milestones, progress history. **Habits** (`shared/habits.ts`): period targets, quantities, streaks, work-rotation modes (any, on, off, split).
- **Briefings** are computed by Axis for the owner's "today" and stored (`briefings`), so an SQL-only assistant reads the same briefing the app shows. Refreshed every minute and after each applied request.
- **Writes from SQL-only assistants:** `assistant_inbox` -> `worker/services/inbox.ts` -> `operations.ts`. See docs/ASSISTANT_INTEGRATION.md. The write gate is described in SECURITY.md.
- **Scheduled work:** one Cron Trigger (every minute, staging) runs `maintenance`: apply waiting inbox requests, refresh briefings. The owner opening Tasks also triggers it.

## Task types and the Work command centre (migration 0005)
`tasks` gains nullable `task_type`, `topic`, `related_date`, `related_time` and `supplier`; the effective type is derived (`shared/taskTypes.ts`), so no existing row is rewritten. Rotation-aware recurrence lives in `shared/recurrence.ts` (`rotation: "on"` in the rule) and is evaluated with the owner's `work_rotation` setting when an occurrence is completed. The Work module (`progressive`) leads with an operational command centre (`src/components/WorkViews.tsx`): live counts and rotation, today's responsibilities, email-derived action items, deliveries with their notification deadlines, upcoming recurring deadlines, manual tasks and events, plus dedicated Recurring (with per-series completion history) and Action items views. Every view reads the same shared task state as the rest of the app.

## Work: progress and procurement (migration 0006)
Four primary Work tabs: Overview (a graphical dashboard: daily completion gauge, rotation dial, REEF and RIPET rings, reporting segments, procurement pipeline, deadlines, delivery notifications), Tasks (recurring, action items and manual in one filtered view, grouped by due date or type), Progress (deliverable tracks, `worker/services/progress.ts`, `shared/progress.ts`) and Procurement (`worker/services/procurement.ts`, `shared/procurement.ts`). Progress is derived from tasks wherever a part is linked, so there is one source of truth.

## Finance (migration 0007)
Finance has four primary tabs (Overview, Transactions, Bills, Accounts) with Tasks, Goals, Budgets, Habits, Calendar and Reports under More. `get_finance` returns everything in one read and the app derives every figure with the shared, tested rules in `shared/finance.ts` (`src/lib/finance.ts`, `src/components/FinanceViews.tsx`, `FinanceEditors.tsx`), so the dashboard, the assistant and the tests agree. The Overview is graphical (income and spending capsule bars, bills-paid gauge, debt dot grid, cash flow, next payday and projected cash, upcoming bills, reimbursements, savings, net worth with history) with a month selector; estimates are labelled.

**Corrections (migration 0008).** A transaction is never deleted: `void_transaction` sets `voided_at` (excluded from every figure as though absent) and `reverse_transaction` adds one offsetting entry (`reversal_of`/`reversed_by`), and `shared/finance.ts` leaves both halves of a reversed pair out of income, spending and debt totals together (`countsInTotals`) while balances still see both, so they net to zero. Voiding or reversing a transaction that confirmed a bill payment also reverses the payment (`fin_bill_payments.reversed_at`; `billOccurrences` then treats the occurrence as unpaid) and reopens the task recorded in `completed_task_id`, unless the owner already reopened it; paying the same due date again reuses the payment row with a new transaction. A loan payment stores `principal_minor` and `interest_minor` (a split of the total): `txnDeltas` moves only the principal to the loan, `monthSummary` counts principal as `debtRepaid` and interest as spending (`interestPaid`, category Fees and interest), and `loanStats` reports principal repaid, interest paid and how many payments are not split. Reimbursements stay apart from income and spending: `fin_reimbursement_links` ties a claim to the expense(s) it recovers and `reimbursementRecon` reconciles deposits against claims and expenses (outstanding, partly received, received, over-received; unclaimed, claimed, partly received, reimbursed). Every edit, void, reversal and link writes a `fin_txn_history` row (what changed, who, why) and an audit row in the same batch as the change. The Transactions tab opens a detail sheet (edit, reverse, void, history) and Bills offers Reverse payment.


## Work time clock and rotation (2026-11-25)
- **Time clock** (`shared/timeclock.ts`, `worker/services/timeclock.ts`, `src/components/TimeClock.tsx`): punches are intervals in UTC (`time_entries`); the running entry has `end_at IS NULL` and the database allows only one. A punch (`timeclock_punch`: job, break, resume, end) closes the running entry and opens the next at the same instant in one batch, so entries never overlap or leave gaps. The client stamps the tap time and a `punchId`, so a failed save can be retried later without duplicating or losing the moment. Local-day totals use the owner's time zone (Intl), split entries at midnight and never deduct a break or end a shift automatically. Owner-only operations (scope `owner`, not offered over MCP, forbidden to assistants).
- **Rotation**: `DEFAULT_ROTATION` anchors on Thursday 2026-11-19 (14 on, 7 off). `resolveRotation` reads the migration-0001 seed value (2026-11-16) as the corrected default. `ensureRotationAligned` (maintenance tick, app open, and saving the setting) calls `realignRotationTasks` once per rotation setting: open, not-overdue occurrences of "on rotation" recurring rules are recomputed exactly as completing the previous occurrence would; completed history and other tasks are never touched. `upcomingTravel` marks travel dates after `ROTATION_CONFIRMED_THROUGH` as unconfirmed.
- **Shopping list**: see docs/DATUM_SHOPPING_ADDENDUM.md.
