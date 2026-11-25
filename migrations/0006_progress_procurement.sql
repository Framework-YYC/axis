-- 0006: deliverable progress tracking (reusable multi-stage deliverables) and procurement. Additive only.
-- Progress is DERIVED from tasks wherever a part is linked to a task, so there is one source of truth: completing the weekly KPI task completes its reporting period.
ALTER TABLE tasks ADD COLUMN track_part TEXT;   -- '<track key>:period' or '<track key>:submit': ties a recurring task to a progress track
CREATE INDEX idx_tasks_track ON tasks (track_part, due_date);

CREATE TABLE progress_tracks (
  key          TEXT PRIMARY KEY,                     -- e.g. 'reef-kpi'
  module       TEXT NOT NULL CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  title        TEXT NOT NULL,                        -- 'REEF KPIs'
  stream       TEXT,                                 -- short label, e.g. 'REEF'
  period_rule  TEXT NOT NULL,                        -- JSON recurrence rule that dates the reporting periods inside a cycle (weekly, byWeekday)
  period_label TEXT NOT NULL DEFAULT 'Week ending',
  steps        TEXT NOT NULL,                        -- JSON [{key,title}] final steps after the periods (verify, submit)
  start_cycle  TEXT NOT NULL,                        -- first month tracked, YYYY-MM
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE deliverables (
  id         TEXT PRIMARY KEY,
  track_key  TEXT NOT NULL REFERENCES progress_tracks (key),
  cycle      TEXT NOT NULL,                          -- YYYY-MM
  title      TEXT NOT NULL,
  due_date   TEXT NOT NULL,                          -- the month's final deadline (last day of the month)
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_deliverables_cycle ON deliverables (track_key, cycle);

CREATE TABLE deliverable_parts (
  id             TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id),
  kind           TEXT NOT NULL CHECK (kind IN ('period', 'step')),
  part_key       TEXT NOT NULL,                      -- '2026-11-29' for a period (its deadline), the step key for a step
  label          TEXT NOT NULL,
  due_date       TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  done_at        TEXT,                               -- set when completed here; a linked task's completion counts too
  done_by        TEXT,
  note           TEXT
);
CREATE UNIQUE INDEX uq_deliverable_parts ON deliverable_parts (deliverable_id, part_key);

CREATE TABLE procurement_items (
  id                   TEXT PRIMARY KEY,
  module               TEXT NOT NULL CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  material             TEXT NOT NULL,
  description          TEXT,
  quantity             REAL,
  unit                 TEXT,
  supplier             TEXT,
  order_ref            TEXT,
  status               TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'ordered', 'in_transit', 'notified', 'received')),
  requested_on         TEXT,
  ordered_on           TEXT,
  in_transit_on        TEXT,
  notified_on          TEXT,
  received_on          TEXT,
  expected_date        TEXT,
  expected_time        TEXT,
  notification_task_id TEXT,
  priority             TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  notes                TEXT,
  source_kind          TEXT NOT NULL DEFAULT 'manual',
  source_name          TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant     TEXT,
  source_ref           TEXT,
  external_id          TEXT,
  demo                 INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  archived_at          TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  created_by           TEXT NOT NULL,
  updated_by           TEXT NOT NULL,
  version              INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_procurement_external ON procurement_items (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_procurement_status ON procurement_items (module, status, expected_date);

CREATE TRIGGER guard_progress_tracks_i BEFORE INSERT ON progress_tracks
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to progress_tracks are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_progress_tracks_u BEFORE UPDATE ON progress_tracks
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to progress_tracks are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_progress_tracks_d BEFORE DELETE ON progress_tracks
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to progress_tracks are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_deliverables_i BEFORE INSERT ON deliverables
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to deliverables are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_deliverables_u BEFORE UPDATE ON deliverables
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to deliverables are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_deliverables_d BEFORE DELETE ON deliverables
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to deliverables are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_deliverable_parts_i BEFORE INSERT ON deliverable_parts
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to deliverable_parts are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_deliverable_parts_u BEFORE UPDATE ON deliverable_parts
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to deliverable_parts are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_deliverable_parts_d BEFORE DELETE ON deliverable_parts
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to deliverable_parts are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_procurement_items_i BEFORE INSERT ON procurement_items
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to procurement_items are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_procurement_items_u BEFORE UPDATE ON procurement_items
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to procurement_items are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_procurement_items_d BEFORE DELETE ON procurement_items
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to procurement_items are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

