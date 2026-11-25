-- 0007: personal finance (Finance module). Additive only. All money is INTEGER minor units (cents) in CAD.
-- Distinctions kept in the data: transactions are confirmed (or pending) events; balances are confirmed snapshots or estimates; expected income and
-- bills are plans, never transactions. A move between the owner's own accounts is ONE transaction with a counter account (never two legs).
-- A task can point at the record it is about (tasks.record_ref, e.g. 'bill:<id>').
ALTER TABLE tasks ADD COLUMN record_ref TEXT;

CREATE TABLE fin_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
);

CREATE TABLE fin_accounts (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  type                     TEXT NOT NULL CHECK (type IN ('bank', 'savings', 'credit_card', 'loan', 'investment', 'cash')),
  currency                 TEXT NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  institution              TEXT,
  credit_limit_minor       INTEGER,
  statement_day            INTEGER CHECK (statement_day BETWEEN 1 AND 31),
  due_day                  INTEGER CHECK (due_day BETWEEN 1 AND 31),
  min_payment_minor        INTEGER,
  interest_rate            REAL,                          -- annual percent, e.g. 5.49
  original_principal_minor INTEGER,                       -- loans: what was borrowed
  target_minor             INTEGER,                       -- savings target
  target_date              TEXT,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  archived_at              TEXT,
  source_kind       TEXT NOT NULL DEFAULT 'manual',
  source_name       TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant  TEXT,
  source_ref        TEXT,
  external_id       TEXT,
  demo              INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_fin_accounts_external ON fin_accounts (source_name, external_id) WHERE external_id IS NOT NULL;

-- Balances are signed from the owner's point of view: assets positive, money owed on a card or loan negative.
CREATE TABLE fin_balances (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES fin_accounts (id),
  as_of       TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'confirmed' CHECK (kind IN ('confirmed', 'estimate')),
  note        TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual',
  source_name TEXT NOT NULL DEFAULT 'Orbis',
  source_ref  TEXT,
  demo        INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_fin_balances ON fin_balances (account_id, as_of, kind);

CREATE TABLE fin_transactions (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES fin_accounts (id),
  counter_account_id TEXT REFERENCES fin_accounts (id),   -- the other own account of a transfer, card payment or loan payment
  date               TEXT NOT NULL,
  amount_minor       INTEGER NOT NULL,                    -- signed from account_id's point of view (negative = money out)
  kind               TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer', 'card_payment', 'loan_payment', 'reimbursement')),
  payee              TEXT,
  description        TEXT,
  category_id        TEXT REFERENCES fin_categories (id),
  status             TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
  bill_id            TEXT,
  bill_due           TEXT,
  reimbursement_id   TEXT,
  reimbursable       INTEGER NOT NULL DEFAULT 0 CHECK (reimbursable IN (0, 1)),
  source_kind       TEXT NOT NULL DEFAULT 'manual',
  source_name       TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant  TEXT,
  source_ref        TEXT,
  external_id       TEXT,
  demo              INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_fin_txn_external ON fin_transactions (source_name, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_fin_txn_date ON fin_transactions (date);
CREATE INDEX idx_fin_txn_account ON fin_transactions (account_id, date);

CREATE TABLE fin_bills (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  amount_minor       INTEGER,                              -- NULL when not known: never guessed
  amount_kind        TEXT NOT NULL DEFAULT 'fixed' CHECK (amount_kind IN ('fixed', 'estimate')),
  account_id         TEXT REFERENCES fin_accounts (id),    -- paid from
  counter_account_id TEXT REFERENCES fin_accounts (id),    -- the card or loan this payment goes to (a debt repayment, not spending)
  category_id        TEXT REFERENCES fin_categories (id),
  recurrence         TEXT NOT NULL,                        -- JSON rule (see shared/recurrence.ts)
  anchor_date        TEXT NOT NULL,                        -- a real due date the rule is anchored on
  autopay            INTEGER NOT NULL DEFAULT 0 CHECK (autopay IN (0, 1)),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes              TEXT,
  source_kind       TEXT NOT NULL DEFAULT 'manual',
  source_name       TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant  TEXT,
  source_ref        TEXT,
  external_id       TEXT,
  demo              INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_fin_bills_external ON fin_bills (source_name, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE fin_bill_payments (
  id          TEXT PRIMARY KEY,
  bill_id     TEXT NOT NULL REFERENCES fin_bills (id),
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('paid', 'skipped')),
  paid_on     TEXT,
  amount_minor INTEGER,
  txn_id      TEXT,
  demo        INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_fin_bill_payments ON fin_bill_payments (bill_id, due_date);

CREATE TABLE fin_budgets (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES fin_categories (id),
  cycle       TEXT NOT NULL DEFAULT '*',                   -- '*' = every month, or YYYY-MM for one month
  amount_minor INTEGER NOT NULL,
  demo        INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_fin_budgets ON fin_budgets (category_id, cycle);

CREATE TABLE fin_income_plans (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  amount_minor INTEGER,
  amount_kind  TEXT NOT NULL DEFAULT 'estimate' CHECK (amount_kind IN ('fixed', 'estimate')),
  recurrence   TEXT NOT NULL,
  anchor_date  TEXT NOT NULL,                              -- a real payday the rule is anchored on
  account_id   TEXT REFERENCES fin_accounts (id),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes        TEXT,
  source_kind       TEXT NOT NULL DEFAULT 'manual',
  source_name       TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant  TEXT,
  source_ref        TEXT,
  external_id       TEXT,
  demo              INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_fin_income_external ON fin_income_plans (source_name, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE fin_reimbursements (
  id               TEXT PRIMARY KEY,
  description      TEXT NOT NULL,
  amount_minor     INTEGER NOT NULL,
  payer            TEXT,
  claimed_on       TEXT,
  expected_date    TEXT,
  status           TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'received', 'written_off')),
  expense_txn_id   TEXT,
  received_txn_id  TEXT,
  source_kind       TEXT NOT NULL DEFAULT 'manual',
  source_name       TEXT NOT NULL DEFAULT 'Orbis',
  source_assistant  TEXT,
  source_ref        TEXT,
  external_id       TEXT,
  demo              INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_fin_reimb_external ON fin_reimbursements (source_name, external_id) WHERE external_id IS NOT NULL;

INSERT INTO fin_categories (id, name, kind, sort_order) VALUES
  ('fcat_housing','Housing','expense',0),
  ('fcat_groceries','Groceries','expense',1),
  ('fcat_transport','Transport','expense',2),
  ('fcat_utilities','Utilities','expense',3),
  ('fcat_dining','Dining out','expense',4),
  ('fcat_health','Health','expense',5),
  ('fcat_insurance','Insurance','expense',6),
  ('fcat_subscriptions','Subscriptions','expense',7),
  ('fcat_entertainment','Entertainment','expense',8),
  ('fcat_personal','Personal','expense',9),
  ('fcat_fees','Fees and interest','expense',10),
  ('fcat_other','Other','expense',11),
  ('fcat_salary','Salary','income',12),
  ('fcat_other_income','Other income','income',13);

CREATE TRIGGER guard_fin_accounts_i BEFORE INSERT ON fin_accounts
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_accounts are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_accounts_u BEFORE UPDATE ON fin_accounts
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_accounts are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_accounts_d BEFORE DELETE ON fin_accounts
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_accounts are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_balances_i BEFORE INSERT ON fin_balances
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_balances are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_balances_u BEFORE UPDATE ON fin_balances
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_balances are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_balances_d BEFORE DELETE ON fin_balances
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_balances are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_categories_i BEFORE INSERT ON fin_categories
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_categories are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_categories_u BEFORE UPDATE ON fin_categories
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_categories are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_categories_d BEFORE DELETE ON fin_categories
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_categories are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_transactions_i BEFORE INSERT ON fin_transactions
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_transactions are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_transactions_u BEFORE UPDATE ON fin_transactions
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_transactions are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_transactions_d BEFORE DELETE ON fin_transactions
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_transactions are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_bills_i BEFORE INSERT ON fin_bills
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_bills are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_bills_u BEFORE UPDATE ON fin_bills
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_bills are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_bills_d BEFORE DELETE ON fin_bills
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_bills are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_bill_payments_i BEFORE INSERT ON fin_bill_payments
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_bill_payments are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_bill_payments_u BEFORE UPDATE ON fin_bill_payments
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_bill_payments are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_bill_payments_d BEFORE DELETE ON fin_bill_payments
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_bill_payments are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_budgets_i BEFORE INSERT ON fin_budgets
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_budgets are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_budgets_u BEFORE UPDATE ON fin_budgets
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_budgets are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_budgets_d BEFORE DELETE ON fin_budgets
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_budgets are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_income_plans_i BEFORE INSERT ON fin_income_plans
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_income_plans are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_income_plans_u BEFORE UPDATE ON fin_income_plans
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_income_plans are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_income_plans_d BEFORE DELETE ON fin_income_plans
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_income_plans are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_reimbursements_i BEFORE INSERT ON fin_reimbursements
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_reimbursements are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_reimbursements_u BEFORE UPDATE ON fin_reimbursements
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_reimbursements are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

CREATE TRIGGER guard_fin_reimbursements_d BEFORE DELETE ON fin_reimbursements
WHEN (SELECT open FROM write_gate WHERE id = 1) != 1
BEGIN SELECT RAISE(ABORT, 'Direct writes to fin_reimbursements are blocked. Use the Orbis REST or MCP service, or add a request to assistant_inbox.'); END;

