import { MODULE_IDS, assistantLabel, isModule, type ModuleId } from "../../shared/modules";
import type { Actor } from "./types";

/**
 * Each of the five ChatGPT assistants acts as its own identity, confined to its own module.
 * Over the Cloudflare/SQL path the `assistant` column of a request is self-declared (the connection does not identify the project),
 * so this confinement is a guardrail against mistakes, not proof of identity. Real per-assistant credentials need the OAuth/MCP path.
 */
export function assistantActor(assistant: ModuleId): Actor {
  return {
    type: "integration",
    id: `asst_${assistant}`,
    label: assistantLabel(assistant),
    channel: "inbox",
    assistant,
    modules: new Set([assistant]),
    // Only the Financial assistant may use the finance operations (every finance operation also refuses any other module).
    scopes: new Set(["tasks:read", "tasks:write", "goals:read", "goals:write", "habits:read", "habits:write", "calendar:read", "calendar:write", "briefing:read", ...(assistant === "financial" ? ["finance:read", "finance:write"] : [])]),
  };
}

export const assistantIdOf = (actorId: string): ModuleId | null => {
  const m = /^asst_(\w+)$/.exec(actorId);
  return m && isModule(m[1]) ? (m[1] as ModuleId) : null;
};
export { MODULE_IDS };
