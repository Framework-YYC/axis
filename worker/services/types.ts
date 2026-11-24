export const SCOPES = [
  "dashboard:read", "tasks:read", "tasks:write",
  "finance:read", "finance:write", "health:read", "health:write",
  "goals:read", "goals:write", "intelligence:read", "intelligence:write", "activity:read",
] as const;
export type Scope = (typeof SCOPES)[number];

export type Channel = "web" | "rest" | "mcp";

export interface Actor {
  type: "user" | "integration";
  /** 'owner' for the signed-in owner, otherwise the integration id. */
  id: string;
  /** Human-readable origin, e.g. "Owner" or "ChatGPT: Personal assistant". Stored on records and the audit trail. */
  label: string;
  scopes: ReadonlySet<string>;
  channel: Channel;
}

export interface Ctx {
  db: D1Database;
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
