import type { Horizon } from "../../shared/horizons";
import type { DayState } from "../../shared/habits";
import type { Recurrence } from "../../shared/recurrence";
import type { ModuleId } from "../../shared/modules";

export type { Horizon, DayState, Recurrence, ModuleId };
export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "waiting" | "completed";
export interface Source { kind: string; name: string; assistant: string | null; ref: string | null }

export interface Task {
  id: string; title: string; description: string | null; notes: string | null; module: ModuleId; category: string | null; project: string | null;
  priority: Priority; status: TaskStatus; dueDate: string | null; dueTime: string | null; scheduledDate: string | null; recurrence: Recurrence | null; recurrenceParentId: string | null;
  goalId: string | null; completedAt: string | null; archivedAt: string | null; horizon: Horizon | null; source: Source; externalId: string | null; demo: boolean;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; version: number;
  type: "manual" | "recurring" | "action_item"; trackPart: string | null; topic: string | null; relatedDate: string | null; relatedTime: string | null; supplier: string | null;
}
export interface Milestone { id: string; title: string; targetDate: string | null; targetValue: number | null; done: boolean; doneAt: string | null }
export interface Goal {
  id: string; module: ModuleId; title: string; description: string | null; kind: "numeric" | "qualitative"; term: "short" | "medium" | "long" | null; termSource: "set" | "target_date" | "none";
  targetDate: string | null; startValue: number | null; targetValue: number | null; currentValue: number | null; unit: string | null; progress: number;
  status: "active" | "paused" | "achieved" | "abandoned"; milestones: Milestone[]; source: Source; demo: boolean; archivedAt: string | null; createdAt: string; updatedAt: string; version: number;
}
export interface Habit {
  id: string; module: ModuleId; title: string; description: string | null; period: "day" | "week" | "month"; targetCount: number; targetValue: number | null; unit: string | null;
  daysOfWeek: number[] | null; rotationMode: "any" | "on" | "off" | "split"; offTargetCount: number | null; offTargetValue: number | null; offDaysOfWeek: number[] | null; startDate: string; goalId: string | null;
  status: "active" | "paused" | "archived"; today: DayState; streak: { current: number; best: number }; recent: DayState[]; source: Source; demo: boolean; version: number;
}
export interface CalEvent { id: string; module: ModuleId; title: string; description: string | null; date: string; startTime: string | null; endTime: string | null; location: string | null; status: "scheduled" | "cancelled"; source: Source; demo: boolean; version: number }
export interface Approval { id: string; summary: string; requestedBy: string; channel: string; status: string; createdAt: string }
export interface InboxRequest { id: string; assistant: ModuleId; op: string; status: string; createdAt: string; processedAt: string | null; approvalId: string | null; result: { ok?: boolean; code?: string; message?: string; id?: string | null; duplicate?: boolean } | null }
export interface ActivityRow { at: string; actor: string; channel: string; via: string | null; action: string; entity: string; entityId: string | null; outcome: string }
export interface Settings { timezone: string; week_start: "monday" | "sunday"; unit_system: "metric" | "imperial"; currency: string; theme: string; work_rotation: { anchorDate: string; onDays: number; offDays: number } }
export interface Me { label: string; environment: string; signedIn: boolean }

export interface PartView { id: string; kind: "period" | "step"; key: string; label: string; dueDate: string; done: boolean; doneAt: string | null; viaTask: boolean; state: "done" | "overdue" | "due" | "upcoming"; taskId: string | null }
export interface ProgressSummary { periodsDone: number; periodsTotal: number; stepsDone: number; stepsTotal: number; percent: number; complete: boolean }
export interface CycleView { cycle: string; label: string; dueDate: string; parts: PartView[]; progress: ProgressSummary; materialized: boolean }
export interface TrackView { key: string; module: ModuleId; title: string; stream: string | null; periodLabel: string; steps: Array<{ key: string; title: string }>; startCycle: string; cycles: CycleView[] }
export type Stage = "requested" | "ordered" | "in_transit" | "notified" | "received";
export interface ProcItem {
  id: string; module: ModuleId; material: string; description: string | null; quantity: number | null; unit: string | null; supplier: string | null; orderRef: string | null;
  status: Stage; storedStatus: string; requestedOn: string | null; orderedOn: string | null; inTransitOn: string | null; notifiedOn: string | null; receivedOn: string | null;
  expectedDate: string | null; expectedTime: string | null; notificationTaskId: string | null; notification: { status: string; dueDate: string | null; dueTime: string | null } | null;
  priority: Priority; notes: string | null; source: Source; externalId: string | null; demo: boolean; archivedAt: string | null; createdAt: string; updatedAt: string; version: number;
}

import type { FinAccount, FinBalance, FinBill, FinBudget, FinIncomePlan, FinPayment, FinReimb, FinTxn } from "../../shared/finance";
export type { FinAccount, FinBalance, FinBill, FinBudget, FinIncomePlan, FinPayment, FinReimb, FinTxn };
interface FinExtra { demo: boolean; version: number; source: Source; createdAt: string }
export type FinAccountV = FinAccount & FinExtra & { institution: string | null; sortOrder: number };
export type FinTxnV = FinTxn & FinExtra & { payee: string | null; description: string | null; reimbursable: boolean; reimbursementId: string | null };
export type FinBillV = FinBill & FinExtra & { autopay: boolean; notes: string | null };
export type FinIncomePlanV = FinIncomePlan & FinExtra & { notes: string | null };
export type FinReimbV = FinReimb & FinExtra & { description: string; payer: string | null; expenseTxnId: string | null; receivedTxnId: string | null };
export interface FinCategory { id: string; name: string; kind: "expense" | "income" }
export interface FinBudgetV extends FinBudget { id: string; demo: boolean }
export interface FinanceData {
  today: string; currency: "CAD"; accounts: FinAccountV[]; balances: Array<FinBalance & { id: string; demo: boolean }>; categories: FinCategory[]; transactions: FinTxnV[]; bills: FinBillV[]; payments: Array<FinPayment & { id: string; demo: boolean }>;
  budgets: FinBudgetV[]; incomePlans: FinIncomePlanV[]; reimbursements: FinReimbV[]; taskLinks: Array<{ billId: string; dueDate: string; status: string }>;
}
