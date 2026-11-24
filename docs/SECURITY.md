# Security

## Public repository decision
The repository is public **intentionally** (free GitHub Actions; personal, non-commercial). Consequences and rules:
- **No security by obscurity.** All of the source, the API shape, the MCP tool list and the Access/Worker design are public. Protection rests on Cloudflare Access, Worker-side token validation, scoped revocable integration tokens, approvals and the audit trail, not on hidden code.
- **Never in the repository or its history:** credentials, tokens, private keys, `.env` / `.dev.vars`, the owner's email or any personal information, database exports or backups, real financial/health/work data. Tests, fixtures and screenshots are synthetic (`example.invalid`, "synthetic" labels). A full-history scan was clean before the first push (2026-11-24).
- **Where secrets live:** runtime secrets (`OWNER_EMAIL`, later OAuth signing keys) in Cloudflare Worker Secrets; deploy credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) as GitHub Actions secrets at the organization `Framework-YYC`. Organization secrets are readable by workflows on **any branch** of the repositories they are shared with, so: (1) share them only with `axis` ("Selected repositories"), never "All repositories"; (2) protect `staging` and `main` with a ruleset (PR + required check, no force-push) and avoid pushing untrusted workflow edits to other branches; (3) preferably move both into the `staging` environment, restricted to the `staging` branch, which is the stronger control and needs no code change (the deploy job already uses `environment: staging`). Forks and pull requests from outsiders never receive them. Identifiers such as the D1 database id and hostnames are not secrets.
- **Workflows:** `ci.yml` has no secrets and a read-only token and runs on pull requests (including forks) via `pull_request`; `deploy-staging.yml` runs only on pushes to `staging` or manual runs on `staging`, only for this repository, only in the `staging` environment; `pull_request_target` is never used; actions are pinned to commit SHAs; `npm ci --ignore-scripts`; Production has no workflow and needs explicit approval.
- **Free GitHub protections to keep on** (owner to verify in Settings > Code security; they are not settable from the build session): secret scanning with push protection (default for public repos), Dependabot alerts and security updates, private vulnerability reporting. `dependabot.yml` (weekly npm and Actions updates) and `npm audit --omit=dev --audit-level=high` in CI are in the repository. Recommended: a branch ruleset on `staging` and `main` requiring the `Tests` check and blocking force-pushes, and "Require approval for all outside collaborators" for Actions runs.
- **Forks and pull requests** from outsiders can never reach a credential: they run only `ci.yml`.

## Controls in place (Phase 2)
- **Authentication first, for everything.** Worker validates the Cloudflare Access JWT (RS256, issuer, audience, expiry, owner email) before serving any file or API. Missing/placeholder configuration fails closed (500). `workers_dev` and preview URLs are disabled; the custom domain behind Access is the only entry. Tests: wrong audience/issuer/expiry/key/identity, missing token, bypass attempts.
- **Dev bypass** exists only when `ENVIRONMENT=development` **and** the host is loopback. Deployed environments set their own value; a test pins that a deployed environment never honours it.
- **Bypassed paths.** Access is deliberately bypassed only for `/api/v1` and `/mcp`. There the Worker accepts either a bearer token or the owner's `CF_Authorization` cookie JWT, verified exactly like the Access header (signature, issuer, audience, expiry, owner email); browser writes remain same-origin JSON only.
- **Integrations**: scoped (read and write separate per module), revocable immediately, token shown once and stored as SHA-256 only, 90-day default expiry, accepted only on `/api/v1/*` and `/mcp`. An `Authorization` header elsewhere is ignored.
- **Owner-only**: managing integrations and approvals. Assistants cannot, and these are never offered over MCP.
- **Approval for bulk/destructive**: more than 10 tasks in one call, and any archive from an assistant, create a pending approval executed only after the owner approves in the app.
- **No direct database access** for assistants; they only call operations.
- **Input**: strict validators, length limits, control characters removed, parameterised SQL only, LIKE wildcards escaped, request body cap.
- **CSRF**: browser writes must be same-origin JSON; cross-origin or form posts are refused.
- **Headers**: strict CSP (no inline scripts, no third parties, `frame-ancestors 'none'`), HSTS, nosniff, no referrer, locked-down permissions policy. API responses `Cache-Control: no-store`; assets `private`.
- **Audit**: every change, denial, approval and assistant read, with actor, channel and request id; no record content. Task history keeps field names only.
- **Logging**: structured, no tokens, emails, bodies or record content.
- **No secrets in the repo or the bundle.** `OWNER_EMAIL` is a Worker secret; `.dev.vars` is git-ignored.
- **Untrusted content**: assistant and imported text is stored and rendered as inert text.
- Synthetic data only. No confidential employer information. No banking credentials are ever stored.

