-- 0001_core: foundation tables. Additive only. Synthetic seed values; no personal data.
-- Money columns in later migrations are INTEGER minor units (cents) with currency stored alongside.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  module     TEXT NOT NULL DEFAULT 'tasks',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);

-- Who did what, never the content: no amounts, notes, health values or tokens.
-- actor_type: 'user' (the owner in the web app) or 'integration' (ChatGPT, Shortcuts, ...); actor_label names the originating assistant.
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('user', 'integration', 'system')),
  actor_id    TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('web', 'rest', 'mcp', 'system')),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  outcome     TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure', 'approval_required')),
  request_id  TEXT
);
CREATE INDEX idx_audit_log_at ON audit_log (at);

INSERT INTO settings (key, value) VALUES
  ('currency', 'CAD'),
  ('unit_system', 'metric'),
  ('theme', 'system'),
  ('timezone', 'auto'),
  ('work_rotation', '{"anchorDate":"2026-11-16","onDays":14,"offDays":7}');

INSERT INTO categories (id, name, sort_order) VALUES
  ('personal', 'Personal', 1),
  ('work', 'Work', 2),
  ('finance', 'Finance', 3),
  ('framework', 'Framework', 4),
  ('nexus', 'Nexus', 5),
  ('health', 'Health', 6),
  ('learning', 'Learning & Development', 7);
