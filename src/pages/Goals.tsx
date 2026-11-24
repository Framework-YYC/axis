import { Plus } from "lucide-react";
import { useState } from "react";
import { MODULE_IDS, MODULES_META } from "../../shared/modules";
import { GoalEditor, HabitEditor } from "../components/editors";
import { GoalCard, HabitRow } from "../components/records";
import { Btn, Empty, PageHeader, Segmented, Widget } from "../components/ui";
import { useData } from "../lib/data";
import type { Goal, Habit } from "../lib/types";

export default function GoalsHabits() {
  const { goals, habits, loading } = useData();
  const [mod, setMod] = useState<string>("all");
  const [term, setTerm] = useState<string>("all");
  const [edit, setEdit] = useState<{ goal?: Goal } | { habit?: Habit } | null>(null);
  const g = goals.filter((x) => x.status !== "abandoned" && (mod === "all" || x.module === mod) && (term === "all" || x.term === term));
  const h = habits.filter((x) => x.status !== "archived" && (mod === "all" || x.module === mod));
  const opts = [{ value: "all", label: "All modules" }, ...MODULE_IDS.map((m) => ({ value: m as string, label: MODULES_META[m].label }))];
  return (
    <div>
      <PageHeader crumb="GOALS & HABITS" title="Goals & Habits" subtitle="Targets with progress, and routines with streaks" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Module" value={mod} onChange={setMod} options={opts} />
        <Segmented label="Term" value={term} onChange={setTerm} options={[{ value: "all", label: "Any term" }, { value: "short", label: "Short" }, { value: "medium", label: "Medium" }, { value: "long", label: "Long" }]} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Widget id="goals" title="Goals" count={g.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ goal: undefined })}>New goal</Btn>}>
          {loading ? <Empty>Loading…</Empty> : g.length === 0 ? <Empty>No goals match.</Empty> : <ul className="space-y-3">{g.map((x) => <GoalCard key={x.id} g={x} onEdit={(y) => setEdit({ goal: y })} />)}</ul>}
        </Widget>
        <Widget id="habits" title="Habits" count={h.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ habit: undefined })}>New habit</Btn>}>
          {loading ? <Empty>Loading…</Empty> : h.length === 0 ? <Empty>No habits match.</Empty> : <ul>{h.map((x) => <HabitRow key={x.id} h={x} onEdit={(y) => setEdit({ habit: y })} />)}</ul>}
        </Widget>
      </div>
      {edit && "goal" in edit && <GoalEditor goal={edit.goal} defaultModule={mod === "all" ? undefined : (mod as Goal["module"])} onClose={() => setEdit(null)} />}
      {edit && "habit" in edit && <HabitEditor habit={edit.habit} defaultModule={mod === "all" ? undefined : (mod as Habit["module"])} onClose={() => setEdit(null)} />}
    </div>
  );
}
