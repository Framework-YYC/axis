# Staging deployment runbook

Target: `axis-staging.frameworktools.ca`, Worker `axis-staging`, D1 `axis-staging`. Never Production.

## Status
| Item | State |
|---|---|
| D1 `axis-staging` (id in `wrangler.jsonc`), migrations 0001-0002 | **done**, verified |
| GitHub `staging` environment + secrets | owner |
| Cloudflare Access application for the hostname | owner (build credential lacks Access permission) |
| Worker secret `OWNER_EMAIL`, vars `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | owner / after Access exists |
| Worker + custom domain deploy | by `deploy-staging.yml` once the above exist |

## Owner steps (about 15 minutes)
1. **Deploy token** (Cloudflare > My Profile > API Tokens > Create). Permissions: Account: *Workers Scripts: Edit*, *D1: Edit*, *Account Settings: Read*; Zone `frameworktools.ca`: *Workers Routes: Edit*, *DNS: Edit*. Restrict to this account and zone, and set an expiry. Note: Workers Scripts is account-wide in Cloudflare, so this token could in principle touch other Workers; the workflow only deploys `--env staging`. A separate Cloudflare account would remove that risk.
2. **GitHub environment**: repo Settings > Environments > New `staging`; Deployment branches: *Selected branches* = `staging`; secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Do not add secrets at repository level.
3. **Cloudflare Access** (Zero Trust free plan; no paid service): create a Self-hosted application for `axis-staging.frameworktools.ca`, policy *Allow* = your email only (One-time PIN is fine). Then add a second application with **Bypass** (everyone) only for the paths `/api/v1` and `/mcp` (the Worker authenticates these itself with bearer tokens or the owner's `CF_Authorization` cookie, verified identically). `/oauth/*` and `/.well-known/*` are added only when OAuth is built (see CHATGPT_INTEGRATION.md). Never bypass `/` or anything else. Copy the application's **Audience (AUD) tag**.
4. **Config values**: put the AUD tag and team domain into `wrangler.jsonc` (`env.staging.vars.ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`; neither is a secret), commit to `staging`.
5. **Owner identity secret**: `npx wrangler secret put OWNER_EMAIL --env staging` (after the first deploy creates the Worker, or run once with the token) and enter your email. It is never committed.
6. Push to `staging` (or run *Deploy staging* manually on `staging`). The workflow tests, migrates, deploys and checks that nothing answers 200 without authentication.
7. Verify: open the hostname, sign in through Access, see the dashboard; `/api/v1/health` shows `environment: staging`, `database: true`.

## Rollback
`wrangler rollback --env staging`, or redeploy a previous commit by manual run. Database: D1 Time Travel (`wrangler d1 time-travel info axis-staging`); restores need the owner's approval.

## Not automated from the build session
Access application, GitHub environments and secrets, branch rulesets, secret-scanning/Dependabot toggles: no tool or credential here can set them.
