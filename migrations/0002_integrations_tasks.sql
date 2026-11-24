-- 0002: integrations (ChatGPT, Shortcuts, ...), scoped revocable tokens, approvals, idempotency, and the tasks core
-- that every channel (web, REST, MCP) shares. Additive only.

CREATE TABLE integrations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('chatgpt', 'shortcut', 'mcp_client', 'automation', 'other')),
  scopes     TEXT NOT NULL,                       -- JSON array of scope names, least privilege
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

-- Only a SHA-256 of the token is stored; the token itself is shown once at creation.
CREATE TABLE api_tokens (
  id             TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations (id),
  token_hash     TEXT NOT NULL UNIQUE,
  prefix         TEXT NOT NULL,                   -- first characters, for recognising a token in the UI
  created_at     TEXT NOT NULL,
  expires_at     TEXT,
  last_used_at   TEXT,
  revoked_at     TEXT
);
CREATE INDEX idx_api_tokens_integration ON api_tokens (integration_id);

-- Bulk and destructive requests from an integration wait here until the owner approves them in the web app.
CREATE TABLE pending_approvals (
  id                 TEXT PRIMARY KEY,
  action             TEXT NOT NULL,
  summary            TEXT NOT NULL,
  payload            TEXT NOT NULL,               -- JSON, executed only after approval
  requested_by_id    TEXT NOT NULL,
  requested_by_label TEXT NOT NULL,
  channel            TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at         TEXT NOT NULL,
  decided_at         TEXT
);
CREATE INDEX idx_pending_approvals_status ON pending_approvals (status, created_at);

CREATE TABLE idempotency_keys (
  scope         TEXT NOT NULL,                    -- the actor id, so keys never collide across integrations
  key           TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  response      TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  notes          TEXT,
  category_id    TEXT REFERENCES categories (id),
  project        TEXT,
  priority       TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'waiting', 'completed')),
  due_date       TEXT,                            -- YYYY-MM-DD, a calendar date, not an instant
  scheduled_date TEXT,
  completed_at   TEXT,
  archived_at    TEXT,
  source_kind    TEXT NOT NULL DEFAULT 'manual',  -- manual | chatgpt | shortcut | csv | ...
  source_name    TEXT NOT NULL DEFAULT 'Axis',    -- the originating assistant or integration
  external_id    TEXT,                            -- the sender's own id, for duplicate prevention
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  created_by     TEXT NOT NULL,                   -- actor label
  updated_by     TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_tasks_external ON tasks (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_tasks_status_due ON tasks (status, due_date);
CREATE INDEX idx_tasks_category ON tasks (category_id);

-- Completion and change history. Field names only, never content.
CREATE TABLE task_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks (id),
  at          TEXT NOT NULL,
  event       TEXT NOT NULL CHECK (event IN ('created', 'updated', 'completed', 'reopened', 'archived')),
  actor_type  TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  channel     TEXT NOT NULL,
  changed     TEXT                                -- JSON array of changed field names
);
CREATE INDEX idx_task_events_task ON task_events (task_id, at);
CREATE INDEX idx_task_events_event ON task_events (event, at);
