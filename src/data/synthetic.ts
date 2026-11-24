// ALL DATA IN THIS FILE IS SYNTHETIC. It exists to demonstrate layouts. Nothing here is real, personal or confidential.
import type { Task } from "../lib/api";
import { localToday, shift } from "../lib/dates";

export const IS_SYNTHETIC = true;

export function demoTasks(): Task[] {
  const t = localToday();
  const mk = (id: string, title: string, o: Partial<Task>): Task => ({
    id, title, notes: null, category: "personal", project: null, priority: "medium", status: "pending", dueDate: null, scheduledDate: null,
    completedAt: null, archivedAt: null, source: { kind: "manual", name: "Axis" }, createdBy: "Owner", updatedBy: "Owner", updatedAt: new Date().toISOString(), version: 1, ...o,
  });
  return [
    mk("d1", "Review quarterly budget (demo)", { priority: "high", category: "finance", dueDate: t }),
    mk("d2", "Send proposal draft (demo)", { priority: "critical", category: "framework", dueDate: t, status: "in_progress" }),
    mk("d3", "Book dentist appointment (demo)", { category: "health", dueDate: shift(t, 1), source: { kind: "integration", name: "ChatGPT: Personal assistant" }, createdBy: "ChatGPT: Personal assistant" }),
    mk("d4", "Renew vehicle registration (demo)", { priority: "high", category: "personal", dueDate: shift(t, -2) }),
    mk("d5", "Read chapter on systems design (demo)", { priority: "low", category: "learning", dueDate: shift(t, 4) }),
    mk("d6", "Plan Q1 roadmap (demo)", { category: "nexus", dueDate: shift(t, 20) }),
    mk("d7", "Sort receipts (demo)", { priority: "low", category: "finance" }),
    mk("d8", "Replace smoke detector batteries (demo)", { status: "completed", completedAt: new Date().toISOString() }),
  ];
}

export const accounts = [
  { name: "Everyday chequing", kind: "Bank", balance: 482_315 },
  { name: "Savings", kind: "Bank", balance: 1_850_000 },
  { name: "Travel card", kind: "Credit card", balance: -126_480 },
  { name: "Index fund", kind: "Investment", balance: 4_120_000 },
  { name: "Vehicle loan", kind: "Loan", balance: -1_240_000 },
];

export const netWorthTrend = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((m, i) => ({ m, v: (4_200_000 + i * 118_000 + (i % 2) * 40_000) / 100 }));

export const budget = [
  { name: "Housing", planned: 180_000, actual: 180_000 },
  { name: "Groceries", planned: 70_000, actual: 61_240 },
  { name: "Transport", planned: 35_000, actual: 41_900 },
  { name: "Dining", planned: 30_000, actual: 22_315 },
  { name: "Subscriptions", planned: 9_000, actual: 8_647 },
];

export function bills() {
  const t = localToday();
  return [
    { name: "Internet", due: shift(t, 2), amount: 8_900 },
    { name: "Travel card payment", due: shift(t, 5), amount: 126_480 },
    { name: "Streaming bundle", due: shift(t, 9), amount: 2_199 },
    { name: "Insurance", due: shift(t, 14), amount: 14_250 },
  ];
}
export const nextPayday = () => shift(localToday(), 6);

export const weight = [82.4, 82.1, 82.2, 81.8, 81.6, 81.7, 81.3, 81.0].map((kg, i) => ({ d: `W${i + 1}`, kg }));
export const steps = [6200, 8400, 10150, 7300, 9100, 11800, 5600].map((s, i) => ({ d: ["M", "T", "W", "T", "F", "S", "S"][i], s }));
export const workouts = [
  { name: "Upper body (demo)", detail: "5 exercises · 52 min", when: "Yesterday" },
  { name: "Easy run (demo)", detail: "6.2 km · 36 min", when: "2 days ago" },
  { name: "Lower body (demo)", detail: "6 exercises · 58 min", when: "4 days ago" },
];
export const waterGoalMl = 2500;
export const waterStartMl = 1250;

export const goals = [
  { name: "Emergency fund to $20,000", area: "Finance", progress: 62, due: "Mar 2027" },
  { name: "Run a half marathon", area: "Health", progress: 41, due: "May 2027" },
  { name: "Complete systems-design course", area: "Learning", progress: 78, due: "Jan 2027" },
  { name: "Launch Axis staging", area: "Productivity", progress: 35, due: "Dec 2026" },
];
export const habits = [
  { name: "Walk 8,000 steps", streak: 12, week: [1, 1, 1, 0, 1, 1, 0] },
  { name: "Read 20 minutes", streak: 5, week: [1, 0, 1, 1, 1, 0, 0] },
  { name: "No screens after 10pm", streak: 3, week: [0, 1, 1, 1, 0, 0, 1] },
];

export function events() {
  const t = localToday();
  return [
    { day: t, time: "09:00", title: "Planning block", kind: "Work" },
    { day: t, time: "12:30", title: "Lunch with a friend", kind: "Personal" },
    { day: t, time: "17:30", title: "Strength training", kind: "Training" },
    { day: shift(t, 1), time: "10:00", title: "Dentist", kind: "Health" },
    { day: shift(t, 2), time: "—", title: "Internet bill due", kind: "Finance" },
    { day: shift(t, 3), time: "08:00", title: "Flight to Vancouver", kind: "Travel" },
    { day: shift(t, 6), time: "—", title: "Payday", kind: "Finance" },
  ];
}
