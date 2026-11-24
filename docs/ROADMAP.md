# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Audit, architecture, repo, foundation, migrations, auth architecture | done (repo is local; see README) |
| 2 | Shell, design system, dashboard, module layouts, responsive tests, staging config, docs. **Plus** (added mid-phase): shared service layer, REST, MCP, tokens, audit, approvals, task round trip | done |
| 3 | Provision staging (Access app, D1, secrets, DNS) after owner approval; tasks module complete (recurrence, subtasks, reminders, projects); approvals + integrations UI; settings API | next |
| 4 | **ChatGPT integration, evidence first**: Plus UI check and probe Worker (docs/CHATGPT_INTEGRATION.md option 0), then OAuth 2.1 + real-client acceptance (option 1) or the review-first bridge (option 2). GPT Actions dropped (retiring). Apple Shortcut recipes | decision pending |
| 5 | Finance (accounts, transactions, CSV import, budgets, bills, forecast) + MCP finance tools | |
| 6 | Health (logs, workouts, ingestion, trends) + MCP health tools | |
| 7 | Calendar (events, recurrence, rotation settings, Google), goals & habits, briefing import/review | |
| 8 | Export/backup automation, notifications, dashboard customization, hardening, production readiness review | |

Production deployment happens only with explicit authorization.

## Next after the assistant-centred release
- Owner acceptance from each ChatGPT project (docs/ASSISTANT_INTEGRATION.md, section 6); decide whether to scope or replace the account-wide Cloudflare connection.
- Per-module detail (finance, health, business, construction) only after the shared model is proven; not started.
- OAuth for the MCP path if ChatGPT write access is needed with per-assistant identity.
- Production: needs its own cron slot or a different trigger approach, and explicit owner approval.
