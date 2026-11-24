# Changelog

## Unreleased
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
