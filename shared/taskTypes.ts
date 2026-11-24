import { addDays } from "./rotation";

export const TASK_TYPES = ["manual", "recurring", "action_item"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_TYPE_LABEL: Record<TaskType, string> = { manual: "Manual", recurring: "Recurring", action_item: "Action item" };

export const TOPICS = ["mention", "materials", "delivery", "equipment", "coordination", "hse", "reporting", "meeting", "follow_up", "other"] as const;
export type Topic = (typeof TOPICS)[number];
export const TOPIC_LABEL: Record<Topic, string> = {
  mention: "Mention", materials: "Materials", delivery: "Delivery", equipment: "Equipment", coordination: "Coordination", hse: "HSE", reporting: "Reporting", meeting: "Meeting", follow_up: "Follow-up", other: "Other",
};

/** The effective type of a task. Stored when known; otherwise derived so existing rows need no rewrite. */
export function effectiveType(r: { recurrence: unknown; task_type: string | null; source_kind: string }): TaskType {
  if (r.recurrence) return "recurring";
  if (r.task_type === "action_item" || r.task_type === "manual") return r.task_type;
  return r.source_kind === "manual" ? "manual" : "action_item";
}

export interface DeliveryDeadline { dueDate: string; dueTime: string | null; basis: "arrival_time" | "arrival_date" }

/**
 * REEF deliveries must be notified at least 24 hours before arrival.
 * - Arrival time known: the same wall-clock time on the previous day.
 * - Only the date known: the earliest the delivery could arrive is the start of that day, so the notification is due by the end of the day before the previous day (nothing is assumed about the arrival time).
 * - No arrival date: no deadline at all (callers must not invent one).
 */
export function deliveryDeadline(arrivalDate: string | null | undefined, arrivalTime?: string | null): DeliveryDeadline | null {
  if (!arrivalDate) return null;
  if (arrivalTime) return { dueDate: addDays(arrivalDate, -1), dueTime: arrivalTime, basis: "arrival_time" };
  return { dueDate: addDays(arrivalDate, -2), dueTime: null, basis: "arrival_date" };
}
