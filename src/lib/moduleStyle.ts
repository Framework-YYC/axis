import { Briefcase, HardHat, HeartPulse, type LucideIcon, Sun, UserRound, Wallet } from "lucide-react";
import type { ModuleId, NavModuleId } from "../../shared/modules";

export const ASSISTANT_ICONS: Record<ModuleId, LucideIcon> = { daily: Sun, health: HeartPulse, financial: Wallet, framework: Briefcase, progressive: HardHat };
/** The module's accent colour (a CSS variable that has a light and a dark value). */
export const accent = (m: ModuleId) => `var(--m-${m})`;
/** Short phone labels. */
export const SHORT: Record<ModuleId, string> = { daily: "Daily", health: "Health", financial: "Finance", framework: "Framework", progressive: "Work" };
/** Icons of the four navigable screens. Personal groups Daily and Health. */
export const NAV_ICONS: Record<NavModuleId, LucideIcon> = { personal: UserRound, financial: Wallet, framework: Briefcase, progressive: HardHat };
/** Accent of a navigable screen (Personal uses the Daily accent). */
export const navAccent = (m: NavModuleId) => `var(--m-${m === "personal" ? "daily" : m})`;
