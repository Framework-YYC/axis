import { assistantNameOf, shownActor } from "../../shared/modules";

/**
 * People never see integration identifiers (operation names like "task.create", actor labels like "ChatGPT: ... assistant", request ids,
 * source references). These helpers turn the stored values into plain words. The stored values themselves are unchanged.
 */
const NOUN: Record<string, string> = { task: "Task", tasks: "Tasks", goal: "Goal", habit: "Habit", event: "Event", integration: "Connection", approval: "Approval", briefing: "Briefing", milestone: "Milestone", settings: "Setting", setting: "Setting", demo: "Demo data", inbox: "Request", operation: "Request", activity: "Activity" };
const VERB: Record<string, string> = {
  create: "created", create_many: "several created", update: "updated", complete: "completed", reopen: "reopened", archive: "archived", cancel: "cancelled", progress: "progress recorded",
  log: "logged", refresh: "refreshed", revoke: "revoked", approve: "approved", reject: "declined", delete: "removed", load: "loaded", clear: "cleared", set: "changed", get: "viewed", list: "viewed", process: "processed",
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function phrase(rest: string): string {
  const many = /^(\w+)\.create_many$/.exec(rest);
  if (many) return `Several ${(NOUN[many[1]] ?? cap(many[1])).toLowerCase()}s created`;
  const [first, ...more] = rest.includes(".") ? rest.split(".") : rest.split("_");
  const dotted = rest.includes(".");
  const noun = dotted ? first : more.join("_") || first;
  const verb = dotted ? more.join("_") : more.length ? first : "";
  const n = NOUN[noun] ?? NOUN[noun.replace(/s$/, "")] ?? cap(noun.replace(/_/g, " "));
  const v = VERB[verb] ?? (verb ? verb.replace(/_/g, " ") : "");
  return v ? `${n} ${v}` : n;
}

/** "task.create" -> "Task created"; "denied:create_task" -> "Blocked: task created"; "read:list_tasks" -> "Read: tasks viewed". */
export function actionLabel(raw: string): string {
  const m = /^(denied|failed|read):(.+)$/.exec(raw);
  if (!m) return phrase(raw);
  const p = phrase(m[2]);
  return `${m[1] === "denied" ? "Blocked" : m[1] === "failed" ? "Failed" : "Read"}: ${p[0].toLowerCase()}${p.slice(1)}`;
}
/** An assistant's request ("task.create_many", "briefing.refresh") in words. */
export const requestLabel = (op: string): string => phrase(op);
export const eventLabel = (e: string): string => cap(e);

/** Who did it, in words: "via Datum" for an assistant, "by you" for the owner, otherwise the label. */
export function byLine(actor: string, via?: string | null): string {
  const m = /^ChatGPT: (.+) assistant$/.exec(shownActor(actor));
  if (m) return `via ${m[1]}`;
  if (actor === "Owner") return "by you";
  return via === "inbox" ? `${actor} via an assistant` : actor;
}
/** The name of a person or assistant for "Requested by ...". */
export function whoName(actor: string): string {
  const m = /^ChatGPT: (.+) assistant$/.exec(shownActor(actor));
  return m ? m[1] : actor === "Owner" ? "you" : actor;
}
export { assistantNameOf };
