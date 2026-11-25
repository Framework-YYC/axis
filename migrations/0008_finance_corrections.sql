-- 0008: finance corrections. Additive only.
-- A transaction is never deleted: it is voided (as though it never happened, kept with its reason) or reversed (an offsetting entry; both are kept).
-- A bill payment can be reversed and later paid again for the same due date. A loan payment can be split into principal and interest.
-- A reimbursement claim links to the expense(s) it recovers. Every edit, void and reversal keeps a before/after history row.
ALTER TABLE fin_transactions ADD COLUMN voided_at TEXT;
ALTER TABLE fin_transactions ADD COLUMN voided_by TEXT;
ALTER TABLE fin_transactions ADD COLUMN void_reason TEXT;
ALTER TABLE fin_transactions ADD COLUMN reversal_of TEXT;        -- set on the offsetting entry: the transaction it reverses
ALTER TABLE fin_transactions ADD COLUMN reversed_by TEXT;        -- set on the original: its offsetting entry
ALTER TABLE fin_transactions ADD COLUMN principal_minor INTEGER; -- loan payments: the part that reduces the loan (a magnitude; principal + interest = |amount|)
ALTER TABLE fin_transactions ADD COLUMN interest_minor INTEGER;  -- loan payments: the part that is interest (an expense, never a repayment)

ALTER TABLE fin_bill_payments ADD COLUMN reversed_at TEXT;
ALTER TABLE fin_bill_payments ADD COLUMN reversed_by TEXT;
ALTER TABLE fin_bill_payments ADD COLUMN reverse_reason TEXT;
ALTER TABLE fin_bill_payments ADD COLUMN completed_task_id TEXT; -- the task this payment completed (reopened again if the payment is reversed)

CREATE TABLE fin_reimbursement_links (
  id               TEXT PRIMARY KEY,
  reimbursement_id TEXT NOT NULL REFERENCES fin_reimbursements (id),
  txn_id           TEXT NOT NULL REFERENCES fin_transactions (id),  -- the reimbursable expense
  amount_minor     INTEGER NOT NULL CHECK (amount_minor > 0),         -- the part of that expense this claim recovers
  created_at       TEXT NOT NULL,
  created_by       TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_fin_reimb_links ON fin_reimbursement_links (reimbursement_id, txn_id);
CREATE INDEX idx_fin_reimb_links_txn ON fin_reimbursement_links (txn_id);

-- Before/after history of a transaction: edits, voids, reversals and the bill-payment reversals that followed them.
CREATE TABLE fin_txn_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id      TEXT NOT NULL,
  at          TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('edit', 'void', 'reverse', 'reversal_entry', 'payment_reversed', 'link')),
  actor_label TEXT NOT NULL,
  channel     TEXT,
  reason      TEXT,
  changed     TEXT NOT NULL DEFAULT '[]'                              -- JSON: [{"field":"amountMinor","from":-1000,"to":-1200}]
);
CREATE INDEX idx_fin_txn_history ON fin_txn_history (txn_id, at);

CREATE TRIGGER guard_fin_reimbursement_links_i BEFORE INSERT ON fin_reimbursement_links
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_reimbursement_links are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_reimbursement_links_u BEFORE UPDATE ON fin_reimbursement_links
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_reimbursement_links are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_reimbursement_links_d BEFORE DELETE ON fin_reimbursement_links
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_reimbursement_links are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_txn_history_i BEFORE INSERT ON fin_txn_history
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_txn_history are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_txn_history_u BEFORE UPDATE ON fin_txn_history
BEGIN SELECT RAISE(ABORT, 'fin_txn_history is an append-only record and cannot be changed.'); END;

CREATE TRIGGER guard_fin_txn_history_d BEFORE DELETE ON fin_txn_history
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_txn_history are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;
