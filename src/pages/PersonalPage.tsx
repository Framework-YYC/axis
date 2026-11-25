import { Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { NAV_META } from "../../shared/modules";
import { PERSONAL_SCOPE } from "../../shared/personal";
import { Btn, Empty, PageHeader, Widget } from "../components/ui";
import { GoalList, HabitList } from "../components/compact";
import { GoalEditor, HabitEditor } from "../components/editors";
import { ModuleTabs } from "../components/ModuleTabs";
import { isTab, type TabId } from "../components/nav";
import { AppointmentsView, HealthView, PersonalOverview, usePersonal } from "../components/PersonalViews";
import { TasksView } from "../components/TasksView";
import { actionLabel, byLine } from "../lib/humanize";
import { PageFrame } from "../lib/motion";
import { useApi } from "../lib/useApi";
import type { ActivityRow, Goal, Habit } from "../lib/types";
import { Calendar } from "./Calendar";

type Act = { activity?: ActivityRow[]; events?: ActivityRow[] } | ActivityRow[];
const rowsOf = (d: Act | null): ActivityRow[] => (Array.isArray(d) ? d : d?.activity ?? d?.events ?? []);

/**
 * Personal: Daily and Health as one screen. An interface grouping only: records keep their own module, and each assistant keeps its own data,
 * instructions and integration. Overview, Tasks, Health and Habits lead; Goals, Appointments, Calendar and Activity sit under More.
 */
export default function PersonalPage() {
  const [sp] = useSearchParams();
  const tab: TabId = isTab(sp.get("tab")) ? (sp.get("tab") as TabId) : "overview";
  const { tasks, goals, habits, events } = usePersonal();
  const open = tasks.filter((t) => t.status !== "completed" && !t.archivedAt);
  const [edit, setEdit] = useState<{ goal?: Goal } | { habit?: Habit } | null>(null);
  const dep = tasks.length + goals.length + habits.length + events.length;
  const daily = useApi<Act>(tab === "activity" ? "/modules/daily/activity?limit=30" : null, dep);
  const health = useApi<Act>(tab === "activity" ? "/modules/health/activity?limit=30" : null, dep);
  const rows = [...rowsOf(daily.data), ...rowsOf(health.data)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  return (
    <div className="@container">
      <PageHeader crumb="PERSONAL" title="Personal" subtitle={NAV_META.personal.blurb} />
      <ModuleTabs module="personal" tab={tab} counts={{ tasks: open.length, habits: habits.length }} />
      <PageFrame key={tab} className="tab-in">
        {tab === "overview" && <PersonalOverview />}
        {tab === "tasks" && <TasksView scope={PERSONAL_SCOPE} embedded />}
        {tab === "health" && <HealthView />}
        {tab === "habits" && (
          <Widget bare title="Habits" count={habits.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ habit: undefined })}>New habit</Btn>}>
            {habits.length === 0 ? <Empty>No habits yet.</Empty> : <HabitList habits={habits} onEdit={(h) => setEdit({ habit: h })} />}
          </Widget>
        )}
        {tab === "goals" && (
          <Widget bare title="Goals" count={goals.length} action={<Btn variant="primary" icon={Plus} onClick={() => setEdit({ goal: undefined })}>New goal</Btn>}>
            {goals.length === 0 ? <Empty>No goals yet.</Empty> : <GoalList goals={goals} onEdit={(g) => setEdit({ goal: g })} />}
          </Widget>
        )}
        {tab === "appointments" && <AppointmentsView />}
        {tab === "calendar" && <Calendar scope={PERSONAL_SCOPE} />}
        {tab === "activity" && (
          <Widget title="Activity history" tag="Daily and Health, audited changes">
            {daily.loading || health.loading ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No activity yet.</Empty> : (
              <ul>{rows.map((a, i) => <li key={i} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px] first:border-t-0"><span className="min-w-0 truncate">{actionLabel(a.action)} <span className="text-muted">· {byLine(a.actor, a.via)}</span></span><span className="mono shrink-0">{a.at.slice(5, 16).replace("T", " ")}</span></li>)}</ul>
            )}
          </Widget>
        )}
        {!["overview", "tasks", "health", "habits", "goals", "appointments", "calendar", "activity"].includes(tab) && <Empty>This screen is not part of Personal.</Empty>}
      </PageFrame>
      {edit && "goal" in edit && <GoalEditor goal={edit.goal} defaultModule="daily" onClose={() => setEdit(null)} />}
      {edit && "habit" in edit && <HabitEditor habit={edit.habit} defaultModule="daily" onClose={() => setEdit(null)} />}
    </div>
  );
}
