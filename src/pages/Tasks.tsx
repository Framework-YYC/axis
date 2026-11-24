import { PageHeader } from "../components/ui";
import { TasksView } from "../components/TasksView";

/** The unified Tasks screen across all five modules. Module and time filters arrive via the URL (Home opens it unfiltered). */
export default function Tasks() {
  return (
    <div>
      <PageHeader crumb="TASKS" title="Tasks" />
      <TasksView />
    </div>
  );
}
