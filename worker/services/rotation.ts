import { nextOccurrence, type Recurrence } from "../../shared/recurrence";
import { ROTATION_CONFIRMED_THROUGH, rotationStatus, type RotationConfig } from "../../shared/rotation";
import { auditStmt } from "./audit";
import { write } from "./db";
import { prefsOf, todayIn } from "./prefs";
import { eventStmt } from "./tasks";
import { SCOPES, type Ctx } from "./types";

export interface RealignedTask { id: string; title: string; from: string; to: string; /** The new date is beyond the last date confirmed from the owner's calendar. */ unconfirmed: boolean }

interface OpenRow { id: string; title: string; due_date: string; recurrence: string; recurrence_parent_id: string | null }

/** Orbis itself, acting for the owner: used only for this housekeeping so the audit trail says what changed and why. */
const systemActor = () => ({ type: "user" as const, id: "owner", label: "Orbis (rotation update)", scopes: new Set<string>(SCOPES), channel: "web" as const });

/**
 * Brings open occurrences of rotation-dependent recurring tasks in line with the current rotation.
 * It recomputes each open occurrence exactly the way completing the previous one would have (same rule, same previous date, same rotation), so the result is
 * the one the schedule would have produced. Scope is deliberately narrow:
 *  - only open, not-yet-overdue occurrences of rules marked "on rotation" (every other task keeps its date);
 *  - completed occurrences and their history are never touched;
 *  - a move that would collide with another occurrence of the same series is skipped.
 * Idempotent: a second run changes nothing.
 */
export async function realignRotationTasks(db: D1Database, now = new Date(), cfgOverride?: RotationConfig): Promise<RealignedTask[]> {
  const ctx: Ctx = { db, actor: systemActor(), requestId: `rotation-${now.getTime()}`, now: () => now };
  const prefs = await prefsOf(ctx);
  const cfg = cfgOverride ?? prefs.rotation;
  const today = todayIn(prefs.timezone, now);
  const { results } = await db.prepare("SELECT id, title, due_date, recurrence, recurrence_parent_id FROM tasks WHERE status != 'completed' AND archived_at IS NULL AND due_date IS NOT NULL AND due_date >= ? AND recurrence LIKE '%\"rotation\":\"on\"%'").bind(today).all<OpenRow>();
  const moved: RealignedTask[] = [];
  for (const t of results) {
    let rule: Recurrence;
    try { rule = JSON.parse(t.recurrence); } catch { continue; }
    if (rule.rotation !== "on") continue;
    const root = t.recurrence_parent_id ?? t.id;
    const prev = await db.prepare("SELECT due_date, completed_at FROM tasks WHERE (id = ? OR recurrence_parent_id = ?) AND id != ? AND status = 'completed' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1").bind(root, root, t.id).first<{ due_date: string | null; completed_at: string }>();
    let to: string | null;
    if (prev) {
      const doneOn = todayIn(prefs.timezone, new Date(prev.completed_at));
      to = nextOccurrence(rule, prev.due_date ?? doneOn, doneOn, cfg);
    } else {
      // The first occurrence of a series has no predecessor: it can only move forward, off a rotation-off day.
      to = rotationStatus(t.due_date, cfg).phase === "on" ? t.due_date : nextOccurrence(rule, addOneBack(t.due_date), addOneBack(t.due_date), cfg);
    }
    if (!to || to === t.due_date || to < today) continue;
    const clash = await db.prepare("SELECT 1 FROM tasks WHERE id != ? AND (recurrence_parent_id = ? OR id = ?) AND due_date = ? AND archived_at IS NULL").bind(t.id, root, root, to).first();
    if (clash) continue;
    await write(db, [
      db.prepare("UPDATE tasks SET due_date = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND status != 'completed'").bind(to, now.toISOString(), ctx.actor.label, t.id),
      eventStmt(ctx, t.id, "updated", ["dueDate"]),
      auditStmt(ctx, "task.update", "task", t.id),
    ]);
    moved.push({ id: t.id, title: t.title, from: t.due_date, to, unconfirmed: to > ROTATION_CONFIRMED_THROUGH });
  }
  return moved;
}
const addOneBack = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Runs the realignment once for each distinct rotation setting (the applied setting is remembered), so a corrected or edited rotation
 * takes effect on its own the next time the app is opened or the maintenance tick runs. Cheap when nothing changed (one small read).
 */
export async function ensureRotationAligned(db: D1Database, now = new Date()): Promise<RealignedTask[] | null> {
  const ctx: Ctx = { db, actor: systemActor(), requestId: `rotation-check-${now.getTime()}`, now: () => now };
  const cfg = (await prefsOf(ctx)).rotation;
  const fingerprint = JSON.stringify([cfg.anchorDate, cfg.onDays, cfg.offDays]);
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'rotation_aligned'").first<{ value: string }>();
  if (row?.value === fingerprint) return null;
  const moved = await realignRotationTasks(db, now, cfg);
  await write(db, [db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('rotation_aligned', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(fingerprint, now.toISOString())]);
  return moved;
}
