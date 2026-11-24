# Security

## Controls in place (Phase 2)
- **Authentication first, for everything.** Worker validates the Cloudflare Access JWT (RS256, issuer, audience, expiry, owner email) before serving any file or API. Missing/placeholder configuration fails closed (500). `workers_dev` and preview URLs are disabled; the custom domain behind Access is the only entry. Tests: wrong audience/issuer/expiry/key/identity, missing token, bypass attempts.
- **Dev bypass** exists only when `ENVIRONMENT=development` **and** the host is loopback. Deployed environments set their own value; a test pins that a deployed environment never honours it.
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

## Required before any real data (owner decisions)
1. Cloudflare Access application for each hostname, policy = owner's identity only, with **bypass** policies only for `/mcp`, `/api/v1/*`, `/oauth/token`, `/oauth/register`, `/.well-known/*` (Worker enforces those).
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
