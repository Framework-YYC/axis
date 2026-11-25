import { BadgeDollarSign, CalendarPlus, CheckSquare, HandCoins, Package, Repeat, Target, Receipt, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { navModuleOf } from "../../shared/modules";
import { addContext, orderedKinds, type AddKind } from "../../shared/quickAdd";
import { EventEditor, GoalEditor, HabitEditor, ProcurementEditor, TaskEditor } from "./editors";
import { BillEditor, ReimbursementEditor, TransactionEditor } from "./FinanceEditors";
import { Modal } from "./forms";
import { cx } from "../lib/cx";

const OPTIONS: Record<AddKind, { label: string; hint: string; icon: LucideIcon }> = {
  task: { label: "Task", hint: "Something to do", icon: CheckSquare },
  goal: { label: "Goal", hint: "A target with progress", icon: Target },
  habit: { label: "Habit", hint: "A routine with a streak", icon: Repeat },
  event: { label: "Appointment", hint: "An event on the calendar", icon: CalendarPlus },
  txn: { label: "Transaction", hint: "Income, expense or transfer", icon: BadgeDollarSign },
  bill: { label: "Bill", hint: "A recurring payment", icon: Receipt },
  reimb: { label: "Reimbursement", hint: "Money owed back to you", icon: HandCoins },
  proc: { label: "Procurement item", hint: "Material or equipment request", icon: Package },
};

/** Context-aware creation: choose what to add (the likeliest first), then the usual editor opens. All writes go through the same service layer as everywhere else. */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { pathname, search } = useLocation();
  const ctx = addContext(pathname, search);
  const [kind, setKind] = useState<AddKind | null>(null);
  const m = ctx.module;
  if (kind === "task") return <TaskEditor defaults={m ? { module: m } : undefined} onClose={onClose} />;
  if (kind === "goal") return <GoalEditor defaultModule={m} onClose={onClose} />;
  if (kind === "habit") return <HabitEditor defaultModule={m} onClose={onClose} />;
  if (kind === "event") return <EventEditor defaultModule={m} onClose={onClose} />;
  if (kind === "txn") return <TransactionEditor onClose={onClose} />;
  if (kind === "bill") return <BillEditor onClose={onClose} />;
  if (kind === "reimb") return <ReimbursementEditor onClose={onClose} />;
  if (kind === "proc") return <ProcurementEditor onClose={onClose} />;
  const kinds = orderedKinds(ctx.first);
  const here = m ? navModuleOf(m) : null;
  return (
    <Modal title="Quick add" onClose={onClose}>
      <p className="mb-3 text-[12.5px] text-muted">{here ? `Suggested for ${here === "personal" ? "Personal" : here === "financial" ? "Finance" : here === "progressive" ? "Work" : "Framework"}.` : "Choose what to add."} It starts with the usual form.</p>
      <ul className="grid grid-cols-2 gap-2">
        {kinds.map((k, i) => {
          const o = OPTIONS[k];
          return (
            <li key={k}>
              <button onClick={() => setKind(k)} className={cx("hit press flex w-full items-center gap-3 rounded-[16px] p-3 text-left", i === 0 ? "bg-[var(--orbis-lime)] text-[var(--orbis-forest)]" : "flat")}>
                <o.icon size={19} strokeWidth={1.5} aria-hidden className="shrink-0" />
                <span className="min-w-0"><span className="block text-[14px] font-medium leading-tight">{o.label}</span><span className="block text-[11.5px] leading-tight opacity-70">{i === 0 ? "Suggested" : o.hint}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
