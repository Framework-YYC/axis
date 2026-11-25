import type { ModuleId } from "./modules";

export type AddKind = "task" | "goal" | "habit" | "event" | "txn" | "bill" | "reimb" | "proc";
const ORDER: AddKind[] = ["task", "goal", "habit", "event", "txn", "bill", "reimb", "proc"];

/** Where the person is decides what Quick Add offers first and which module a new record starts in. Pure, so it is tested. */
export function addContext(pathname: string, search: string): { first: AddKind[]; module?: ModuleId } {
  const tab = new URLSearchParams(search).get("tab");
  const mod = pathname.startsWith("/m/") ? pathname.slice(3).split("/")[0] : "";
  if (mod === "personal" || mod === "daily" || mod === "health") {
    const health = mod === "health" || tab === "health";
    const first: AddKind[] = tab === "habits" || health ? ["habit", "task", "goal", "event"] : tab === "goals" ? ["goal", "task", "habit", "event"] : tab === "calendar" || tab === "appointments" ? ["event", "task", "goal", "habit"] : ["task", "habit", "event", "goal"];
    return { first, module: health ? "health" : "daily" };
  }
  if (mod === "financial") return { first: tab === "bills" ? ["bill", "txn", "reimb", "task"] : tab === "accounts" ? ["txn", "bill", "task", "goal"] : ["txn", "bill", "reimb", "task"], module: "financial" };
  if (mod === "progressive") return { first: tab === "procurement" ? ["proc", "task", "event", "goal"] : ["task", "proc", "event", "goal"], module: "progressive" };
  if (mod === "framework") return { first: ["task", "goal", "event", "habit"], module: "framework" };
  if (pathname.startsWith("/calendar")) return { first: ["event", "task", "goal", "habit"] };
  if (pathname.startsWith("/goals")) return { first: ["goal", "habit", "task", "event"] };
  return { first: ["task", "event", "goal", "txn"] };
}
export const orderedKinds = (first: AddKind[]): AddKind[] => [...first, ...ORDER.filter((k) => !first.includes(k))];

