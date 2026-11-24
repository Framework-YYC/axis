/**
 * Import envelope (design for Phase 3+). Everything that arrives from outside the app (ChatGPT exports, Apple Shortcuts,
 * a future HealthKit companion, CSV) is wrapped in this shape, stored as a PENDING batch, and only becomes real records
 * after the owner reviews and approves it. Nothing here calls an AI service; the app works without one.
 */
export const IMPORT_SCHEMA = "axis.import.v1";
export const MAX_ITEMS = 500;

export const SOURCE_KINDS = ["chatgpt", "shortcut", "healthkit", "csv", "manual"] as const;
export const ITEM_TYPES = ["task", "transaction", "health_metric", "event", "briefing", "completion"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type ItemType = (typeof ITEM_TYPES)[number];

export interface ImportItem {
  type: ItemType;
  /** The sender's own stable id, when it has one. Strongest duplicate signal. */
  externalId?: string;
  data: Record<string, unknown>;
}
export interface ImportEnvelope {
  schema: typeof IMPORT_SCHEMA;
  source: { kind: SourceKind; name: string; reference?: string };
  generatedAt: string;
  items: ImportItem[];
}

export type Validation = { ok: true; envelope: ImportEnvelope } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateEnvelope(input: unknown): Validation {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["body must be an object"] };
  if (input.schema !== IMPORT_SCHEMA) errors.push(`schema must be "${IMPORT_SCHEMA}"`);
  const src = input.source;
  if (!isObj(src) || !SOURCE_KINDS.includes(src.kind as SourceKind) || typeof src.name !== "string" || !src.name.trim() || src.name.length > 80) {
    errors.push("source.kind/name invalid");
  }
  if (typeof input.generatedAt !== "string" || Number.isNaN(Date.parse(input.generatedAt))) errors.push("generatedAt must be an ISO date-time");
  if (!Array.isArray(input.items)) errors.push("items must be an array");
  else {
    if (input.items.length === 0) errors.push("items is empty");
    if (input.items.length > MAX_ITEMS) errors.push(`at most ${MAX_ITEMS} items per batch`);
    input.items.slice(0, MAX_ITEMS).forEach((it, i) => {
      if (!isObj(it) || !ITEM_TYPES.includes(it.type as ItemType) || !isObj(it.data)) errors.push(`items[${i}] invalid`);
      else if (it.externalId !== undefined && (typeof it.externalId !== "string" || it.externalId.length > 200)) errors.push(`items[${i}].externalId invalid`);
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, envelope: input as unknown as ImportEnvelope };
}

export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Stable duplicate key. Same sender id wins; otherwise a hash of the normalised content. Re-importing the same item yields the same key. */
export async function dedupeKey(source: ImportEnvelope["source"], item: ImportItem): Promise<string> {
  const basis = item.externalId ? `${source.kind}:${source.name}:${item.type}:${item.externalId}` : `content:${item.type}:${canonical(item.data)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
