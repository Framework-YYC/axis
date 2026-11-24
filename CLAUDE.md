# Axis: working rules for Claude Code

Private personal operating system. Separate from Framework's website, Nexus and client infrastructure. Never touch those resources.

## Safety rules
- **Staging only.** Nothing is deployed to Production without the owner's explicit approval for that release. Never provision Cloudflare resources (Workers, D1, R2, Access, DNS) without approval.
- **No real data.** Synthetic data only in development. No banking credentials, no confidential employer information, no secrets in the repo, logs or bundle.
- **Migrations**: additive only by default (tests enforce it); anything destructive needs approval; Production only with authorization.
- **Security is not optional.** Keep authentication first in `worker/index.ts`, keep CSP strict, keep integrations scoped and revocable, keep bulk/destructive operations behind owner approval, treat assistant and imported text as untrusted.
- **No paid or extra services** without approval.

## Public repository (intentional decision, 2026-11-24)
`Framework-YYC/axis` (transferred from `frameworkyyc/axis`, 2026-11-24) is **public on purpose** (free GitHub Actions; personal, non-commercial project). Security never depends on the source being secret.
- Never commit credentials, tokens, keys, `.env`/`.dev.vars`, personal information, database exports/backups or real user data. Only `.dev.vars.example` with `example.invalid` values. Synthetic data only, in code, tests, fixtures and screenshots.
- Secrets live in Cloudflare Secrets (runtime) or GitHub Actions secrets (deploy credentials: organization-level `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, which must be limited to this repository; see docs/SECURITY.md). Identifiers (database id, hostnames) are not secrets; the owner's email, Access audience tag values for production, tokens and account credentials are handled as in docs/SECURITY.md.
- Workflows: never `pull_request_target`; deploy workflows run only on `staging` (or manual on `staging`) in the `staging` environment; no secrets in PR-triggered jobs; pin actions to commit SHAs.
- Every endpoint and page stays behind authentication; assume an attacker has read all source and the API schema.
- Before every push: `git diff --cached` review for secrets/personal data. Never paste tokens into commands that get logged.

## Architecture rules
- Every capability is an entry in `worker/services/operations.ts`. REST and MCP are adapters only; the UI uses REST. Do not put business logic in routes or components.
- Direct SQL writes to core tables are blocked by write-guard triggers; operator scripts must go through the service layer (or open `write_gate` inside the same batch). Assistants write only via `assistant_inbox` (docs/ASSISTANT_INTEGRATION.md). Module separation is enforced in the services: keep it when adding operations.
- Money is integer minor units. Transfers are one record with a counter-account.
- Mutations write their audit row and history row in the same batch.
- Reuse `src/components/ui.tsx`, `charts.tsx` and the tokens in `src/styles/index.css` before adding markup or styles; follow docs/DESIGN_SYSTEM.md (silver canvas, raised/inset layers, black pills, lime only as a restrained accent, Outfit + mono). No inline scripts, no `data:` fonts, no third-party font or asset hosts (strict CSP).

## Workflow
`npm test` and `npm run typecheck` before every commit. Work on `staging`; `main` only by approved release. Update README, CHANGELOG and the relevant `docs/` page with each change.

## Map
`docs/ARCHITECTURE.md`, `docs/ASSISTANT_INTEGRATION.md`, `docs/SECURITY.md`, `docs/CHATGPT_INTEGRATION.md`, `docs/DESIGN_SYSTEM.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ROADMAP.md`, `migrations/README.md`.
