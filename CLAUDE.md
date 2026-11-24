# Axis: working rules for Claude Code

Private personal operating system. Separate from Framework's website, Nexus and client infrastructure. Never touch those resources.

## Safety rules
- **Staging only.** Nothing is deployed to Production without the owner's explicit approval for that release. Never provision Cloudflare resources (Workers, D1, R2, Access, DNS) without approval.
- **No real data.** Synthetic data only in development. No banking credentials, no confidential employer information, no secrets in the repo, logs or bundle.
- **Migrations**: additive only by default (tests enforce it); anything destructive needs approval; Production only with authorization.
- **Security is not optional.** Keep authentication first in `worker/index.ts`, keep CSP strict, keep integrations scoped and revocable, keep bulk/destructive operations behind owner approval, treat assistant and imported text as untrusted.
- **No paid or extra services** without approval.

## Architecture rules
- Every capability is an entry in `worker/services/operations.ts`. REST and MCP are adapters only; the UI uses REST. Do not put business logic in routes or components.
- Money is integer minor units. Transfers are one record with a counter-account.
- Mutations write their audit row and history row in the same batch.
- Reuse `src/components/ui.tsx` and the tokens in `src/styles/index.css` before adding markup or styles; no inline scripts.

## Workflow
`npm test` and `npm run typecheck` before every commit. Work on `staging`; `main` only by approved release. Update README, CHANGELOG and the relevant `docs/` page with each change.

## Map
`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/CHATGPT_INTEGRATION.md`, `docs/DESIGN_SYSTEM.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ROADMAP.md`, `migrations/README.md`.
