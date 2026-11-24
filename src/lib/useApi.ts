import { useCallback, useEffect, useState } from "react";
import { api, ApiUnavailable } from "./api";

/** Fetch one endpoint, refetch when `key` changes and on demand. For data only one screen needs (briefing, module activity, history). */
export function useApi<T>(path: string | null, key: unknown = null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const load = useCallback(async () => {
    if (path === null) return;
    try {
      const r = await api<T>(path);
      if (r.success) { setData(r.data); setError(null); } else setError(r.error.message);
    } catch (e) {
      if (e instanceof ApiUnavailable) setError("Can't reach Orbis");
    } finally { setLoading(false); }
  }, [path]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(path !== null); void load(); }, [load, key]);
  return { data, error, loading, reload: load };
}
