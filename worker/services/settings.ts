import { auditStmt } from "./audit";
import { write } from "./db";
import { validTimezone } from "./prefs";
import { fail, ok, type Ctx, type Result } from "./types";
import * as v from "./validate";

const KEYS: Record<string, (value: unknown) => string> = {
  timezone: (x) => { if (x === "auto") return "auto"; if (typeof x !== "string" || !validTimezone(x)) throw new v.InvalidInput("timezone must be 'auto' or a valid IANA timezone"); return x; },
  week_start: (x) => { if (x !== "monday" && x !== "sunday") throw new v.InvalidInput("week_start must be monday or sunday"); return x; },
  unit_system: (x) => { if (x !== "metric" && x !== "imperial") throw new v.InvalidInput("unit_system must be metric or imperial"); return x; },
  currency: (x) => { if (typeof x !== "string" || !/^[A-Z]{3}$/.test(x)) throw new v.InvalidInput("currency must be a 3-letter code"); return x; },
  theme: (x) => { if (x !== "system" && x !== "light" && x !== "dark") throw new v.InvalidInput("theme must be system, light or dark"); return x; },
  work_rotation: (x) => {
    const o = typeof x === "string" ? JSON.parse(x) : x;
    if (!o || typeof o !== "object") throw new v.InvalidInput("work_rotation must be an object");
    const r = o as Record<string, unknown>;
    v.date(r.anchorDate, "anchorDate", false);
    if (!Number.isInteger(r.onDays) || (r.onDays as number) < 1 || (r.onDays as number) > 120 || !Number.isInteger(r.offDays) || (r.offDays as number) < 0 || (r.offDays as number) > 120) throw new v.InvalidInput("onDays 1..120 and offDays 0..120 are required");
    return JSON.stringify({ anchorDate: r.anchorDate, onDays: r.onDays, offDays: r.offDays });
  },
};

export async function getSettings(ctx: Ctx): Promise<Result<Record<string, unknown>>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can read settings");
  const { results } = await ctx.db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const out: Record<string, unknown> = {};
  for (const r of results) { try { out[r.key] = r.key === "work_rotation" ? JSON.parse(r.value) : r.value; } catch { out[r.key] = r.value; } }
  return ok(out);
}

export async function setSetting(ctx: Ctx, raw: unknown): Promise<Result<{ key: string }>> {
  if (ctx.actor.type !== "user") return fail("forbidden", "Only the owner can change settings");
  try {
    const i = v.obj(raw, "input");
    const key = v.text(i.key, "key", { max: 40 })!;
    const check = KEYS[key];
    if (!check) return fail("invalid_input", `Unknown setting. Known: ${Object.keys(KEYS).join(", ")}`);
    const value = check(i.value);
    await write(ctx.db, [
      ctx.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, value, ctx.now().toISOString()),
      auditStmt(ctx, "settings.update", "setting", key),
    ]);
    ctx.prefs = undefined;
    return ok({ key });
  } catch (e) {
    if (e instanceof v.InvalidInput) return fail("invalid_input", e.message);
    if (e instanceof SyntaxError) return fail("invalid_input", "value is not valid JSON");
    throw e;
  }
}
