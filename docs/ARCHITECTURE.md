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
