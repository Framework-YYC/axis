# Staging deployment runbook

Target: `axis-staging.frameworktools.ca`, Worker `axis-staging`, D1 `axis-staging`. Never Production.

## Status (2026-11-24)
| Item | State |
|---|---|
| D1 `axis-staging` (id in `wrangler.jsonc`), migrations 0001-0002 | **done**, verified |
| Worker `axis-staging` + custom domain `axis-staging.frameworktools.ca` (proxied DNS) | **deployed, interim version without static assets** (fails closed; no UI yet) |
| Cloudflare Access: "Axis staging (owner only)" for the whole host, one Allow policy for the owner's email | **done** |
| Cloudflare Access: bypass application for `/api/v1` and `/mcp` only | **done** (the Worker authenticates these) |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (in `wrangler.jsonc`, not secrets); `OWNER_EMAIL` Worker secret | **done** (email stored only in Cloudflare) |
| Static assets (the UI) | **pending**: the build session's proxy-held credential cannot upload them; needs the GitHub Action below |
| GitHub environment `staging` with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | **owner, still to do** |

Verified live (unauthenticated): `/` and every page/asset redirect to the Access login; `/api/v1/*` and `/mcp` answer 401 without a valid token; a bogus bearer gets 401. Verified live with a short-lived synthetic staging token (revoked afterwards): MCP initialize and tools/list, create_task with idempotent retry, status read, briefing, audit trail, read-only scope refused, bulk request held for approval, revocation immediate.

## Owner steps to finish
1. **Deploy token** (Cloudflare > My Profile > API Tokens > Create): Account *Workers Scripts: Edit*, *D1: Edit*, *Account Settings: Read*; Zone `frameworktools.ca`: *Workers Routes: Edit*, *DNS: Edit*; limited to this account/zone, with an expiry. Workers Scripts is account-wide in Cloudflare, so the token could in principle touch other Workers; the workflow only deploys `--env staging`. A separate Cloudflare account would remove that risk.
2. **GitHub environment**: repo Settings > Environments > New `staging`; Deployment branches = selected branches = `staging`; secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. No repository-level secrets.
3. Re-run *Deploy staging* (Actions tab, branch `staging`). It tests, migrates, deploys the full build with assets, and smoke-tests that nothing answers 200 unauthenticated.
4. Open the hostname, sign in through Access (one-time PIN to the owner email), see the dashboard, and `/api/v1/health` reporting `environment: staging`.

## Rollback
`wrangler rollback --env staging`, or redeploy a previous commit by manual run. Database: D1 Time Travel (`wrangler d1 time-travel info axis-staging`); restores need the owner's approval.

## Not automated from the build session
Access application, GitHub environments and secrets, branch rulesets, secret-scanning/Dependabot toggles: no tool or credential here can set them.
