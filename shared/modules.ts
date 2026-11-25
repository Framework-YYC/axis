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
/** INTERNAL identity of an assistant: stored as the actor label (and source name) on every record it files, so it must never change. */
export const assistantLabel = (id: ModuleId) => `ChatGPT: ${MODULES_META[id].assistant} assistant`;
/** What a person sees. Display only: the Work assistant is now called Datum; module ids and stored labels are unchanged. */
export const ASSISTANT_DISPLAY: Partial<Record<ModuleId, string>> = { progressive: "Datum" };
export const assistantShortName = (id: ModuleId) => ASSISTANT_DISPLAY[id] ?? MODULES_META[id].assistant;
/** The assistant's name in a sentence ("the Datum assistant", "the Daily assistant"). */
export const assistantName = (id: ModuleId) => ASSISTANT_DISPLAY[id] ?? MODULES_META[id].label;
/** For a stored value of unknown type: the display name when it is a module id, otherwise the value itself. */
export const assistantNameOf = (v: string): string => (isModule(v) ? assistantName(v) : v);
export const assistantDisplayLabel = (id: ModuleId) => `ChatGPT: ${assistantShortName(id)} assistant`;
/** Maps a stored actor label to its display form (only the renamed assistants change). */
export const shownActor = (label: string): string => { for (const id of Object.keys(ASSISTANT_DISPLAY) as ModuleId[]) if (label === assistantLabel(id)) return assistantDisplayLabel(id); return label; };

/** Every screen a module can show, and the ones each module leads with. Only screens that exist and work. The rest sit under the tab bar's More menu. */
export type TabId = "overview" | "tasks" | "goals" | "habits" | "calendar" | "progress" | "procurement" | "transactions" | "bills" | "accounts" | "budgets" | "reports" | "briefing" | "activity" | "metrics";
export const ALL_TABS: readonly TabId[] = ["overview", "tasks", "progress", "procurement", "transactions", "bills", "accounts", "goals", "budgets", "habits", "calendar", "reports", "briefing", "activity", "metrics"];
export const PRIMARY_TABS: Record<ModuleId, readonly TabId[]> = {
  daily: ["overview", "tasks", "goals", "calendar"],
  health: ["overview", "tasks", "goals", "habits"],
  financial: ["overview", "transactions", "bills", "accounts"],
  framework: ["overview", "tasks", "goals"],
  progressive: ["overview", "tasks", "progress", "procurement"],
};
/** Screens that exist only for some modules (Work tracks deliverables and procurement). */
export const MODULE_ONLY_TABS: Partial<Record<TabId, ModuleId>> = { progress: "progressive", procurement: "progressive", transactions: "financial", bills: "financial", accounts: "financial", budgets: "financial", reports: "financial" };
/** The permanent navigation order: Home, then the five modules. */
export const DESTINATION_ORDER = ["home", "daily", "health", "financial", "framework", "progressive"] as const;
