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
