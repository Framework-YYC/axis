/** The five assistant modules. One shared database; the module is a field on every record, not a separate store. */
export const MODULE_IDS = ["daily", "health", "financial", "framework", "progressive"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleMeta { id: ModuleId; label: string; assistant: string; blurb: string }
export const MODULES_META: Record<ModuleId, ModuleMeta> = {
  daily: { id: "daily", label: "Daily", assistant: "Daily", blurb: "Personal administration, appointments, errands and reminders" },
  health: { id: "health", label: "Health", assistant: "Health", blurb: "Fitness, body composition, nutrition, hydration and supplements" },
  financial: { id: "financial", label: "Financial", assistant: "Financial", blurb: "Income, expenses, budgeting, debt, bills and savings" },
  framework: { id: "framework", label: "Framework", assistant: "Framework", blurb: "Business operations, clients, software and growth" },
  progressive: { id: "progressive", label: "Progressive", assistant: "Progressive", blurb: "Project coordination, procurement, scheduling and HSE" },
};

export const isModule = (v: unknown): v is ModuleId => typeof v === "string" && (MODULE_IDS as readonly string[]).includes(v);
export const moduleLabel = (id: string) => (isModule(id) ? MODULES_META[id].label : id);
/** Display label of the actor an assistant acts as. */
export const assistantLabel = (id: ModuleId) => `ChatGPT: ${MODULES_META[id].assistant} assistant`;
