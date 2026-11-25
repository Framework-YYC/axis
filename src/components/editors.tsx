import { useState } from "react";
import { MODULE_IDS, MODULES_META, type ModuleId } from "../../shared/modules";
import { assistantNameOf, byLine, eventLabel } from "../lib/humanize";
import { api, patch, post } from "../lib/api";
import { useData } from "../lib/data";
import { useApi } from "../lib/useApi";
import type { CalEvent, Goal, Habit, Priority, ProcItem, Recurrence, Stage, Task } from "../lib/types";
import { outstandingAction, STAGE_LABEL, STAGES } from "../../shared/procurement";
import { Chips, Field, FormError, Modal, ModalActions, Select, TextArea, TextInput } from "./forms";
import { Btn } from "./ui";

const MODULE_OPTS = MODULE_IDS.map((m) => ({ value: m, label: MODULES_META[m].label }));
const PRIORITIES: Array<{ value: Priority; label: string }> = [{ value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];
const STATUSES = [{ value: "pending", label: "To do" }, { value: "in_progress", label: "In progress" }, { value: "waiting", label: "Waiting" }] as const;
const FREQ = [{ value: "none", label: "Does not repeat" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }] as const;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"].map((l, i) => ({ value: i, label: l }));
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const n = (v: string): number | undefined => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function useSave(onDone: () => void) {
  const { mutate, today } = useData();
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (req: () => ReturnType<typeof post>) => {
    setSaving(true); setErr(null);
    const r = await mutate(req);
    setSaving(false);
    if (r && r.success) onDone(); else setErr(r && !r.success ? r.error.message : "Could not reach Orbis. Nothing was saved.");
  };
  return { err, saving, run, today };
}

export function TaskEditor({ task, defaults, onClose }: { task?: Task; defaults?: Partial<Pick<Task, "module" | "dueDate" | "goalId">>; onClose: () => void }) {
  const { goals, today } = useData();
  const { err, saving, run } = useSave(onClose);
  const [f, setF] = useState({
    title: task?.title ?? "", description: task?.description ?? "", notes: task?.notes ?? "", module: (task?.module ?? defaults?.module ?? "daily") as ModuleId,
    priority: (task?.priority ?? "medium") as Priority, status: (task?.status === "completed" ? "pending" : task?.status ?? "pending") as "pending" | "in_progress" | "waiting",
    dueDate: task?.dueDate ?? defaults?.dueDate ?? "", dueTime: task?.dueTime ?? "", scheduledDate: task?.scheduledDate ?? "", project: task?.project ?? "", goalId: task?.goalId ?? defaults?.goalId ?? "",
    freq: (task?.recurrence?.freq ?? "none") as "none" | Recurrence["freq"], interval: String(task?.recurrence?.interval ?? 1), weekdays: task?.recurrence?.byWeekday ?? [], monthDay: (task?.recurrence?.byMonthDay === 31 ? "last" : "same") as "same" | "last", rotation: (task?.recurrence?.rotation === "on" ? "on" : "any") as "any" | "on",
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const hist = useApi<{ events: Array<{ at: string; event: string; actorLabel: string; channel: string }> }>(task ? `/tasks/${task.id}/history` : null);
  const modGoals = goals.filter((g) => g.module === f.module && g.status === "active");
  const recurrence = f.freq === "none" ? null : clean({ freq: f.freq, interval: n(f.interval) ?? 1, byWeekday: f.freq === "weekly" && f.weekdays.length ? f.weekdays : undefined, byMonthDay: f.freq === "monthly" && f.monthDay === "last" ? 31 : undefined, rotation: f.rotation === "on" ? "on" : undefined });
  const save = () => {
    if (!f.title.trim()) return;
    const body = {
      title: f.title.trim(), description: f.description || null, notes: f.notes || null, module: f.module, priority: f.priority, status: f.status, dueDate: f.dueDate || null,
      dueTime: f.dueDate ? f.dueTime || null : null, scheduledDate: f.scheduledDate || null, project: f.project || null, goalId: f.goalId || null, recurrence, today,
    };
    void run(() => (task ? patch(`/tasks/${task.id}`, { ...body, expectedVersion: task.version }) : post("/tasks", body)));
  };
  const primary = (path: string) => () => void run(() => post(`/tasks/${task!.id}/${path}`, { today }));
  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} left={task && (
      <>
        {task.status === "completed" ? <Btn variant="soft" onClick={primary("reopen")}>Reopen</Btn> : <Btn variant="soft" onClick={primary("complete")}>Complete</Btn>}
        <Btn variant="ghost" onClick={primary("archive")}>Archive</Btn>
      </>
    )} />}>
      <FormError message={err} />
      {task?.demo && <p className="mono mb-3 !normal-case">Synthetic demonstration task.</p>}
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2">{(id) => <TextInput id={id} value={f.title} onChange={set("title")} maxLength={300} />}</Field>
        <Field label="Module">{(id) => <Select id={id} value={f.module} onChange={set("module")} options={MODULE_OPTS} />}</Field>
        <Field label="Priority">{(id) => <Select id={id} value={f.priority} onChange={set("priority")} options={PRIORITIES} />}</Field>
        <Field label="Due date">{(id) => <TextInput id={id} type="date" value={f.dueDate} onChange={set("dueDate")} />}</Field>
        <Field label="Due time (optional)">{(id) => <TextInput id={id} type="time" value={f.dueTime} onChange={set("dueTime")} disabled={!f.dueDate} />}</Field>
        <Field label="Scheduled to work on">{(id) => <TextInput id={id} type="date" value={f.scheduledDate} onChange={set("scheduledDate")} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={STATUSES} />}</Field>
        <Field label="Repeats">{(id) => <Select id={id} value={f.freq} onChange={set("freq")} options={FREQ} />}</Field>
        {f.freq !== "none" && <Field label="Every (interval)">{(id) => <TextInput id={id} inputMode="numeric" value={f.interval} onChange={set("interval")} />}</Field>}
        {f.freq === "weekly" && <Field label="On" className="md:col-span-2">{() => <Chips label="Weekdays" value={f.weekdays} onChange={set("weekdays")} options={WEEKDAYS} />}</Field>}
        {f.freq === "monthly" && <Field label="Day of month">{(id) => <Select id={id} value={f.monthDay} onChange={set("monthDay")} options={[{ value: "same", label: "Same date each month" }, { value: "last", label: "Last day of the month" }]} />}</Field>}
        {f.freq !== "none" && <Field label="Work rotation">{(id) => <Select id={id} value={f.rotation} onChange={set("rotation")} options={[{ value: "any", label: "Ignore the rotation" }, { value: "on", label: "Only while on rotation" }]} />}</Field>}
        <Field label="Goal">{(id) => <Select id={id} value={f.goalId} onChange={set("goalId")} options={[{ value: "", label: "None" }, ...modGoals.map((g) => ({ value: g.id, label: g.title }))]} />}</Field>
        <Field label="Project">{(id) => <TextInput id={id} value={f.project} onChange={set("project")} maxLength={120} />}</Field>
        <Field label="Description" className="md:col-span-2">{(id) => <TextArea id={id} value={f.description} onChange={set("description")} />}</Field>
        <Field label="Notes" className="md:col-span-2">{(id) => <TextArea id={id} value={f.notes} onChange={set("notes")} rows={2} />}</Field>
      </div>
      {task && (
        <div className="mt-5">
          <p className="mono mb-2">History</p>
          <p className="mono mb-2 !normal-case !tracking-normal">{task.source.kind === "assistant" ? `Filed via ${assistantNameOf(task.source.assistant ?? "") || "an assistant"}` : task.source.assistant ? `Created via ${assistantNameOf(task.source.assistant)}` : task.createdBy === "Owner" ? "Added by you" : `Added by ${task.createdBy}`}{task.completedAt ? ` · completed ${task.completedAt.slice(0, 10)}` : ""}</p>
          <ul className="space-y-1 text-[12.5px]">
            {(hist.data?.events ?? []).slice(-8).reverse().map((e, i) => <li key={i} className="flex justify-between gap-3"><span>{eventLabel(e.event)} · {byLine(e.actorLabel)}</span><span className="mono">{e.at.slice(0, 16).replace("T", " ")}</span></li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}

export function GoalEditor({ goal, defaultModule, onClose }: { goal?: Goal; defaultModule?: ModuleId; onClose: () => void }) {
  const { err, saving, run, today } = useSave(onClose);
  const [f, setF] = useState({
    title: goal?.title ?? "", description: goal?.description ?? "", module: (goal?.module ?? defaultModule ?? "daily") as ModuleId, kind: (goal?.kind ?? "qualitative") as "numeric" | "qualitative",
    term: (goal?.termSource === "set" ? goal.term : "") as "" | "short" | "medium" | "long" | null, targetDate: goal?.targetDate ?? "", startValue: String(goal?.startValue ?? ""), targetValue: String(goal?.targetValue ?? ""), unit: goal?.unit ?? "",
    status: (goal?.status ?? "active") as Goal["status"], milestones: "",
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = () => {
    if (!f.title.trim()) return;
    const body = clean({ title: f.title.trim(), description: f.description || null, module: f.module, kind: f.kind, term: f.term || null, targetDate: f.targetDate || null, unit: f.unit || null, today,
      ...(f.kind === "numeric" ? { startValue: n(f.startValue), targetValue: n(f.targetValue) } : {}) });
    const ms = f.milestones.split("\n").map((s) => s.trim()).filter(Boolean).map((title) => ({ title }));
    void run(() => (goal ? patch(`/goals/${goal.id}`, { ...body, status: f.status, expectedVersion: goal.version }) : post("/goals", { ...body, milestones: ms })));
  };
  return (
    <Modal title={goal ? "Edit goal" : "New goal"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} left={goal && <Btn variant="ghost" onClick={() => void run(() => post(`/goals/${goal.id}/archive`, { today }))}>Archive</Btn>} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2">{(id) => <TextInput id={id} value={f.title} onChange={set("title")} maxLength={200} />}</Field>
        <Field label="Module">{(id) => <Select id={id} value={f.module} onChange={set("module")} options={MODULE_OPTS} />}</Field>
        <Field label="Type">{(id) => <Select id={id} value={f.kind} onChange={set("kind")} options={[{ value: "qualitative", label: "Qualitative (progress %)" }, { value: "numeric", label: "Numeric (start → target)" }]} />}</Field>
        {f.kind === "numeric" && (
          <>
            <Field label="Start value">{(id) => <TextInput id={id} inputMode="decimal" value={f.startValue} onChange={set("startValue")} />}</Field>
            <Field label="Target value">{(id) => <TextInput id={id} inputMode="decimal" value={f.targetValue} onChange={set("targetValue")} />}</Field>
            <Field label="Unit">{(id) => <TextInput id={id} value={f.unit} onChange={set("unit")} maxLength={30} />}</Field>
          </>
        )}
        <Field label="Target date" hint="Short under 90 days, medium to one year, long beyond. Set from the date unless chosen below.">{(id) => <TextInput id={id} type="date" value={f.targetDate} onChange={set("targetDate")} />}</Field>
        <Field label="Term">{(id) => <Select id={id} value={(f.term ?? "") as "" | "short" | "medium" | "long"} onChange={set("term")} options={[{ value: "", label: "From target date" }, { value: "short", label: "Short-term" }, { value: "medium", label: "Medium-term" }, { value: "long", label: "Long-term" }]} />}</Field>
        {goal && <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "achieved", label: "Achieved" }, { value: "abandoned", label: "Abandoned" }]} />}</Field>}
        <Field label="Description" className="md:col-span-2">{(id) => <TextArea id={id} value={f.description} onChange={set("description")} rows={2} />}</Field>
        {!goal && <Field label="Milestones (one per line)" className="md:col-span-2">{(id) => <TextArea id={id} value={f.milestones} onChange={set("milestones")} rows={3} />}</Field>}
      </div>
    </Modal>
  );
}

export function HabitEditor({ habit, defaultModule, onClose }: { habit?: Habit; defaultModule?: ModuleId; onClose: () => void }) {
  const { goals } = useData();
  const { err, saving, run, today } = useSave(onClose);
  const [f, setF] = useState({
    title: habit?.title ?? "", module: (habit?.module ?? defaultModule ?? "daily") as ModuleId, period: (habit?.period ?? "day") as "day" | "week" | "month", targetCount: String(habit?.targetCount ?? 1),
    targetValue: String(habit?.targetValue ?? ""), unit: habit?.unit ?? "", days: habit?.daysOfWeek ?? [], rotationMode: (habit?.rotationMode ?? "any") as Habit["rotationMode"],
    offTargetCount: String(habit?.offTargetCount ?? ""), offTargetValue: String(habit?.offTargetValue ?? ""), offDays: habit?.offDaysOfWeek ?? [], goalId: habit?.goalId ?? "", status: (habit?.status ?? "active") as Habit["status"],
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const quant = f.targetValue.trim() !== "" || f.unit.trim() !== "";
  const save = () => {
    if (!f.title.trim()) return;
    const body = clean({
      title: f.title.trim(), module: f.module, period: f.period, targetCount: n(f.targetCount) ?? 1, targetValue: quant ? n(f.targetValue) : undefined, unit: quant ? f.unit || undefined : undefined,
      daysOfWeek: f.days.length && f.days.length < 7 ? f.days : null, rotationMode: f.rotationMode, goalId: f.goalId || null, today,
      ...(f.rotationMode === "split" ? { offTargetCount: n(f.offTargetCount), offTargetValue: n(f.offTargetValue), offDaysOfWeek: f.offDays.length ? f.offDays : null } : {}),
    });
    void run(() => (habit ? patch(`/habits/${habit.id}`, { ...body, status: f.status, expectedVersion: habit.version }) : post("/habits", body)));
  };
  return (
    <Modal title={habit ? "Edit habit" : "New habit"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2">{(id) => <TextInput id={id} value={f.title} onChange={set("title")} maxLength={200} />}</Field>
        <Field label="Module">{(id) => <Select id={id} value={f.module} onChange={set("module")} options={MODULE_OPTS} />}</Field>
        <Field label="Frequency">{(id) => <Select id={id} value={f.period} onChange={set("period")} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />}</Field>
        <Field label="Times per period">{(id) => <TextInput id={id} inputMode="numeric" value={f.targetCount} onChange={set("targetCount")} />}</Field>
        <Field label="Quantity target (optional)" hint="For measured habits, e.g. 3 litres.">{(id) => <TextInput id={id} inputMode="decimal" value={f.targetValue} onChange={set("targetValue")} />}</Field>
        <Field label="Unit">{(id) => <TextInput id={id} value={f.unit} onChange={set("unit")} maxLength={30} />}</Field>
        <Field label="Goal">{(id) => <Select id={id} value={f.goalId} onChange={set("goalId")} options={[{ value: "", label: "None" }, ...goals.filter((g) => g.module === f.module && g.status === "active").map((g) => ({ value: g.id, label: g.title }))]} />}</Field>
        <Field label="Only on days" className="md:col-span-2" hint="Leave empty for every day.">{() => <Chips label="Days of week" value={f.days} onChange={set("days")} options={WEEKDAYS} />}</Field>
        <Field label="Work rotation" className="md:col-span-2" hint="Uses the on and off rotation set in Settings.">{(id) => <Select id={id} value={f.rotationMode} onChange={set("rotationMode")} options={[{ value: "any", label: "Same every day" }, { value: "on", label: "Only on rotation days" }, { value: "off", label: "Only off rotation" }, { value: "split", label: "Different routine on and off rotation" }]} />}</Field>
        {f.rotationMode === "split" && (
          <>
            <Field label="Off-rotation times">{(id) => <TextInput id={id} inputMode="numeric" value={f.offTargetCount} onChange={set("offTargetCount")} />}</Field>
            <Field label="Off-rotation quantity">{(id) => <TextInput id={id} inputMode="decimal" value={f.offTargetValue} onChange={set("offTargetValue")} />}</Field>
            <Field label="Off-rotation days" className="md:col-span-2">{() => <Chips label="Off-rotation days" value={f.offDays} onChange={set("offDays")} options={WEEKDAYS} />}</Field>
          </>
        )}
        {habit && <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "archived", label: "Archived" }]} />}</Field>}
      </div>
    </Modal>
  );
}

export function EventEditor({ event, defaultModule, defaultDate, onClose }: { event?: CalEvent; defaultModule?: ModuleId; defaultDate?: string; onClose: () => void }) {
  const { err, saving, run, today } = useSave(onClose);
  const [f, setF] = useState({ title: event?.title ?? "", module: (event?.module ?? defaultModule ?? "daily") as ModuleId, date: event?.date ?? defaultDate ?? today, startTime: event?.startTime ?? "", endTime: event?.endTime ?? "", location: event?.location ?? "", description: event?.description ?? "", status: event?.status ?? "scheduled" });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = () => {
    if (!f.title.trim() || !f.date) return;
    const body = { title: f.title.trim(), module: f.module, date: f.date, startTime: f.startTime || null, endTime: f.startTime ? f.endTime || null : null, location: f.location || null, description: f.description || null, today };
    void run(() => (event ? patch(`/events/${event.id}`, { ...body, status: f.status, expectedVersion: event.version }) : post("/events", body)));
  };
  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose} footer={<ModalActions onClose={onClose} onSave={save} saving={saving} />}>
      <FormError message={err} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2">{(id) => <TextInput id={id} value={f.title} onChange={set("title")} maxLength={200} />}</Field>
        <Field label="Module">{(id) => <Select id={id} value={f.module} onChange={set("module")} options={MODULE_OPTS} />}</Field>
        <Field label="Date">{(id) => <TextInput id={id} type="date" value={f.date} onChange={set("date")} />}</Field>
        <Field label="Start (optional)">{(id) => <TextInput id={id} type="time" value={f.startTime} onChange={set("startTime")} />}</Field>
        <Field label="End">{(id) => <TextInput id={id} type="time" value={f.endTime} onChange={set("endTime")} disabled={!f.startTime} />}</Field>
        <Field label="Location" className="md:col-span-2">{(id) => <TextInput id={id} value={f.location} onChange={set("location")} maxLength={200} />}</Field>
        {event && <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={[{ value: "scheduled", label: "Scheduled" }, { value: "cancelled", label: "Cancelled" }]} />}</Field>}
      </div>
    </Modal>
  );
}
export { api, DOW_NAMES };

