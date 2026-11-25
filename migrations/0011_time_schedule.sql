-- 0011: automatic time clock punches. Additive only: two columns, one table (write-guarded).
-- time_entries.source marks an entry that the schedule started ('scheduled'); end_source marks one the schedule ended.
ALTER TABLE time_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE time_entries ADD COLUMN end_source TEXT;

-- One row per worksite day and action: what the schedule did or why it did nothing. The unique key is what makes a run, a retry and an
-- overlapping run harmless: a day's clock-in (and clock-out) can be decided exactly once.
CREATE TABLE time_schedule_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  local_date TEXT NOT NULL,                       -- the day in the worksite's time zone
  action     TEXT NOT NULL CHECK (action IN ('in', 'out')),
  outcome    TEXT NOT NULL CHECK (outcome IN ('punched', 'skipped', 'missed', 'overtime', 'none')),
  reason     TEXT,
  entry_id   TEXT,
  at         TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE (local_date, action)
);

CREATE TRIGGER guard_time_schedule_log_i BEFORE INSERT ON time_schedule_log
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_schedule_log are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_schedule_log_u BEFORE UPDATE ON time_schedule_log
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_schedule_log are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_time_schedule_log_d BEFORE DELETE ON time_schedule_log
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to time_schedule_log are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

