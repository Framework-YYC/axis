# Production deployment runbook

Target: `https://axis.frameworktools.ca`, Worker `axis-production`, D1 `axis-production`. Separate from staging in every resource. Authorized by the owner on 2026-11-24 for the release recorded in CHANGELOG.md.

## Resources (all separate from staging)
| Item | Production | Staging |
|---|---|---|
| Worker | `axis-production` | `axis-staging` |
| D1 database | `axis-production` (`e4941aa5-…`) | `axis-staging` (`600a5970-…`) |
| Host | `axis.frameworktools.ca` (custom domain) | `axis-staging.frameworktools.ca` |
| Cloudflare Access | "Axis (owner only)" whole host, one Allow policy for the owner; bypass app for `/api/v1` and `/mcp` only (the Worker authenticates those) | equivalent, own apps |
| Secrets | `OWNER_EMAIL` Worker secret (set with `wrangler secret put OWNER_EMAIL --env production`) | own |
| Cron Trigger | 1 (every minute): applies the assistant inbox, refreshes briefings | **none** (applies the inbox when the owner opens the app) |
| Assistant SQL inbox | open (write-guarded, service-validated, audited; records labelled unverified) | open |
| Demonstration data | **disabled** (API refuses, UI hides it) | available |

No data is copied between the two databases. Production starts empty.

## Cron trigger capacity
The account allows five Cron Triggers; other Workers use four. The fifth moved from staging to production (staging's `triggers.crons` is empty). Staging applies the inbox and refreshes stale briefings when the owner opens or polls the app. No other Worker was touched.

A newly registered Cron Trigger can take several minutes to fire for the first time (observed: about six). After a first deploy, wait for the first `cron` invocation before testing the inbox.

## Release procedure (repeatable)
1. The commit is on `staging`, CI and *Deploy staging* are green, and the owner has approved the release.
2. Fast-forward `main` to that commit (`main` only moves by approved release).
3. Actions > *Deploy production* > Run workflow on `main`, type `deploy production`. The job: re-runs typecheck and tests, applies additive migrations to the production database, builds and deploys the Worker with assets, and smoke-tests that `/`, `/api/v1/*`, `/mcp` and assets are not readable without authentication.
4. Recommended (owner, in GitHub): Settings > Environments > production: required reviewer = owner; deployment branches = `main`.
5. Verify (below), then merge `main` back into `staging` only if it moved ahead.

## Verification checklist
- Unauthenticated `/`, `/api/v1/health`, `/mcp` are not 200 (Access redirect or 401).
- Owner signs in with the one-time PIN and sees the empty app (no "synthetic" records anywhere).
- Create, update, complete, duplicate-prevention, module isolation and audit are exercised with a scoped test token, then the token is revoked (see CHANGELOG for the recorded run).
- `SELECT COUNT(*) FROM tasks WHERE demo = 1` = 0 and `assistant_inbox` insert is refused.

## Rollback
`wrangler rollback --env production`, or run the workflow on an earlier `main` commit. Database: D1 Time Travel (`wrangler d1 time-travel info axis-production`); restores need the owner's approval.

## Owner steps not automatable from the build session
GitHub environment `production` protections (reviewer, branch restriction), rulesets, secret-scanning toggles; any change to the ChatGPT account or plan.