## Assistant-centred model (2026-11-24)
- **Write guard.** Every core table has `BEFORE INSERT/UPDATE/DELETE` triggers that abort while `write_gate` is closed; the service layer opens it only inside its own D1 batch. Direct SQL from any connection (including ChatGPT's Cloudflare connector) is refused for Axis data. This is a **tripwire, not a hard barrier**: the gate row must be writable by the service, so a caller with full SQL that deliberately opens it is not stopped.
- **Inbox.** The only table an SQL-only assistant may write is `assistant_inbox` (validated by trigger: known op, valid JSON under 20 000 characters, `pending` only, at most 200 waiting). Axis applies each row through the same service layer, with a module-confined identity, validation, idempotency (`inbox:<id>`), approvals and audit (`via = inbox`). Results are written back to the row.
- **Module separation** is enforced in the services: a request for module X can only create records in X and can only update records in X (also after an approval is granted). The Daily overview briefing exposes counts and next due dates for other modules, never titles.
- **Self-declared identity over SQL.** The connector carries no per-project identity, so `assistant_inbox.assistant` is a claim. Per-assistant credentials (REST/MCP tokens limited to modules) are the fix and remain available.
- **The Cloudflare connection is account-wide.** It can reach every D1 database in the Framework account, including databases that are not Axis. Axis cannot restrict that from inside Axis. Owner decision needed: scope the connection to the Axis staging database, or move Axis to its own account, before real data. Until then Axis holds synthetic data only.
- **Demo data** is flagged (`demo = 1`), titled "(synthetic)", labelled in the UI, and removable by the owner in one action. Axis starts empty.
- Untrusted input: task text, notes, `sourceRef` and email-derived text are stored and rendered as inert text.

## Production (2026-11-24)
- Separate Worker, D1 database, hostname and Access applications from staging; production starts empty and receives no staging data.
- **Assistant integration in production: the inbox (primary) and REST/MCP with scoped tokens (kept for later).** The owner creates one connection per assistant in Settings: limited to one module, read-only or read/write, expiring (default 30 days), revocable at once, stored as a hash. The assistant's identity and module come from the token, never from its own claims. Verified by tests and by a live run (see CHANGELOG).
- **Update 2026-11-24 (owner decision):** the SQL-fed `assistant_inbox` is **restored** in production, because the connector can run unrestricted SQL regardless and closing the inbox only removed the sanctioned path. Kept: write-guard triggers, service-layer validation, duplicate prevention, approvals, module separation, audit. Added: records filed through the inbox are labelled UNVERIFIED SOURCE (the module claim is self-declared). Production runs the account's one remaining Cron Trigger (every minute); staging has none and applies its inbox when the owner opens the app. Demonstration data stays refused in production. D1 Time Travel recovery was verified on staging (restore to a bookmark removed a marker row; data and triggers intact); production recovery points are available (`wrangler d1 time-travel info axis-production`), restores need the owner's approval.
- **Connector scope (investigated, unconfirmed):** the Cloudflare docs host is not reachable from the build session. Search summaries say Cloudflare API tokens support resource-level scoping "where available" and that the Cloudflare MCP OAuth consent lets you edit optional scopes, but nothing found says D1 can be limited to a single database or excludes one; D1 appears only as account-level read/write permissions. Treat the connector as account-wide until the owner confirms otherwise on the OAuth consent screen or token builder.
- **Remaining blocker (owner decision): ChatGPT's Cloudflare connector is account-wide and can run unrestricted SQL against `axis-production`.** The write-guard triggers stop accidents but not a deliberate full-SQL caller. Until the connector is scoped to exclude `axis-production` (or Axis moves to its own Cloudflare account), real data in production is exposed to any ChatGPT project that has that connector. The assistant prompts are shipped with sync OFF for this reason.
- **Remaining blocker: no verified ChatGPT transport for scoped-token writes.** Custom MCP write access on ChatGPT Plus is unsupported by anything found, and OAuth 2.1 (required by ChatGPT for custom MCP) is not built. See docs/CHATGPT_INTEGRATION.md.
- Not yet in place: rate limiting on the bypassed `/api/v1` and `/mcp` paths (a zone rule, owner decision) and GitHub `production` environment protections (owner, in GitHub).

- **Environment switcher (2026-11-24):** navigation only, built from a two-host allow-list (`shared/environments.ts`), no credentials, storage or data sent; the destination enforces its own Cloudflare Access sign-in, and the two environments share no database, token or session. The link uses `rel=noopener noreferrer` and the Worker already sends `Referrer-Policy: no-referrer`.

## Staging provisioning status (2026-11-24)
Done: dedicated D1 `axis-staging` (additive migrations applied), Worker `axis-staging` on `axis-staging.frameworktools.ca`, Access application (owner-only) plus a path-only bypass for `/api/v1` and `/mcp`, `OWNER_EMAIL` secret. The full build (with static assets) is deployed by the `Deploy staging` workflow, which passed its unauthenticated smoke test. See docs/STAGING_DEPLOYMENT.md.

## Required before any real data (owner decisions)
1. Cloudflare Access application for each hostname, policy = owner's identity only, with **bypass** only for `/mcp` and `/api/v1` now (`/oauth/token`, `/oauth/register`, `/.well-known/*` are added when OAuth exists); the Worker enforces those.
2. Set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (vars) and `OWNER_EMAIL` (secret) per environment.
3. Rate limiting rule on the bypassed paths.
4. Decide on a separate Cloudflare account (see ARCHITECTURE concerns).
5. OAuth for ChatGPT (not built).

## Backup, recovery, export, deletion (procedures; to be rehearsed on staging)
- **Backup**: D1 Time Travel gives point-in-time restore (record the bookmark before every migration: `wrangler d1 time-travel info axis-staging`). A scheduled export (`wrangler d1 export`) to R2 is planned.
- **Recovery**: `wrangler d1 time-travel restore <db> --bookmark=<id>`; destructive, owner approval each time. Production restore needs explicit authorization.
- **Export**: Settings → Data export (planned) returns all tables as JSON/CSV for the owner.
- **Deletion**: owner-initiated, per module and full, with confirmation; audit rows keep ids only.
- **Migrations**: additive by default; a test rejects DROP/DELETE/UPDATE/RENAME/PRAGMA/REPLACE. Production only with explicit authorization.

## Known gaps
OAuth; rate limiting; settings/export/deletion UIs; field-level encryption; approvals UI (API is live); alerting on repeated denials.
