import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { api, ApiUnavailable } from "./lib/api";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Finance = lazy(() => import("./pages/Finance"));
const Health = lazy(() => import("./pages/Health"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Goals = lazy(() => import("./pages/Goals"));
const Intelligence = lazy(() => import("./pages/Intelligence"));
const Settings = lazy(() => import("./pages/Settings"));

export default function App() {
  const [me, setMe] = useState({ who: "Design preview (no sign-in)", environment: "preview" });
  useEffect(() => {
    api<{ actor: string; environment: string }>("/me")
      .then((r) => { if (r.success) setMe({ who: r.data.actor, environment: r.data.environment }); })
      .catch((e) => { if (!(e instanceof ApiUnavailable)) throw e; });
  }, []);
  return (
    <Shell who={me.who}>
      <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/health" element={<Health />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/settings" element={<Settings who={me.who} environment={me.environment} />} />
          <Route path="*" element={<p className="py-10 text-center text-sm text-muted">Page not found.</p>} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
