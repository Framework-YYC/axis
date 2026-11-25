import { runOperation } from "./operations";
import type { Ctx } from "./types";

const ITEMS: Array<{ key: string; item: string; quantity?: string; job?: string; checked?: boolean }> = [
  { key: "demo:shopping:cable-ties", item: "Cable ties 300 mm (synthetic)", quantity: "2 packs", job: "928" },
  { key: "demo:shopping:hi-vis-tape", item: "Hi-vis tape (synthetic)", quantity: "4" },
  { key: "demo:shopping:torque-wrench-battery", item: "Batteries for torque wrench (synthetic)", job: "1011" },
  { key: "demo:shopping:marker-pens", item: "Paint markers (synthetic)", quantity: "6" },
  { key: "demo:shopping:ear-plugs", item: "Ear plugs (synthetic)", quantity: "1 box", checked: true },
  { key: "demo:shopping:duct-tape", item: "Duct tape (synthetic)" },
];

/** Six clearly synthetic shopping items for staging review. Idempotent (same keys); returns how many are new. Removed by clearDemoData (DELETE FROM shopping_items WHERE demo = 1). */
export async function loadDemoShopping(ctx: Ctx, _today?: string): Promise<number> {
  let created = 0;
  for (const it of ITEMS) {
    const r = await runOperation(ctx, "upsert_shopping_item", { key: it.key, item: it.item, ...(it.quantity ? { quantity: it.quantity } : {}), ...(it.job ? { job: it.job } : {}), ...(it.checked ? { checked: true } : {}), demo: true }) as { ok: boolean; data?: { outcome?: string } };
    if (r.ok && r.data?.outcome === "created") created++;
  }
  return created;
}
