import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { useData } from "./lib/data";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const ModulePage = lazy(() => import("./pages/ModulePage"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Goals = lazy(() => import("./pages/Goals"));
const Settings = lazy(() => import("./pages/Settings"));

export default function App() {
  const { me } = useData();
  return (
    <Shell>
      <Suspense fallback={<p className="mono py-10 text-center">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/m/:module" element={<ModulePage />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings who={me.label} environment={me.environment} signedIn={me.signedIn} />} />
          <Route path="*" element={<p className="mono py-10 text-center">Page not found.</p>} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
