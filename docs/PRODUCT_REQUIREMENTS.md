# Product requirements

Axis is a private, single-user personal operating system (architecture open to more users later) on iPhone, iPad and desktop, installable as a PWA. CAD, metric/imperial, device-aware time zone. Works without any AI subscription.

## Modules and status
| Module | Requirement summary | Phase 2 status |
|---|---|---|
| Dashboard | Modular widgets: priorities, upcoming, events, briefing, bills, finances, health, water, goals, rotation, quick actions | Built (priorities live; others synthetic) |
| Tasks | Today/tomorrow/week/month/long-term/inbox/overdue/completed; categories, priorities, statuses, due/scheduled dates, search/filter, completion history, source tracking, duplicate detection | **Core built and live** (service, REST, MCP, UI). Recurring tasks, subtasks, reminders, projects UI: Phase 3 |
| Finance | Accounts, cards, loans, investments, income, transactions, budgets, planned vs actual, bills, statements, debt, receivables, net worth, savings goals, forecast, CSV import | Layout + shared money/ledger logic and tests; data synthetic |
| Health | Weight, measurements, workouts, sets/reps, PRs, steps, water, nutrition, sleep, appointments, medications, trends; ingestion API | Layout; synthetic; ingestion envelope designed |
| Calendar | Day/week/month, appointments, deadlines, due dates, paydays, training, travel, recurrence, 14/7 rotation, Google later | Layout with rotation logic (tested); synthetic events |
| Goals & habits | Goals, milestones, progress, habits, consistency, links to other modules | Layout; synthetic |
| AI intelligence | Imports, extraction, review/approval, attribution, duplicate prevention, reconciliation, secure API, MCP | **Service layer, REST, MCP, audit, approvals, scoped tokens built**; OAuth, import review UI later |
| Settings | Appearance, units, categories, notifications, rotation, integrations, export, backup, security | Appearance functional; rest preview |

## Bidirectional ChatGPT integration (core)
See CHATGPT_INTEGRATION.md. Acceptance workflow is automated.

## Non-functional
Accessible contrast and keyboard navigation, reduced-motion support, touch targets ≥ 40 px, no horizontal scroll at 390/820/1180/1440 px, strict security (SECURITY.md), tests for business logic and security.