const STAGE_OPTS = STAGES.map((x) => ({ value: x, label: STAGE_LABEL[x] }));
/** One material or equipment request. The stage follows the item from request to receipt; the REEF notification task follows the delivery date. */
export function ProcurementEditor({ item, onClose }: { item?: ProcItem; onClose: () => void }) {
  const { err, saving, run, today } = useSave(onClose);
  const [f, setF] = useState({
    material: item?.material ?? "", quantity: item?.quantity != null ? String(item.quantity) : "", unit: item?.unit ?? "", supplier: item?.supplier ?? "", orderRef: item?.orderRef ?? "",
    status: (item?.storedStatus ?? "requested") as Stage, expectedDate: item?.expectedDate ?? "", expectedTime: item?.expectedTime ?? "", priority: (item?.priority ?? "medium") as Priority, notes: item?.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const next = outstandingAction({ status: f.status, expectedDate: f.expectedDate || null, expectedTime: f.expectedTime || null, supplier: f.supplier || null, orderRef: f.orderRef || null }, f.status, today);
  const save = () => {
    if (!f.material.trim()) return;
    const body = { material: f.material.trim(), quantity: n(f.quantity) ?? null, unit: f.unit || null, supplier: f.supplier || null, orderRef: f.orderRef || null, status: f.status, expectedDate: f.expectedDate || null, expectedTime: f.expectedDate ? f.expectedTime || null : null, priority: f.priority, notes: f.notes || null, module: "progressive" };
    void run(() => (item ? patch(`/procurement/${item.id}`, { ...body, expectedVersion: item.version }) : post("/procurement", body)));
  };
  return (
    <Modal title={item ? "Edit procurement item" : "New procurement request"} onClose={onClose} wide footer={<ModalActions onClose={onClose} onSave={save} saving={saving} left={item && <Btn variant="ghost" onClick={() => void run(() => patch(`/procurement/${item.id}`, { archived: true }))}>Cancel request</Btn>} />}>
      <FormError message={err} />
      {next && <p className="mono mb-3 !normal-case !tracking-normal">Next: {next.text}</p>}
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Material or equipment" className="md:col-span-2">{(id) => <TextInput id={id} value={f.material} onChange={set("material")} maxLength={200} />}</Field>
        <Field label="Quantity">{(id) => <TextInput id={id} inputMode="decimal" value={f.quantity} onChange={set("quantity")} />}</Field>
        <Field label="Unit">{(id) => <TextInput id={id} value={f.unit} onChange={set("unit")} maxLength={30} placeholder="pcs, m, bags" />}</Field>
        <Field label="Supplier">{(id) => <TextInput id={id} value={f.supplier} onChange={set("supplier")} maxLength={200} />}</Field>
        <Field label="Order reference">{(id) => <TextInput id={id} value={f.orderRef} onChange={set("orderRef")} maxLength={100} />}</Field>
        <Field label="Stage">{(id) => <Select id={id} value={f.status} onChange={set("status")} options={STAGE_OPTS} />}</Field>
        <Field label="Priority">{(id) => <Select id={id} value={f.priority} onChange={set("priority")} options={PRIORITIES} />}</Field>
        <Field label="Expected delivery date" hint="Sets the REEF notification deadline: 24 hours before arrival.">{(id) => <TextInput id={id} type="date" value={f.expectedDate} onChange={set("expectedDate")} />}</Field>
        <Field label="Expected time (optional)">{(id) => <TextInput id={id} type="time" value={f.expectedTime} onChange={set("expectedTime")} disabled={!f.expectedDate} />}</Field>
        <Field label="Notes" className="md:col-span-2">{(id) => <TextArea id={id} value={f.notes} onChange={set("notes")} rows={2} />}</Field>
      </div>
      {item && <p className="mono mt-4 !normal-case !tracking-normal">{item.source.kind === "assistant" ? `Filed via ${assistantNameOf(item.source.assistant ?? "") || "an assistant"}` : "Added by you"}{item.receivedOn ? ` · received ${item.receivedOn}` : ""}</p>}
    </Modal>
  );
}
