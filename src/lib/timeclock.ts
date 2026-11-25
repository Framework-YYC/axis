import { useCallback, useEffect, useRef, useState } from "react";
import { nextDay, startOfDay, weekStartOf, type PunchAction, type TimeEntry, type TimeJob } from "../../shared/timeclock";
import { api, patch, post } from "./api";
import { useData } from "./data";

export interface ClockState { jobs: TimeJob[]; entries: Array<TimeEntry & { origStartAt: string | null; origEndAt: string | null; version: number }>; open: (TimeEntry & { version: number }) | null; serverNow: string; timezone: string; weekStart: 0 | 1 }
export interface Pending { action: PunchAction; jobId: string | null; punchId: string; at: string; label: string; status: "saving" | "failed"; message?: string; retryable?: boolean }

const KEY = "orbis.timeclock.pending";
const readPending = (): Pending | null => { try { const p = JSON.parse(localStorage.getItem(KEY) ?? "null"); return p && p.punchId ? { ...p, status: "failed", message: p.message ?? "This punch was not saved last time.", retryable: true } : null; } catch { return null; } };
const savePending = (p: Pending | null) => { try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch { /* private mode: the banner still works for this visit */ } };

/** The device's own time zone when the setting is 'auto'. */
export const useZone = (): string => { const { settings } = useData(); return settings.timezone && settings.timezone !== "auto" ? settings.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; };

/**
 * The time clock's data and actions. The server keeps the timestamps (so tracking continues when Orbis is closed); this hook shows them, refreshes every
 * 30 seconds and when the app returns to the foreground, and keeps a punch that failed to save visible (and across a reload) until it is retried or discarded.
 */
export function useTimeclock() {
  const { today, settings } = useData();
  const tz = useZone();
  const wk: 0 | 1 = settings.week_start === "sunday" ? 0 : 1;
  const [from, setFrom] = useState(() => { const w = weekStartOf(today, wk); return new Date(startOfDay(w, "UTC") - 14 * 86_400_000).toISOString().slice(0, 10); });
  const [clock, setClock] = useState<ClockState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPendingState] = useState<Pending | null>(readPending);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const setPending = (p: Pending | null) => { setPendingState(p); savePending(p && p.status === "failed" ? p : null); };

  const load = useCallback(async () => {
    try { const r = await api<ClockState>(`/timeclock?today=${today}&from=${from}`); if (r.success) { setClock(r.data); setLoadError(null); } else setLoadError(r.error.message); }
    catch { setLoadError("Orbis could not be reached. The clock below may be out of date; punches are still being tracked."); }
  }, [today, from]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const send = useCallback(async (p: Pending) => {
    if (busy.current) return;
    busy.current = true; setNotice(null); setPending({ ...p, status: "saving" });
    try {
      const r = await post<ClockState & { applied: boolean; message?: string }>("/timeclock/punch", { action: p.action, jobId: p.jobId, at: p.at, punchId: p.punchId });
      if (r.success) { setClock(r.data); setNotice(r.data.applied ? null : r.data.message ?? null); setPending(null); }
      else setPending({ ...p, status: "failed", message: r.error.message, retryable: r.error.code === "conflict" });
    } catch { setPending({ ...p, status: "failed", message: "Orbis could not be reached. This punch is NOT saved yet.", retryable: true }); }
    finally { busy.current = false; }
  }, []);

  /** A tap: the moment is stamped now, on the device, so a slow or failed save still records when you tapped. */
  const tap = (action: PunchAction, jobId: string | null, label: string) => send({ action, jobId, label, punchId: crypto.randomUUID(), at: new Date().toISOString(), status: "saving" });
  const retry = () => { if (pending) void send(pending); };
  const discard = () => setPending(null);

  const mutate = async (fn: () => ReturnType<typeof post<ClockState>>): Promise<string | null> => {
    try { const r = await fn(); if (r.success) { setClock(r.data); return null; } return r.error.message; } catch { return "Orbis could not be reached. Nothing was saved."; }
  };
  return {
    clock, tz, wk, today, loadError, pending, notice, from, setFrom, reload: load, tap, retry, discard,
    editEntry: (id: string, body: Record<string, unknown>) => mutate(() => patch<ClockState>(`/timeclock/entries/${id}`, body)),
    addEntry: (body: Record<string, unknown>) => mutate(() => post<ClockState>("/timeclock/entries", body)),
    deleteEntry: (id: string) => mutate(() => post<ClockState>(`/timeclock/entries/${id}/delete`)),
    saveJob: (body: Record<string, unknown>) => mutate(() => post<ClockState>("/timeclock/jobs", body)),
  };
}
export const dayBefore = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10); };
export { nextDay };
