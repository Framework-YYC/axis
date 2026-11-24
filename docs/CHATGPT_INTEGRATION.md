# ChatGPT integration (core requirement)

Axis is built so that ChatGPT can **read live data and create, update and manage records**, using the same business logic and database as the web app. This page records what is built, what the investigation found, and what is still unknown.

## What is built (Phase 2)

One service layer (`worker/services/`), one catalogue of operations (`operations.ts`), three front doors that all call it:

| Channel | Path | Auth | Status |
|---|---|---|---|
| Web app | `/` + `/api/v1/*` | Cloudflare Access (owner) | built |
| REST API | `/api/v1/*` | scoped bearer token (`axk_…`) | built |
| Remote MCP | `/mcp` (Streamable HTTP, stateless JSON) | scoped bearer token today; **OAuth 2.1 required for ChatGPT, not built yet** | built (tokens), OAuth planned |
| Apple Shortcuts / automation | `/api/v1/*` | scoped bearer token | built (tokens) |

MCP tools implemented: `get_daily_summary`, `list_tasks`, `get_task`, `get_overdue_tasks`, `get_completed_tasks`, `create_task`, `create_tasks`, `update_task`, `complete_task`, `reopen_task`, `archive_task`, `get_recent_activity`. Remaining tools (dashboard, finance, health, goals, briefings) are added module by module in the roadmap; each is one entry in `operations.ts`, which exposes it on REST and MCP at once.

Synchronisation guarantees (all covered by tests):
- unique ids (`tsk_<uuid>`), `created_at` / `updated_at`, a `version` for optimistic concurrency, `created_by` / `updated_by` and `source_name` (the originating assistant is taken from the authenticated token, never from request content);
- idempotency: `Idempotency-Key` header (same key + same request returns the stored result, different request is a 422), plus `externalId` per source, plus identical-open-task detection for assistants;
- completion history in `task_events`; every change and every assistant read in `audit_log` (no record content);
- explicit `{success, data|error}` responses and MCP `isError`;
- the web app polls on focus and every 15 s, so assistant changes appear without manual transfer;
- filters by status, priority, category, due range and text.

Acceptance test (`tests/integration.test.ts`, and a browser run against the real Worker at iPhone size): ChatGPT creates a task → it appears in the app → the owner completes it on iPhone → ChatGPT reads `completed` → the outstanding briefing excludes it → the audit trail and task history show every step with the true origin.

## Assessment of ChatGPT compatibility (updated 2026-11-24, supersedes the earlier investigation)

**Method and limits.** OpenAI's documentation cannot be opened directly from the build environment, so everything below comes from web-search summaries of OpenAI help-centre and developer pages plus OpenAI developer-community threads. Pages carry "updated N days ago" markers but the summaries are not the pages. **Nothing here has been tested against a real ChatGPT account, and simulated MCP tests (ours or anyone's) do not prove ChatGPT compatibility.** Confidence is stated per row.

