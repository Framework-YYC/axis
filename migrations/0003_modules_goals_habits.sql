-- 0003: five assistant modules, tasks v2, goals, habits, events, briefings, assistant inbox. Additive only.
-- One shared database: the module is a column, never a separate store. Relative labels (Today, This week ...) are never stored.

ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN module TEXT NOT NULL DEFAULT 'daily' CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive'));
ALTER TABLE tasks ADD COLUMN due_time TEXT;                -- HH:MM, optional
ALTER TABLE tasks ADD COLUMN recurrence TEXT;              -- JSON rule, see shared/recurrence.ts
ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT;    -- the first occurrence of the series
ALTER TABLE tasks ADD COLUMN source_assistant TEXT;        -- daily | health | financial | framework | progressive
ALTER TABLE tasks ADD COLUMN source_ref TEXT;              -- e.g. an email thread reference. Informational, never content.
ALTER TABLE tasks ADD COLUMN goal_id TEXT;
ALTER TABLE tasks ADD COLUMN demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1));  -- 1 = synthetic demonstration record
-- At most one occurrence of a series per due date, whatever creates it.
CREATE UNIQUE INDEX uq_tasks_recurrence ON tasks (recurrence_parent_id, due_date) WHERE recurrence_parent_id IS NOT NULL;
CREATE INDEX idx_tasks_module ON tasks (module, status, due_date);
CREATE INDEX idx_tasks_goal ON tasks (goal_id);

ALTER TABLE audit_log ADD COLUMN via TEXT;                 -- 'inbox' for assistant requests applied from assistant_inbox
ALTER TABLE integrations ADD COLUMN modules TEXT;          -- JSON array of modules this integration may touch; NULL = all

CREATE TABLE goals (
  id              TEXT PRIMARY KEY,
  module          TEXT NOT NULL CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  title           TEXT NOT NULL,
  description     TEXT,
  kind            TEXT NOT NULL DEFAULT 'qualitative' CHECK (kind IN ('numeric', 'qualitative')),
  term            TEXT CHECK (term IN ('short', 'medium', 'long')),   -- explicit override; NULL = derived from target_date
  target_date     TEXT,
  start_value     REAL,
  target_value    REAL,
  current_value   REAL,
  unit            TEXT,
  manual_progress REAL,                                               -- qualitative goals without milestones
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'achieved', 'abandoned')),
  source_kind     TEXT NOT NULL DEFAULT 'manual',
  source_name     TEXT NOT NULL DEFAULT 'Axis',
  source_assistant TEXT,
  source_ref      TEXT,
  external_id     TEXT,
  demo            INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  archived_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  completed_at    TEXT,
  created_by      TEXT NOT NULL,
  updated_by      TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_goals_external ON goals (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_goals_module ON goals (module, status);

CREATE TABLE goal_milestones (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT NOT NULL REFERENCES goals (id),
  title       TEXT NOT NULL,
  target_date TEXT,
  target_value REAL,
  done_at     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_goal_milestones_goal ON goal_milestones (goal_id);

CREATE TABLE goal_progress (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id     TEXT NOT NULL REFERENCES goals (id),
  at          TEXT NOT NULL,
  value       REAL,
  progress    REAL,
  note        TEXT,
  actor_label TEXT NOT NULL,
  channel     TEXT NOT NULL
);
CREATE INDEX idx_goal_progress_goal ON goal_progress (goal_id, at);

CREATE TABLE habits (
  id               TEXT PRIMARY KEY,
  module           TEXT NOT NULL CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  title            TEXT NOT NULL,
  description      TEXT,
  period           TEXT NOT NULL DEFAULT 'day' CHECK (period IN ('day', 'week', 'month')),
  target_count     INTEGER NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  target_value     REAL,                                             -- quantitative habits (e.g. 2500 ml)
  unit             TEXT,
  days_of_week     TEXT,                                             -- JSON array 0-6, NULL = every day
  rotation_mode    TEXT NOT NULL DEFAULT 'any' CHECK (rotation_mode IN ('any', 'on', 'off', 'split')),
  off_target_count INTEGER,
  off_target_value REAL,
  off_days_of_week TEXT,
  start_date       TEXT NOT NULL,
  goal_id          TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  source_kind      TEXT NOT NULL DEFAULT 'manual',
  source_name      TEXT NOT NULL DEFAULT 'Axis',
  source_assistant TEXT,
  source_ref       TEXT,
  external_id      TEXT,
  demo             INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  created_by       TEXT NOT NULL,
  updated_by       TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_habits_external ON habits (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_habits_module ON habits (module, status);

CREATE TABLE habit_logs (
  id          TEXT PRIMARY KEY,
  habit_id    TEXT NOT NULL REFERENCES habits (id),
  date        TEXT NOT NULL,                                          -- the calendar day the progress belongs to
  value       REAL NOT NULL DEFAULT 1,
  note        TEXT,
  at          TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  channel     TEXT NOT NULL,
  external_id TEXT
);
CREATE UNIQUE INDEX uq_habit_logs_external ON habit_logs (habit_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_habit_logs_habit ON habit_logs (habit_id, date);

CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  module      TEXT NOT NULL CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  title       TEXT NOT NULL,
  description TEXT,
  date        TEXT NOT NULL,
  start_time  TEXT,
  end_time    TEXT,
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  source_kind TEXT NOT NULL DEFAULT 'manual',
  source_name TEXT NOT NULL DEFAULT 'Axis',
  source_assistant TEXT,
  source_ref  TEXT,
  external_id TEXT,
  demo        INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_events_external ON events (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_events_date ON events (date, module);

-- Briefings are computed by Axis (correct time zone, horizons and module separation) and stored here so an assistant
-- that can only run SQL reads the same briefing the app shows. 'overview' holds counts only for the other modules.
CREATE TABLE briefings (
  module       TEXT PRIMARY KEY CHECK (module IN ('overview', 'daily', 'health', 'financial', 'framework', 'progressive')),
  today        TEXT NOT NULL,
  as_of        TEXT NOT NULL,
  content      TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

-- The only table an assistant may write to directly. Axis applies each request through its service layer
-- (validation, authorization, idempotency, approvals, history, audit) and records the outcome on the row.
CREATE TABLE assistant_inbox (
  id           TEXT PRIMARY KEY,                                      -- chosen by the assistant; re-sending the same id never repeats the request
  assistant    TEXT NOT NULL CHECK (assistant IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  op           TEXT NOT NULL,
  payload      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'duplicate', 'rejected', 'error', 'approval_required')),
  result       TEXT,
  processed_at TEXT,
  approval_id  TEXT
);
CREATE INDEX idx_assistant_inbox_status ON assistant_inbox (status, created_at);

INSERT INTO settings (key, value) VALUES ('week_start', 'monday');
