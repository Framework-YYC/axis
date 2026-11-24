/** The five assistant modules. One shared database; the module is a field on every record, not a separate store. */
export const MODULE_IDS = ["daily", "health", "financial", "framework", "progressive"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleMeta { id: ModuleId; label: string; assistant: string; blurb: string }
export const MODULES_META: Record<ModuleId, ModuleMeta> = {
  daily: { id: "daily", label: "Daily", assistant: "Daily", blurb: "Personal administration, appointments, errands and reminders" },
  health: { id: "health", label: "Health", assistant: "Health", blurb: "Fitness, body composition, nutrition, hydration and supplements" },
  financial: { id: "financial", label: "Finance", assistant: "Financial", blurb: "Income, expenses, budgeting, debt, bills and savings" },
  framework: { id: "framework", label: "Framework", assistant: "Framework", blurb: "Business operations, clients, software and growth" },
  progressive: { id: "progressive", label: "Work", assistant: "Progressive", blurb: "Project coordination, procurement, scheduling and HSE" },
};

export const isModule = (v: unknown): v is ModuleId => typeof v === "string" && (MODULE_IDS as readonly string[]).includes(v);
export const moduleLabel = (id: string) => (isModule(id) ? MODULES_META[id].label : id);
/** Display label of the actor an assistant acts as. */
export const assistantLabel = (id: ModuleId) => `ChatGPT: ${MODULES_META[id].assistant} assistant`;

/** Every screen a module can show, and the ones each module leads with. Only screens that exist and work. The rest sit under the tab bar's More menu. */
export type TabId = "overview" | "tasks" | "goals" | "habits" | "calendar" | "recurring" | "actions" | "briefing" | "activity" | "metrics";
export const ALL_TABS: readonly TabId[] = ["overview", "tasks", "recurring", "actions", "goals", "habits", "calendar", "briefing", "activity", "metrics"];
export const PRIMARY_TABS: Record<ModuleId, readonly TabId[]> = {
  daily: ["overview", "tasks", "goals", "calendar"],
  health: ["overview", "tasks", "goals", "habits"],
  financial: ["overview", "tasks", "goals"],
  framework: ["overview", "tasks", "goals"],
  progressive: ["overview", "tasks", "recurring", "actions"],
};
/** The permanent navigation order: Home, then the five modules. */
export const DESTINATION_ORDER = ["home", "daily", "health", "financial", "framework", "progressive"] as const;
