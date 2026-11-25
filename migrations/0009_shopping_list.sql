-- 0009: Work shopping list. A lightweight checklist for trips into town, separate from Procurement (an item can be promoted to Procurement when it needs tracking). Additive only.
-- Clearing is soft (cleared_at) so history, restore and duplicate prevention keep working; nothing is ever deleted.
CREATE TABLE shopping_items (
  id               TEXT PRIMARY KEY,
  module           TEXT NOT NULL DEFAULT 'progressive' CHECK (module IN ('daily', 'health', 'financial', 'framework', 'progressive')),
  title            TEXT NOT NULL,
  quantity         TEXT,                                 -- free text, e.g. '2' or '10 m'; never invented
  job              TEXT,                                 -- job number, e.g. '928'; never invented
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked')),
  checked_at       TEXT,
  notes            TEXT,
  procurement_id   TEXT,                                 -- set when the item was promoted to Procurement
  cleared_at       TEXT,                                 -- soft clear (also set when promoted)
  source_kind      TEXT NOT NULL DEFAULT 'manual',
  source_name      TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant TEXT,
  source_ref       TEXT,
  external_id      TEXT,                                 -- the assistant's stable key: the same key always updates the same item
  demo             INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  created_by       TEXT NOT NULL,
  updated_by       TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_shopping_external ON shopping_items (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_shopping_list ON shopping_items (module, cleared_at, status, created_at);

CREATE TRIGGER guard_shopping_items_i BEFORE INSERT ON shopping_items
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to shopping_items are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_shopping_items_u BEFORE UPDATE ON shopping_items
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to shopping_items are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_shopping_items_d BEFORE DELETE ON shopping_items
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to shopping_items are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;
