import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiUnavailable, type Task } from "./api";
import { demoApprovals, demoTasks, type ApprovalItem } from "../data/synthetic";

/**
 * One shared, polling view of the owner's live data (tasks, approvals, identity), used by the shell, dashboard and pages.
 * Assistant changes appear without any manual step (refresh on focus, on return to the tab and every 15 s).
 *
 * Demo data is only ever used when there is NO Worker behind the page AND the page is served from the developer's own machine.
 * On a deployed host, "API unreachable" (offline, or the Access session expired) is shown as an error, never as fake data.
 */
export type Source = "live" | "demo" | "offline";
export interface Me { label: string; environment: string; signedIn: boolean }

const LOCAL = import.meta.env.DEV || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

interface Data {
  tasks: Task[];
  approvals: ApprovalItem[];
  me: Me;
  source: Source;
  loading: boolean;
  error: string | null;
  complete: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  add: (title: string) => Promise<void>;
  decide: (id: string, approve: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [me, setMe] = useState<Me>({ label: "…", environment: "", signedIn: false });
  const [source, setSource] = useState<Source>("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const demo = useRef(false);

  const refresh = useCallback(async () => {
    if (demo.current) return;
    try {
      const [t, a, m] = await Promise.all([
        api<{ tasks: Task[] }>("/tasks?limit=200"),
        api<{ approvals: ApprovalItem[] }>("/approvals"),
        api<{ actor: string; environment: string }>("/me"),
      ]);
      if (m.success) setMe({ label: m.data.actor, environment: m.data.environment, signedIn: true });
      if (a.success) setApprovals(a.data.approvals.filter((x) => x.status === "pending"));
      if (t.success) { setTasks(t.data.tasks); setSource("live"); setError(null); } else setError(t.error.message);
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      if (LOCAL) {
        demo.current = true;
        setTasks(demoTasks());
        setApprovals(demoApprovals());
        setMe({ label: "Local preview", environment: "preview", signedIn: false });
        setSource("demo");
      } else {
        setSource("offline");
        setError("Can't reach Axis. You may be offline or your sign-in expired. Reload to sign in again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15_000);
    const on = () => void refresh();
    document.addEventListener("visibilitychange", on);
    window.addEventListener("focus", on);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", on); window.removeEventListener("focus", on); };
  }, [refresh]);

  const act = useCallback(async (id: string, action: "complete" | "reopen") => {
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, status: action === "complete" ? "completed" : "pending", completedAt: action === "complete" ? new Date().toISOString() : null } : t)));
    if (demo.current) return;
    try {
      const r = await api<Task>(`/tasks/${id}/${action}`, { method: "POST" });
      if (!r.success) setError(r.error.message);
    } catch { setError("Could not reach Axis. Your change was not saved."); }
    await refresh();
  }, [refresh]);

  const add = useCallback(async (title: string) => {
    if (demo.current) {
      setTasks((cur) => [{ ...demoTasks()[0], id: `demo-${Date.now()}`, title, dueDate: null, status: "pending", createdBy: "Owner", source: { kind: "manual", name: "Axis" } }, ...cur]);
      return;
    }
    try {
      const r = await api<Task>("/tasks", { method: "POST", body: JSON.stringify({ title }) });
      if (!r.success) setError(r.error.message);
    } catch { setError("Could not reach Axis. Your task was not saved."); }
    await refresh();
  }, [refresh]);

  const decide = useCallback(async (id: string, approve: boolean) => {
    setApprovals((cur) => cur.filter((a) => a.id !== id));
    if (demo.current) return;
    try {
      const r = await api(`/approvals/${id}/${approve ? "approve" : "reject"}`, { method: "POST" });
      if (!r.success) setError(r.error.message);
    } catch { setError("Could not reach Axis. Your decision was not saved."); }
    await refresh();
  }, [refresh]);

  const value = useMemo<Data>(() => ({ tasks, approvals, me, source, loading, error, complete: (id) => act(id, "complete"), reopen: (id) => act(id, "reopen"), add, decide, refresh }), [tasks, approvals, me, source, loading, error, act, add, decide, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used inside DataProvider");
  return v;
}
