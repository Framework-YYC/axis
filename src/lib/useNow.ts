import { useEffect, useState } from "react";

/** A Date that refreshes on an interval (default one minute), for clocks and NOW markers. */
export function useNow(ms = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function ageLabel(iso: string, now = new Date()): string {
  const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}
