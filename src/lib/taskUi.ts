import { priorityLevel } from "../../shared/taskViews";
import type { Task } from "./types";

export const isOpen = (t: Task) => t.status !== "completed" && !t.archivedAt;
/** Highest priority first, then earliest due time. */
export const byUrgency = (a: Task, b: Task) => priorityLevel(b.priority) - priorityLevel(a.priority) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9");
