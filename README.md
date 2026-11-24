# Axis

A private personal operating system organised around five assistants (Daily, Health, Financial, Framework, Progressive): one task list with computed time horizons, goals, habits, calendar, per-module briefings, and a controlled write path for ChatGPT projects. Installable app (iPhone, iPad, desktop). Built on Cloudflare Workers + D1, React + TypeScript + Tailwind. Single user, Cloudflare Access protected. ChatGPT and other automations use the same service layer through REST and MCP.

> Public repository by design (free Actions, personal project): no secret is stored here and no control relies on the source being private. See docs/SECURITY.md.
>
> Status: Phases 1-2 complete; code on GitHub (`main`, `staging`). Staging D1 exists; the Worker is not deployed yet (docs/STAGING_DEPLOYMENT.md). All finance, health and calendar data on screen is synthetic.

## Develop
```bash
npm install
npm run dev                 # UI only (Vite). Shows 'no API'; run the Worker for live data.
cp .dev.vars.example .dev.vars
npm run build && npm run db:migrate:local && npm run dev:worker   # full app on http://localhost:8787 (local D1)
npm test                    # unit + integration + security + acceptance tests
npm run typecheck
npm run ui:check            # responsive layout check (needs Playwright and a local Worker with synthetic data)
```
Local sign-in is a loopback-only development identity; deployed environments require Cloudflare Access.

## Demonstration data
Axis starts empty. Settings > Demonstration data loads a small, labelled synthetic set (every title ends "(synthetic)") and removes it again. Operator scripts that write to D1 directly must go through the service layer or open the write gate; see migrations/README.md.

## Connect an assistant locally
With the dev Worker running, create an integration as the owner:
`curl -X POST localhost:8787/api/v1/integrations -H 'Content-Type: application/json' -d '{"name":"Personal assistant","kind":"chatgpt","scopes":["tasks:read","tasks:write"]}'`
The response contains a one-time `axk_…` token. Use it as `Authorization: Bearer …` on `/api/v1/*` or `/mcp`. ChatGPT itself needs OAuth, which is the next integration phase (docs/CHATGPT_INTEGRATION.md).

## Staging
`wrangler.jsonc` defines `staging` (axis-staging.frameworktools.ca) and `production` (axis.frameworktools.ca) with placeholder IDs, so deploys fail until real IDs are supplied after approval. Steps are in docs/SECURITY.md ("Required before any real data").

## Docs
docs/ARCHITECTURE.md · PRODUCTION_DEPLOYMENT.md · ASSISTANT_INTEGRATION.md · PRODUCT_REQUIREMENTS.md · ROADMAP.md · DESIGN_SYSTEM.md · SECURITY.md · CHATGPT_INTEGRATION.md · CHANGELOG.md · migrations/README.md

Screenshots (synthetic data): docs/screenshots/ (light and dark, desktop, iPad landscape and portrait, iPhone). Design: docs/DESIGN_SYSTEM.md.

`scripts/make-icons.mjs` regenerates the PNG icons (needs Playwright).
