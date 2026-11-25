import { addDays } from "./rotation";
import { deliveryDeadline } from "./taskTypes";

export const STAGES = ["requested", "ordered", "in_transit", "notified", "received"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { requested: "Requested", ordered: "Ordered", in_transit: "In transit", notified: "Notification sent", received: "Received" };
export const stageIndex = (s: string): number => STAGES.indexOf(s as Stage);

export interface ProcItemLike { status: string; expectedDate: string | null; expectedTime: string | null; supplier: string | null; orderRef: string | null }

/** The stage people see: an ordered or in-transit item whose 24-hour REEF notification task is done reads as "notification sent". */
export function effectiveStage(status: string, notificationDone: boolean): Stage {
  const s = (STAGES as readonly string[]).includes(status) ? (status as Stage) : "requested";
  return (s === "ordered" || s === "in_transit") && notificationDone ? "notified" : s;
}

export interface Outstanding { text: string; tone: "bad" | "warn" | "neutral"; by?: string }
/** What still needs doing for an item, in words. Nothing is invented: no date means "confirm the delivery date", never a guessed deadline. */
export function outstandingAction(i: ProcItemLike, stage: Stage, today: string): Outstanding | null {
  if (stage === "received") return null;
  const deadline = deliveryDeadline(i.expectedDate, i.expectedTime);
  if (stage === "requested") return { text: i.supplier ? "Place the order" : "Choose a supplier and order", tone: "neutral" };
  if (!i.expectedDate) return { text: "Confirm the delivery date", tone: "warn" };
  if (stage === "notified") return i.expectedDate < today ? { text: "Confirm receipt", tone: "bad" } : { text: `Awaiting delivery ${i.expectedDate}`, tone: "neutral" };
  const by = deadline!.dueDate;
  if (by < today) return { text: "Send REEF notification now (overdue)", tone: "bad", by };
  return { text: by === today ? "Send REEF notification today" : `Send REEF notification by ${by}${deadline!.dueTime ? ` ${deadline!.dueTime}` : ""}`, tone: by <= addDays(today, 2) ? "warn" : "neutral", by };
}
