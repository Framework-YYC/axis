import { describeRecurrence } from "../../shared/recurrence";
import { TOPIC_LABEL, type Topic } from "../../shared/taskTypes";
import { priorityLevel } from "../../shared/taskViews";
import { pretty } from "./dates";
import type { Task } from "./types";

export const isOpen = (t: Task) => t.status !== "completed" && !t.archivedAt;
/** Highest priority first, then earliest due time. */
export const byUrgency = (a: Task, b: Task) => priorityLevel(b.priority) - priorityLevel(a.priority) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9");

/** The one-line detail under a task: delivery arrival or topic, and the recurrence. Facts only; never a source reference or identifier. */
export function taskDetail(t: Task): string | undefined {
  const bits: string[] = [];
  if (t.topic === "delivery") {
    bits.push(t.relatedDate ? `Arrives ${pretty(t.relatedDate)}${t.relatedTime ? ` ${t.relatedTime}` : ""}` : "Arrival date not confirmed");
    if (t.supplier) bits.push(t.supplier);
  } else if (t.topic) bits.push(TOPIC_LABEL[t.topic as Topic] ?? t.topic);
  if (t.recurrence) bits.push(describeRecurrence(t.recurrence));
  return bits.length ? bits.join(" · ") : undefined;
}