### What OpenAI currently documents
| Topic | Finding | Source | Confidence |
|---|---|---|---|
| Naming | OpenAI now says **plugins** (formerly apps/connectors). A custom MCP server is added at *Plugins → + → Add custom MCP server*. Developer Mode is reported as no longer required, though some accounts still need it (community). | [Connecting custom MCP servers](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt), [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt), [community](https://community.openai.com/t/create-mcp-app-missing-from-plugins-menu-on-personal-chatgpt-accounts/1401436) | medium |
| **Plans for custom MCP** | The help article says **full MCP support (including write tools) is for Business and Enterprise/Edu on ChatGPT web**; **Pro can connect custom MCP servers with read/fetch permissions only**; **Plus is not mentioned**. Reports exist of Plus accounts with no Developer Mode and failing app creation. | [help article](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt), [Plus report](https://community.openai.com/t/developer-mode-missing-on-chatgpt-plus-account-and-mcp-app-creation-fails/1402294) | **Plus write access is NOT supported by anything found; assume unavailable until tested** |
| Write behaviour | Write tools require confirmation by default; tools without a read-only annotation are treated as writes. | [connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt) | medium |
| OAuth | OAuth 2.1 with PKCE (S256 advertised); protected-resource metadata at `/.well-known/oauth-protected-resource` or via `WWW-Authenticate` on 401; authorization-server metadata (RFC 8414/OIDC); client registration by **Client ID Metadata Documents (preferred), dynamic client registration, or a predefined client**; `resource` parameter bound to the MCP URL; every token validated for signature, issuer, audience, expiry and scope on every call; baseline MCP 2025-11-25 authorization. No API keys or machine-to-machine grants. | [Apps SDK authentication](https://developers.openai.com/plugins/build/auth) | high (official) |
| GPT Actions | **New GPT creation is not available on personal accounts including Plus**; custom GPTs are being retired in favour of plugins (dates reported between September and December 2026). Existing GPTs keep working. | [Creating and editing GPTs](https://help.openai.com/en/articles/20001049-apps-in-custom-gpts-beta) | medium. **Dead end for new work.** |
| ChatGPT Sites | Sites (OpenAI-hosted web apps) is available to Plus and Pro; a plugin around a Site may be creatable "on any plan". Whether a Site-hosted MCP can write to an external service on Plus is not documented. | [Hosting a plugin with ChatGPT Sites](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites) | low; worth a test |
| Mobile | The help article has a mobile heading but no answer was retrievable. Community reports: GPT Action regressions and OAuth problems on mobile. | [community](https://community.openai.com/t/custom-gpt-action-no-longer-invoked-on-mobile-clients-since-chatgpt-app-1-2026-139-regression/1382131) | **unknown** |
| Scheduled tasks (daily briefing) | Plus: **5 active scheduled tasks**, up to hourly; tasks use connected apps within granted permissions and may pause for approval on writes; runs consume plan usage. Event-triggered tasks (new Gmail, Slack, GitHub) are open to Plus. Whether a *custom* MCP plugin is usable in a scheduled task is not stated. | [Scheduled tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt) | medium / unknown for custom MCP |
| Security posture | Client identity is OpenAI-managed; tokens must be treated as untrusted and re-validated each call. | [App security whitepaper](https://cdn.openai.com/business-guides-and-resources/app-security-whitepaper.pdf) | medium |
| Community-reported gotchas | Dynamically registered clients missing the `openid` scope; the "Authorize" modal hanging with `/token` never called; "Plugin not found" after a successful OAuth. Treat as risks to test for, not facts. | [1](https://community.openai.com/t/missing-openid-scope-in-dynamically-registered-oauth-clients/1368690), [2](https://community.openai.com/t/apps-sdk-submission-blocked-mcp-oauth-code-issued-but-chatgpt-never-calls-token-authorize-mcp-modal-hangs/1385089) | low |

### Conclusion on the Plus requirement
**Genuine direct ChatGPT-to-Axis write access on a personal Plus plan is not supported by any official statement found, and the official plan table points the other way** (full MCP and write tools: Business and Enterprise/Edu; Pro: read/fetch only; Plus: unstated). Plus *read-only* access to a custom MCP server is plausible but unconfirmed. Building OAuth and polishing MCP before a real test on the owner's account risks building something Plus cannot use.

### Options, in order
0. **Decide by evidence first (no OAuth work).** (a) The owner checks *Plugins → + → Add custom MCP server* on their Plus account, on web and in the iPhone app, and reports exactly what appears (option present? any "read only" wording? mobile?). (b) With approval, deploy a throwaway **probe** MCP Worker with synthetic in-memory data (one read tool, one write tool, no real data, separate from Axis) and try to connect it from ChatGPT, run the write tool, and call it from the iPhone and from a scheduled task. This answers the plan, write, mobile and scheduled-task questions with the real client in under an hour. Cost: free Cloudflare tier.
1. **If Plus can run write tools:** implement the Axis OAuth 2.1 server (below) and connect `/mcp`. Acceptance test on the real account.
2. **If Plus is read-only (or custom MCP is absent):** build the **Plus-compatible bridge**. Axis serves live reads through the connector if allowed (outstanding tasks, status) and accepts writes through the existing review-first import path (`axis.import.v1`): ChatGPT emits a JSON block, a one-tap Apple Shortcut or paste submits it, the owner approves in Axis. Completions and edits made in Axis are visible to the next ChatGPT read. Not instantaneous or autonomous, but works on any plan.
3. **If full autonomy is required:** a paid plan that officially supports it (**Business workspace**; seat minimum and price to be checked with OpenAI) or running the assistant from Axis itself through the **OpenAI API** (separate pay-per-token billing; supports remote MCP tools with approvals) which would not be the owner's existing ChatGPT assistants.
Not recommended: GPT Actions (retiring, not creatable on Plus); Gmail-mediated loops (approval prompts on every send, fragile).

### OAuth 2.1 design for options 1 and 2 (self-hosted in the Worker, keeps Axis independent of other Framework identity systems)
Endpoints: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/oauth/authorize` (**behind Cloudflare Access**, consent screen for the owner only), `/oauth/token` (code + refresh; Access bypass), `/oauth/revoke`; registration by **predefined client** first (client id/redirect URI pre-registered by the owner, no open registration endpoint), CIMD later if ChatGPT requires it (validated fetch, SSRF-safe). Requirements: PKCE S256 only; exact redirect-URI match against OpenAI's published redirect URIs; `resource` bound to `https://axis…/mcp` and checked as token audience; RFC 9207 `iss` in responses; opaque access tokens (hash stored, ≤ 1 h) and rotating refresh tokens (hash stored, 30-90 d, revoked with the integration); scopes map 1:1 to the existing integration scopes (`tasks:read`, `tasks:write`, ...) and are re-checked per call; one consent per scope set; revocation from the Intelligence page takes effect on the next call; every grant, refresh and revocation audited; rate limits on `/oauth/token`. `/api/v1` bearer tokens stay for Shortcuts and other clients.

### Requirements that hold for every option
- Multiple conversations share one Axis database; idempotency keys, per-source `externalId`, optimistic `version` and the audit trail already make concurrent assistants safe.
- Bulk and destructive requests stay behind owner approval **in Axis**, independent of ChatGPT's own confirmation prompts.
- Task text and imported content stay untrusted data (injection posture below).
- Finance, health, calendar, goals and habits are added the same way: one entry in `operations.ts`, a scope, and a tool; sensitive modules get their own scopes so a conversation can be granted tasks without finance.

### Costs and limits
- No fee for connecting a custom MCP server was found for the plans where it is offered; the subscription is the cost. **Plus: unconfirmed write access. Pro: read-only (price per OpenAI, not checked). Business/Enterprise: write, per-seat (not checked).**
- Scheduled tasks on Plus: 5 active, hourly minimum, usage counts against plan allowances.
- Cloudflare: Workers, D1 and Access remain within free tiers at personal scale (to be re-checked when OAuth traffic is added). OpenAI API usage is billed separately and is only relevant to option 3.
- Development effort: option 0 about one hour; option 1 about two focused sessions; option 2 about one.

## Prompt-injection posture
Imported email and AI-generated text is untrusted. It is stored as plain text, rendered by React as text, never interpreted. MCP results carry a `contentTrust` marker and the server instructions tell the model not to follow instructions found in records. Assistants cannot approve, cannot create integrations, cannot read audit-private owner data beyond their scopes, and bulk/destructive requests need the owner.
