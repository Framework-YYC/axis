/** Work shopping list: pure helpers shared by the service, the app and the tests. */
export interface ShoppingLike { id: string; title: string; quantity: string | null; job: string | null; status: "open" | "checked"; createdAt: string; checkedAt: string | null; clearedAt: string | null }

/** Case, spacing and trailing punctuation never make two items different ("Cable ties" = "cable  ties."). */
export const normalizeTitle = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const normalizeJob = (j: string | null | undefined): string | null => { const s = (j ?? "").trim().replace(/\s+/g, " "); return s ? s : null; };

/** "2" -> {quantity: 2, unit: null}; "10 m" -> {10, "m"}; "a box" -> {null, null} (kept as a note, never guessed). */
export function parseQuantity(text: string | null | undefined): { quantity: number | null; unit: string | null } {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([^\d\s].{0,28})?\s*$/.exec(text ?? "");
  if (!m) return { quantity: null, unit: null };
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? { quantity: n, unit: m[2]?.trim() || null } : { quantity: null, unit: null };
}

/** Does an open item already stand for this one? Same normalised title, and the same job unless one side has none. */
export function sameItem(a: { title: string; job: string | null }, b: { title: string; job: string | null }): boolean {
  if (normalizeTitle(a.title) !== normalizeTitle(b.title)) return false;
  const ja = normalizeJob(a.job), jb = normalizeJob(b.job);
  return ja === null || jb === null || ja.toLowerCase() === jb.toLowerCase();
}

/** The list as shown: open items first in the order they were added, then checked items (most recently checked first). Cleared items are not part of it. */
export function orderItems<T extends ShoppingLike>(items: readonly T[]): { open: T[]; checked: T[] } {
  const live = items.filter((i) => !i.clearedAt);
  return {
    open: live.filter((i) => i.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    checked: live.filter((i) => i.status === "checked").sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "") || a.id.localeCompare(b.id)),
  };
}

export const RESTORE_WINDOW_DAYS = 7;
/** Cleared items can be brought back for a week. */
export const restorable = <T extends ShoppingLike>(items: readonly T[], nowIso: string): T[] => {
  const cutoff = new Date(new Date(nowIso).getTime() - RESTORE_WINDOW_DAYS * 86_400_000).toISOString();
  return items.filter((i) => i.clearedAt && i.clearedAt >= cutoff).sort((a, b) => (b.clearedAt ?? "").localeCompare(a.clearedAt ?? ""));
};
