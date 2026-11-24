-- 0004: database-level write guard. Additive only.
--
-- Axis data may only be changed through the Axis service layer, which validates input, checks authorization and approvals,
-- keeps task and goal history and writes the audit trail. The service layer opens this gate for the duration of its own
-- batch (a D1 batch is one transaction, so the gate is never visible open to anyone else). Any other SQL, including SQL run
-- through the Cloudflare connection an assistant uses, is stopped with a clear message instead of silently bypassing those controls.
--
-- Honest limit: this stops accidental and silent bypass. A caller with full SQL access that deliberately opens the gate
-- can still write; only scoped credentials prevent that (see docs/SECURITY.md).
CREATE TABLE write_gate (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  open INTEGER NOT NULL DEFAULT 0 CHECK (open IN (0, 1))
);
INSERT INTO write_gate (id, open) VALUES (1, 0);

CREATE TRIGGER guard_settings_i BEFORE INSERT ON settings
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to settings are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_settings_u BEFORE UPDATE ON settings
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to settings are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_settings_d BEFORE DELETE ON settings
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to settings are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_categories_i BEFORE INSERT ON categories
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to categories are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_categories_u BEFORE UPDATE ON categories
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to categories are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_categories_d BEFORE DELETE ON categories
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to categories are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_audit_log_i BEFORE INSERT ON audit_log
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to audit_log are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_audit_log_u BEFORE UPDATE ON audit_log
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to audit_log are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_audit_log_d BEFORE DELETE ON audit_log
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to audit_log are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_integrations_i BEFORE INSERT ON integrations
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to integrations are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_integrations_u BEFORE UPDATE ON integrations
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to integrations are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_integrations_d BEFORE DELETE ON integrations
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to integrations are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_api_tokens_i BEFORE INSERT ON api_tokens
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to api_tokens are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_api_tokens_u BEFORE UPDATE ON api_tokens
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to api_tokens are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_api_tokens_d BEFORE DELETE ON api_tokens
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to api_tokens are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_pending_approvals_i BEFORE INSERT ON pending_approvals
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to pending_approvals are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_pending_approvals_u BEFORE UPDATE ON pending_approvals
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to pending_approvals are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_pending_approvals_d BEFORE DELETE ON pending_approvals
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to pending_approvals are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_idempotency_keys_i BEFORE INSERT ON idempotency_keys
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to idempotency_keys are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_idempotency_keys_u BEFORE UPDATE ON idempotency_keys
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to idempotency_keys are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_idempotency_keys_d BEFORE DELETE ON idempotency_keys
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to idempotency_keys are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_tasks_i BEFORE INSERT ON tasks
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to tasks are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_tasks_u BEFORE UPDATE ON tasks
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to tasks are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_tasks_d BEFORE DELETE ON tasks
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to tasks are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_task_events_i BEFORE INSERT ON task_events
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to task_events are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_task_events_u BEFORE UPDATE ON task_events
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to task_events are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_task_events_d BEFORE DELETE ON task_events
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to task_events are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goals_i BEFORE INSERT ON goals
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goals are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goals_u BEFORE UPDATE ON goals
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goals are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goals_d BEFORE DELETE ON goals
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goals are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goal_milestones_i BEFORE INSERT ON goal_milestones
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goal_milestones are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goal_milestones_u BEFORE UPDATE ON goal_milestones
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goal_milestones are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goal_milestones_d BEFORE DELETE ON goal_milestones
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goal_milestones are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goal_progress_i BEFORE INSERT ON goal_progress
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goal_progress are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goal_progress_u BEFORE UPDATE ON goal_progress
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goal_progress are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_goal_progress_d BEFORE DELETE ON goal_progress
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to goal_progress are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_habits_i BEFORE INSERT ON habits
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to habits are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_habits_u BEFORE UPDATE ON habits
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to habits are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_habits_d BEFORE DELETE ON habits
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to habits are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_habit_logs_i BEFORE INSERT ON habit_logs
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to habit_logs are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_habit_logs_u BEFORE UPDATE ON habit_logs
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to habit_logs are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_habit_logs_d BEFORE DELETE ON habit_logs
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to habit_logs are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_events_i BEFORE INSERT ON events
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to events are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_events_u BEFORE UPDATE ON events
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to events are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_events_d BEFORE DELETE ON events
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to events are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_briefings_i BEFORE INSERT ON briefings
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to briefings are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_briefings_u BEFORE UPDATE ON briefings
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to briefings are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_briefings_d BEFORE DELETE ON briefings
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to briefings are blocked. Use the Axis REST or MCP service, or add a request to assistant_inbox.'); END;

-- assistant_inbox: assistants may INSERT a well-formed pending request. Everything else on it belongs to the service layer.
CREATE TRIGGER guard_assistant_inbox_u BEFORE UPDATE ON assistant_inbox
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'assistant_inbox rows are read-only for assistants. Axis records the outcome on the row.'); END;

CREATE TRIGGER guard_assistant_inbox_d BEFORE DELETE ON assistant_inbox
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'assistant_inbox rows cannot be removed by assistants.'); END;

CREATE TRIGGER guard_assistant_inbox_i BEFORE INSERT ON assistant_inbox
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1 AND (
     NEW.status != 'pending' OR NEW.result IS NOT NULL OR NEW.processed_at IS NOT NULL OR NEW.approval_id IS NOT NULL
  OR json_valid(NEW.payload) = 0 OR length(NEW.payload) > 20000
  OR length(NEW.id) < 8 OR length(NEW.id) > 80
  OR NEW.op NOT IN ('task.create', 'task.create_many', 'task.update', 'task.complete', 'task.reopen', 'task.archive',
                    'goal.create', 'goal.update', 'goal.progress', 'habit.create', 'habit.update', 'habit.log',
                    'event.create', 'event.update', 'briefing.refresh')
  OR (SELECT COUNT(*) FROM assistant_inbox WHERE status = 'pending') >= 200)
BEGIN SELECT RAISE(ABORT, 'Invalid assistant_inbox request: status must be pending, payload valid JSON under 20000 characters, a known op, an id of 8 to 80 characters, and fewer than 200 requests waiting.'); END;
