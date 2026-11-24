# Security

## Public repository decision
The repository is public **intentionally** (free GitHub Actions; personal, non-commercial). Consequences and rules:
- **No security by obscurity.** All of the source, the API shape, the MCP tool list and the Access/Worker design are public. Protection rests on Cloudflare Access, Worker-side token validation, scoped revocable integration tokens, approvals and the audit trail, not on hidden code.
- **Never in the repository or its history:** credentials, tokens, private keys, `.env` / `.dev.vars`, the owner's email or any personal information, database exports or backups, real financial/health/work data. Tests, fixtures and screenshots are synthetic (`example.invalid`, "synthetic" labels). A full-history scan was clean before the first push (2026-11-24).
- **Where secrets live:** runtime secrets (`OWNER_EMAIL`, later OAuth signing keys) in Cloudflare Worker Secrets; deploy credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) only in the GitHub environment `staging`, restricted to the `staging` branch. Identifiers such as the D1 database id and hostnames are not secrets.
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

## Staging provisioning status (2026-11-24)
Done: dedicated D1 `axis-staging` (additive migrations applied), Worker `axis-staging` on `axis-staging.frameworktools.ca`, Access application (owner-only) plus a path-only bypass for `/api/v1` and `/mcp`, `OWNER_EMAIL` secret. The deployed version is interim (no UI assets) and fails closed. Pending: static assets via the GitHub Action (the build session's proxy-held credential cannot upload them). See docs/STAGING_DEPLOYMENT.md.

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
