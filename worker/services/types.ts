import type { ModuleId } from "../../shared/modules";

export const SCOPES = [
  "dashboard:read", "tasks:read", "tasks:write",
  "finance:read", "finance:write", "health:read", "health:write",
  "goals:read", "goals:write", "habits:read", "habits:write", "calendar:read", "calendar:write", "briefing:read",
  "intelligence:read", "intelligence:write", "activity:read",
] as const;
export type Scope = (typeof SCOPES)[number];

/** inbox = a request an assistant added to assistant_inbox and Axis applied through the service layer. */
export type Channel = "web" | "rest" | "mcp" | "inbox";

export interface Actor {
  type: "user" | "integration";
  /** 'owner' for the signed-in owner, otherwise the integration id. */
  id: string;
  /** Human-readable origin, e.g. "Owner" or "ChatGPT: Personal assistant". Stored on records and the audit trail. */
  label: string;
  scopes: ReadonlySet<string>;
  channel: Channel;
  /** Modules this actor may read or change. Undefined = all (the owner). Enforced by every service, so REST, MCP and the inbox behave alike. */
  modules?: ReadonlySet<string>;
  /** Set when the actor is one of the five assistants; recorded as the source of records it creates. */
  assistant?: ModuleId;
}

export interface Ctx {
  db: D1Database;
  /** Cached per request by prefs.ts. */
  prefs?: import("./prefs").Prefs;
  actor: Actor;
  requestId: string;
  now: () => Date;
  /** Set only while the owner is executing an approved pending action. */
  approved?: boolean;
}

export type ErrorCode =
  | "invalid_input" | "not_found" | "forbidden" | "conflict" | "idempotency_conflict" | "approval_required" | "internal_error";

export type Result<T> =
  | { ok: true; data: T; duplicate?: boolean }
  | { ok: false; error: { code: ErrorCode; message: string; approvalId?: string } };

export const ok = <T>(data: T, extra: { duplicate?: boolean } = {}): Result<T> => ({ ok: true, data, ...extra });
export const fail = (code: ErrorCode, message: string, approvalId?: string): Result<never> => ({
  ok: false,
  error: { code, message, ...(approvalId ? { approvalId } : {}) },
});

export function ownerActor(channel: Channel = "web"): Actor {
  return { type: "user", id: "owner", label: "Owner", scopes: new Set<string>(SCOPES), channel };
}
