# Changelog

## Unreleased
- **Production.** `axis.frameworktools.ca` on its own Worker (`axis-production`), D1 database and Access applications; empty, no demonstration data, no cron, SQL inbox closed. Manual "Deploy production" workflow (typed confirmation, `main` only, `production` environment). Settings > Connections creates per-assistant, per-module, expiring, revocable tokens. Docs: PRODUCTION_DEPLOYMENT.md, PRODUCTION_ASSISTANT_PROMPTS.md.
- **Assistant-centred architecture.** Five modules (Daily, Health, Financial, Framework, Progressive) each with overview, tasks, goals, habits, briefing, activity history and metrics. New navigation (Overview, Tasks, five modules, Calendar, Goals & Habits, Settings) and a command-centre Overview.
- One central task table: module, priority, status, due date and optional time, scheduled date, recurrence, source assistant and reference, goal, notes, history. Nine exclusive time horizons computed from the due date, today and the owner's time zone (never stored). Recurring tasks create the next occurrence once.
- Goals (numeric and qualitative, short/medium/long, milestones, progress history) and habits (quantities, streaks, work-rotation aware) with persistence; live calendar; settings for time zone, week start, units, currency, work rotation.
- Controlled assistant writes: write-guard triggers on every core table and an `assistant_inbox` that the service layer applies with module-confined identities, validation, idempotency, approvals and audit. Migrations 0003 (data model) and 0004 (write guard), both additive. Stored briefings per module. Cron Trigger every minute on staging.
- Demonstration data is now explicit: flagged, labelled "SYNTHETIC", loadable and removable in Settings; the client-side demo fallback is gone.
- Docs: docs/ASSISTANT_INTEGRATION.md (contract, five instruction blocks, acceptance test); SECURITY.md records the account-wide connector risk and the limits of the write gate.
- Final acceptance verification of the task round trip on staging (D1, REST, MCP, briefing, approvals, audit). ChatGPT compatibility re-assessed against current OpenAI documentation: Plus write access to custom MCP is unsupported by anything found; plan and next steps in docs/CHATGPT_INTEGRATION.md.
- Visual redesign to the new Axis direction: silver canvas, layered raised and inset surfaces, floating black rail with a contextual panel (iPad: chips; iPhone: floating dock), lime accent, black pill actions, Outfit + JetBrains Mono (self-hosted), dot-matrix / fine-line / bar charts, segmented tick indicators, asymmetric dashboard, dark theme in the same system. See docs/DESIGN_SYSTEM.md.
- The attention queue and Intelligence page now use the real approvals, integrations and audit APIs (approve, decline, revoke).
- Fixed: the sign-in footer always read "Design preview" because `/api/v1/me` did not use the standard `{success, data}` envelope (now it does). The UI no longer silently shows demo data on a deployed host when the API is unreachable.
- Build: assets are never inlined as `data:` URIs (the strict CSP blocks them).
- Dependencies: `@fontsource-variable/outfit`, `@fontsource-variable/jetbrains-mono` (OFL fonts served from our own origin).
- Staging deployed through GitHub Actions (tests, additive migration, Worker with static assets, smoke test) using organization-level secrets; repository moved to `Framework-YYC/axis`.
- Repository published (public, intentional). CI and staging-deploy workflows, Dependabot, public-repository rules in CLAUDE.md, SECURITY.md and ARCHITECTURE.md.
- Staging D1 `axis-staging` created and migrated; Worker `axis-staging` deployed (interim, no assets) on `axis-staging.frameworktools.ca`; Access applications and owner secret configured.
- Worker accepts the Access JWT from the `CF_Authorization` cookie on the bypassed `/api/v1` and `/mcp` paths (verified identically).

## 0.1.0 (Phases 1-2)
- Foundation: Cloudflare Worker + Static Assets, React/Vite/Tailwind app, D1 migrations, Vitest suite.
- Security: Access JWT validation in the Worker for every request, fail-closed config, dev bypass limited to loopback, strict CSP and cache policy.
- Shared service layer with one operation catalogue serving the web app, REST `/api/v1` and MCP `/mcp`.
- Scoped, revocable integration tokens; approvals for bulk/destructive requests; idempotency; audit trail; task history.
- Tasks module core (live) and the ChatGPT round-trip acceptance test.
- Application shell, design system, dashboard and preliminary layouts for all modules (synthetic data), PWA manifest/icons/service worker.
- Documentation set and ChatGPT compatibility investigation.
