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

## Investigation of ChatGPT compatibility (2026-11-24)

**Method and limit.** This environment cannot open OpenAI's documentation directly (network policy). Findings below come from web-search summaries of official OpenAI pages and OpenAI community threads. Treat them as **leads to confirm**, not as verified facts. Nothing here has been tested against a real ChatGPT account.

| Question | What was found | Confidence |
|---|---|---|
| Custom remote MCP in ChatGPT | OpenAI's help article ["Connecting custom MCP servers in ChatGPT"](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) and the [developer-mode guide](https://developers.openai.com/api/docs/guides/developer-mode) describe custom MCP connectors with read **and write** tools; writes ask for confirmation by default; tools without a read-only annotation are treated as writes. | official, summarised |
| Plus availability | The help article was summarised as covering Business and Enterprise/Edu on the web and **not mentioning Plus or Pro**. A community thread reports Plus/Pro can use custom connectors only in Developer Mode; another reports blocked write calls on a Plus plan. | **unconfirmed; do not assume** |
| OAuth | Per the [Apps SDK auth docs](https://developers.openai.com/plugins/build/auth): OAuth 2.1 with PKCE (S256 must be advertised); unauthenticated calls should return 401 with `WWW-Authenticate` pointing at protected-resource metadata; registration by Client ID Metadata Documents (preferred) or dynamic client registration; issuer identification (RFC 9207); every token validated for signature, issuer, audience, expiry and scope on every call. | official, summarised |
| API keys / machine-to-machine | Summarised as **not supported** by ChatGPT (no client credentials, service accounts or custom API keys). So a static bearer token cannot connect ChatGPT. | official, summarised |
| Plugins | Retired in 2024 per community reports; replaced by GPTs/Actions. Recent forum posts mention further changes to custom GPT creation. | community only |
| Mobile | Not answered by the sources found. The setup guide describes the web. | **unknown** |
| Apps SDK / Sites-hosted MCP apps | Apps SDK docs exist (build an MCP server, auth). "Sites-hosted MCP apps" was not found and is unverified. | unknown |

### Consequences for the design
1. ChatGPT needs **OAuth 2.1 + PKCE** in front of `/mcp`. Bearer tokens (built) serve Shortcuts, scripts and other MCP clients, not ChatGPT. Building the OAuth authorization server (metadata, registration, `/oauth/authorize` behind Cloudflare Access for the owner's consent, token endpoint, refresh, revocation tied to `integrations`) is the first task of the integration phase. The scopes, the integration record and revocation already exist and map one-to-one.
2. Cloudflare Access must **not** sit in front of `/mcp`, `/api/v1/*`, `/oauth/token`, `/oauth/register` and `/.well-known/*` (ChatGPT cannot do an Access login). Those paths get a bypass policy and the Worker enforces authentication itself (already the case: bearer validated against the database, scoped, revocable, rate-limit to be added). `/oauth/authorize` and the whole web app stay behind Access.
3. Write tools declare `readOnlyHint` / `destructiveHint` so ChatGPT's confirmation behaviour matches risk; bulk and destructive calls additionally require approval **inside Axis**, independent of ChatGPT's own prompt.

### Plan, in order of preference (all keep the same API and MCP)
1. **Custom MCP connector with OAuth** (if the Plus plan allows write tools in Developer Mode, to be tested by the owner on their own account).
2. **Custom GPT with Actions** calling `/api/v1` (OpenAPI schema generated from `operations.ts`; Actions use OAuth). Availability on the owner's plan to be confirmed.
3. **Fallback that works on any plan today:** the owner-reviewed import path. ChatGPT produces an `axis.import.v1` JSON envelope (`shared/ingest.ts`), the owner pastes or shares it into Axis (or an Apple Shortcut posts it), it lands as a pending batch, and nothing is saved until approved. Completed-task reconciliation runs in the other direction through an exportable "outstanding tasks" briefing.

### What the owner can check quickly (5 minutes)
In ChatGPT: Settings → Connectors (or Apps) → look for Developer mode / "Add custom connector" and note whether write tools are offered on Plus. Report back what the screen says; that decides option 1 versus 2.

## Prompt-injection posture
Imported email and AI-generated text is untrusted. It is stored as plain text, rendered by React as text, never interpreted. MCP results carry a `contentTrust` marker and the server instructions tell the model not to follow instructions found in records. Assistants cannot approve, cannot create integrations, cannot read audit-private owner data beyond their scopes, and bulk/destructive requests need the owner.
