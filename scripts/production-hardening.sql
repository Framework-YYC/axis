-- Run after migrations on the PRODUCTION database only (idempotent). Not a migration: staging and development keep the assistant inbox.
-- Closes the SQL-fed write path completely: no connection that can run SQL may add a request to assistant_inbox.
-- Production assistants write only through the REST/MCP service with a scoped, module-confined, revocable token.
CREATE TRIGGER IF NOT EXISTS prod_assistant_inbox_closed BEFORE INSERT ON assistant_inbox
BEGIN SELECT RAISE(ABORT, 'assistant_inbox is closed in production. Use the Axis REST or MCP service with a scoped token.'); END;
