import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiUnavailable, type Task } from "./api";
import { demoTasks } from "../data/synthetic";

export type Source = "live" | "demo";

/**
 * Tasks from the shared service layer, refreshed on focus, on return to the tab and every 15 s,
 * so what an assistant creates or completes shows up here without any manual step.
 * With no Worker behind the page (design preview), falls back to clearly-labelled synthetic data.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [source, setSource] = useState<Source>("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const demo = useRef(false);

  const refresh = useCallback(async () => {
    if (demo.current) return;
    try {
      const r = await api<{ tasks: Task[] }>("/tasks?limit=200");
      if (r.success) { setTasks(r.data.tasks); setSource("live"); setError(null); }
      else setError(r.error.message);
    } catch (e) {
      if (e instanceof ApiUnavailable) { demo.current = true; setTasks(demoTasks()); setSource("demo"); }
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
    const optimistic = (t: Task): Task => (t.id === id ? { ...t, status: action === "complete" ? "completed" : "pending", completedAt: action === "complete" ? new Date().toISOString() : null } : t);
    setTasks((cur) => cur.map(optimistic));
    if (demo.current) return;
    try {
      const r = await api<Task>(`/tasks/${id}/${action}`, { method: "POST" });
      if (!r.success) setError(r.error.message);
    } catch { setError("Could not reach Axis. Your change was not saved."); }
    await refresh();
  }, [refresh]);

  const add = useCallback(async (title: string) => {
    if (demo.current) {
      const t = { ...demoTasks()[0], id: `demo-${Date.now()}`, title, dueDate: null, status: "pending" as const, createdBy: "Owner", source: { kind: "manual", name: "Axis" } };
      setTasks((cur) => [t, ...cur]);
      return;
    }
    const r = await api<Task>("/tasks", { method: "POST", body: JSON.stringify({ title }) });
    if (!r.success) setError(r.error.message);
    await refresh();
  }, [refresh]);

  return { tasks, source, loading, error, complete: (id: string) => act(id, "complete"), reopen: (id: string) => act(id, "reopen"), add, refresh };
}
