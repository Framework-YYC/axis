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
export type TabId = "overview" | "tasks" | "goals" | "habits" | "calendar" | "progress" | "procurement" | "transactions" | "bills" | "accounts" | "budgets" | "reports" | "briefing" | "activity" | "metrics" | "health" | "appointments";
export const ALL_TABS: readonly TabId[] = ["overview", "tasks", "health", "progress", "procurement", "transactions", "bills", "accounts", "goals", "budgets", "habits", "appointments", "calendar", "reports", "briefing", "activity", "metrics"];

/**
 * What a person navigates. Daily and Health are two assistants (internal module ids, data and integrations stay separate) but one screen: Personal.
 * This is an interface grouping only: records keep their own `module` field.
 */
export const NAV_MODULE_IDS = ["personal", "financial", "framework", "progressive"] as const;
export type NavModuleId = (typeof NAV_MODULE_IDS)[number];
export const NAV_MEMBERS: Record<NavModuleId, readonly ModuleId[]> = { personal: ["daily", "health"], financial: ["financial"], framework: ["framework"], progressive: ["progressive"] };
export const NAV_META: Record<NavModuleId, { label: string; blurb: string }> = {
  personal: { label: "Personal", blurb: "Daily life, appointments, health, fitness and habits" },
  financial: { label: MODULES_META.financial.label, blurb: MODULES_META.financial.blurb },
  framework: { label: MODULES_META.framework.label, blurb: MODULES_META.framework.blurb },
  progressive: { label: MODULES_META.progressive.label, blurb: MODULES_META.progressive.blurb },
};
export const isNavModule = (v: unknown): v is NavModuleId => typeof v === "string" && (NAV_MODULE_IDS as readonly string[]).includes(v);
/** The screen group a record's module belongs to. */
export const navModuleOf = (id: ModuleId): NavModuleId => (id === "daily" || id === "health" ? "personal" : id);
/** Old deep links (/m/daily, /m/health) land on Personal; Health opens its own tab. */
export const legacyModuleRoute = (id: string): { module: NavModuleId; tab?: TabId } | null => (id === "daily" ? { module: "personal" } : id === "health" ? { module: "personal", tab: "health" } : null);

export const PRIMARY_TABS: Record<NavModuleId, readonly TabId[]> = {
  personal: ["overview", "tasks", "health", "habits"],
  financial: ["overview", "transactions", "bills", "accounts"],
  framework: ["overview", "tasks", "goals"],
  progressive: ["overview", "tasks", "progress", "procurement"],
};
/** Personal's More menu is exactly these four; the other modules list whatever else applies to them. */
export const MORE_TABS: Partial<Record<NavModuleId, readonly TabId[]>> = { personal: ["goals", "appointments", "calendar", "activity"] };
/** Screens that exist only for some modules (Work tracks deliverables and procurement; Personal has Health and Appointments). */
export const MODULE_ONLY_TABS: Partial<Record<TabId, NavModuleId>> = { progress: "progressive", procurement: "progressive", transactions: "financial", bills: "financial", accounts: "financial", budgets: "financial", reports: "financial", health: "personal", appointments: "personal" };

/** The phone dock: five evenly spaced positions, Orbis (the menu) in the centre. */
export const DOCK_ORDER = ["personal", "financial", "orbis", "framework", "progressive"] as const;
export type DockId = (typeof DOCK_ORDER)[number];
/** The Orbis menu, in order. */
export const ORBIS_MENU = ["home", "quick_add", "calendar", "search", "settings", "environment"] as const;
