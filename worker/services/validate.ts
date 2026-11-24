/** Small strict validators. Anything arriving from a client, an assistant or an import is untrusted. */
export class InvalidInput extends Error {}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function text(v: unknown, name: string, opts: { max: number; optional?: boolean; allowNewlines?: boolean } ): string | undefined {
  if (v === undefined || v === null) {
    if (opts.optional) return undefined;
    throw new InvalidInput(`${name} is required`);
  }
  if (typeof v !== "string") throw new InvalidInput(`${name} must be a string`);
  const cleaned = (opts.allowNewlines ? v : v.replace(/[\r\n\t]+/g, " ")).replace(CONTROL, "").trim();
  if (!cleaned) {
    if (opts.optional) return undefined;
    throw new InvalidInput(`${name} must not be empty`);
  }
  if (cleaned.length > opts.max) throw new InvalidInput(`${name} is longer than ${opts.max} characters`);
  return cleaned;
}

export function date(v: unknown, name: string, optional = true): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (optional) return undefined;
    throw new InvalidInput(`${name} is required`);
  }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new InvalidInput(`${name} must be a real date as YYYY-MM-DD`);
  }
  return v;
}

export function oneOf<T extends string>(v: unknown, name: string, list: readonly T[], fallback?: T): T | undefined {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" || !list.includes(v as T)) throw new InvalidInput(`${name} must be one of: ${list.join(", ")}`);
  return v as T;
}

export function stringList<T extends string>(v: unknown, name: string, list: readonly T[]): T[] | undefined {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => oneOf(x, name, list) as T);
}

export function int(v: unknown, name: string, opts: { min: number; max: number; fallback: number }): number {
  if (v === undefined || v === null) return opts.fallback;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < opts.min || n > opts.max) throw new InvalidInput(`${name} must be an integer ${opts.min}..${opts.max}`);
  return n;
}

export function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new InvalidInput(`${name} must be an object`);
  return v as Record<string, unknown>;
}

export function bool(v: unknown, name: string): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new InvalidInput(`${name} must be true or false`);
}

import { validateRecurrence, type Recurrence } from "../../shared/recurrence";
import { MODULE_IDS, type ModuleId } from "../../shared/modules";

export function time(v: unknown, name: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new InvalidInput(`${name} must be a 24-hour time HH:MM`);
  return v;
}

export function num(v: unknown, name: string, opts: { min?: number; max?: number } = {}): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new InvalidInput(`${name} must be a number`);
  if ((opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) throw new InvalidInput(`${name} must be between ${opts.min ?? "-inf"} and ${opts.max ?? "inf"}`);
  return n;
}

export function moduleId(v: unknown, name = "module"): ModuleId | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !(MODULE_IDS as readonly string[]).includes(v)) throw new InvalidInput(`${name} must be one of: ${MODULE_IDS.join(", ")}`);
  return v as ModuleId;
}

export function recurrence(v: unknown): Recurrence | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  try { return validateRecurrence(v); } catch (e) { throw new InvalidInput(e instanceof RangeError ? e.message : "invalid recurrence"); }
}

export function weekdays(v: unknown, name: string): number[] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!Array.isArray(v) || v.length === 0 || v.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new InvalidInput(`${name} must list weekdays 0 (Sunday) to 6`);
  return [...new Set(v as number[])].sort();
}
