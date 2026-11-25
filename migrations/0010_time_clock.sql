-- 0010: Work time clock. Additive only: two new tables, seeded jobs, write-guard triggers.
-- Punches are intervals in UTC. At most one entry is running (the partial unique index), so a double tap or two devices cannot overlap.
CREATE TABLE time_jobs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  number     TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE time_entries (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('job', 'break')),
  job_id        TEXT REFERENCES time_jobs (id),
  resume_job_id TEXT REFERENCES time_jobs (id),   -- a break remembers the job Resume returns to
  start_at      TEXT NOT NULL,
  end_at        TEXT,                              -- NULL while running
  note          TEXT,
  punch_id      TEXT,                              -- client-generated id of the punch that started this entry: a retried save cannot create it twice
  edited        INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
  orig_start_at TEXT,                              -- the punched times, kept the first time an entry is edited
  orig_end_at   TEXT,
  deleted_at    TEXT,
  demo          INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  CHECK (end_at IS NULL OR end_at > start_at),
  CHECK ((kind = 'job' AND job_id IS NOT NULL) OR kind = 'break')
);
CREATE UNIQUE INDEX uq_time_open ON time_entries ((1)) WHERE end_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_time_punch ON time_entries (punch_id) WHERE punch_id IS NOT NULL;
CREATE INDEX idx_time_entries_start ON time_entries (start_at);

-- The two starting jobs (configurable in the app). Seeded before the guards exist.
INSERT INTO time_jobs (id, name, number, active, sort_order, created_at, updated_at, updated_by) VALUES
  ('tjob_reef',  'REEF',  '928',  1, 1, '2026-11-25T00:00:00.000Z', '2026-11-25T00:00:00.000Z', 'Migration'),
  ('tjob_ripet', 'RIPET', '1011', 1, 2, '2026-11-25T00:00:00.000Z', '2026-11-25T00:00:00.000Z', 'Migration');

CREATE TRIGGER guard_time_jobs_i BEFORE INSERT ON time_jobs
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_jobs are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_jobs_u BEFORE UPDATE ON time_jobs
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_jobs are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_jobs_d BEFORE DELETE ON time_jobs
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_jobs are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_entries_i BEFORE INSERT ON time_entries
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_entries are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_entries_u BEFORE UPDATE ON time_entries
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_entries are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_entries_d BEFORE DELETE ON time_entries
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_entries are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

