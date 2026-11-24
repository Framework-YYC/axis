# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Audit, architecture, repo, foundation, migrations, auth architecture | done (repo is local; see README) |
| 2 | Shell, design system, dashboard, module layouts, responsive tests, staging config, docs. **Plus** (added mid-phase): shared service layer, REST, MCP, tokens, audit, approvals, task round trip | done |
| 3 | Provision staging (Access app, D1, secrets, DNS) after owner approval; tasks module complete (recurrence, subtasks, reminders, projects); approvals + integrations UI; settings API | next |
| 4 | **OAuth 2.1 for MCP/ChatGPT**; OpenAPI for Actions; test on the owner's plan; Apple Shortcut recipes | |
| 5 | Finance (accounts, transactions, CSV import, budgets, bills, forecast) + MCP finance tools | |
| 6 | Health (logs, workouts, ingestion, trends) + MCP health tools | |
| 7 | Calendar (events, recurrence, rotation settings, Google), goals & habits, briefing import/review | |
| 8 | Export/backup automation, notifications, dashboard customization, hardening, production readiness review | |

Production deployment happens only with explicit authorization.
