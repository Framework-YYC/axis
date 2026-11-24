import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays } from "../../shared/rotation";
import type { WeekStart } from "../../shared/horizons";
import { api, ApiUnavailable, patch, post, type Envelope } from "./api";
import { localToday } from "./dates";
import type { ActivityRow, Approval, CalEvent, Goal, Habit, InboxRequest, Me, Settings, Task } from "./types";

/**
 * One shared, polling view of the owner's live data, used by the shell and every page. Assistant changes appear without any manual step
 * (refresh on focus, on return to the tab and every 20 s). There is no fake data here: demonstration records, if any, are real rows in the
 * database flagged `demo` and are labelled everywhere they appear. If the API cannot be reached the app says so.
 */
export type Source = "live" | "offline" | "no-api";

const DEFAULT_SETTINGS: Settings = { timezone: "auto", week_start: "monday", unit_system: "metric", currency: "CAD", theme: "system", work_rotation: { anchorDate: "2026-11-16", onDays: 14, offDays: 7 } };
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

export interface Data {
  today: string;
  weekStart: WeekStart;
  settings: Settings;
  tasks: Task[];
  goals: Goal[];
  habits: Habit[];
  events: CalEvent[];
  approvals: Approval[];
  inbox: InboxRequest[];
  activity: ActivityRow[];
  me: Me;
  source: Source;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Run a mutation, surface any error, refresh. Returns the envelope so forms can show field errors. */
  mutate: <T>(request: () => Promise<Envelope<T>>) => Promise<Envelope<T> | null>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  logHabit: (habitId: string, value?: number, date?: string) => Promise<void>;
  decide: (id: string, approve: boolean) => Promise<void>;
}
const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<Data, "tasks" | "goals" | "habits" | "events" | "approvals" | "inbox" | "activity" | "settings" | "me" | "source" | "loading" | "error">>({
    tasks: [], goals: [], habits: [], events: [], approvals: [], inbox: [], activity: [], settings: DEFAULT_SETTINGS, me: { label: "…", environment: "", signedIn: false }, source: "live", loading: true, error: null,
  });
  const [today, setToday] = useState(localToday());
  const tzSynced = useRef(false);

  const refresh = useCallback(async () => {
    const t = localToday();
    setToday(t);
    try {
      const day = `today=${t}`;
      const [open, done, goals, habits, events, approvals, inbox, activity, settings, me] = await Promise.all([
        api<{ tasks: Task[] }>(`/tasks?limit=500&${day}&status=pending,in_progress,waiting`),
        api<{ tasks: Task[] }>(`/tasks/completed?limit=200&${day}&since=${addDays(t, -13)}`),
        api<{ goals: Goal[] }>(`/goals?${day}&status=active,paused,achieved`),
        api<{ habits: Habit[] }>(`/habits?${day}`),
        api<{ events: CalEvent[] }>(`/events?${day}&from=${addDays(t, -35)}&to=${addDays(t, 120)}`),
        api<{ approvals: Approval[] }>("/approvals"),
        api<{ requests: InboxRequest[] }>("/inbox?limit=30"),
        api<{ events: ActivityRow[] }>("/activity?limit=20"),
        api<Settings>("/settings"),
        api<{ actor: string; environment: string }>("/me"),
      ]);
      const first = [open, done, goals, habits, events].find((r) => !r.success);
      setState((s) => ({
        ...s,
        tasks: open.success && done.success ? [...open.data.tasks, ...done.data.tasks] : s.tasks,
        goals: goals.success ? goals.data.goals : s.goals,
        habits: habits.success ? habits.data.habits : s.habits,
        events: events.success ? events.data.events : s.events,
        approvals: approvals.success ? approvals.data.approvals.filter((a) => a.status === "pending") : s.approvals,
        inbox: inbox.success ? inbox.data.requests : s.inbox,
        activity: activity.success ? activity.data.events : s.activity,
        settings: settings.success ? { ...DEFAULT_SETTINGS, ...settings.data } : s.settings,
        me: me.success ? { label: me.data.actor, environment: me.data.environment, signedIn: true } : s.me,
        source: "live", loading: false, error: first && !first.success ? first.error.message : null,
      }));
      // The first time the owner signs in from a device, remember its timezone so scheduled briefings use the right "today".
      if (!tzSynced.current && settings.success && settings.data.timezone === "auto") {
        tzSynced.current = true;
        void post("/settings", { key: "timezone", value: Intl.DateTimeFormat().resolvedOptions().timeZone });
      }
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e;
      setState((s) => ({ ...s, loading: false, source: LOCAL ? "no-api" : "offline", error: LOCAL ? "No API behind this page. Run `npm run dev:worker` (local Worker and database) to work with live data." : "Can't reach Orbis. You may be offline or your sign-in expired. Reload to sign in again." }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20_000);
    const on = () => void refresh();
    document.addEventListener("visibilitychange", on);
    window.addEventListener("focus", on);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", on); window.removeEventListener("focus", on); };
  }, [refresh]);

  const mutate = useCallback(async <T,>(request: () => Promise<Envelope<T>>) => {
    try {
      const r = await request();
      if (!r.success) setState((s) => ({ ...s, error: r.error.message }));
      await refresh();
      return r;
    } catch {
      setState((s) => ({ ...s, error: "Could not reach Orbis. Your change was not saved." }));
      return null;
    }
  }, [refresh]);

  const completeTask = useCallback(async (id: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "completed", completedAt: new Date().toISOString() } : t)) }));
    await mutate(() => post(`/tasks/${id}/complete`));
  }, [mutate]);
  const reopenTask = useCallback(async (id: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "pending", completedAt: null } : t)) }));
    await mutate(() => post(`/tasks/${id}/reopen`));
  }, [mutate]);
  const logHabit = useCallback(async (habitId: string, value?: number, date?: string) => { await mutate(() => post(`/habits/${habitId}/log`, { ...(value !== undefined ? { value } : {}), ...(date ? { date } : {}), today })); }, [mutate, today]);
  const decide = useCallback(async (id: string, approve: boolean) => {
    setState((s) => ({ ...s, approvals: s.approvals.filter((a) => a.id !== id) }));
    await mutate(() => post(`/approvals/${id}/${approve ? "approve" : "reject"}`));
  }, [mutate]);

  const value = useMemo<Data>(() => ({ ...state, today, weekStart: state.settings.week_start === "sunday" ? 0 : 1, refresh, mutate, completeTask, reopenTask, logHabit, decide }), [state, today, refresh, mutate, completeTask, reopenTask, logHabit, decide]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used inside DataProvider");
  return v;
}

export { patch };
