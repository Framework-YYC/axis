/** Thin client for the Orbis REST API (/api/v1). The same service layer the assistants use. */
export type Envelope<T> = { success: true; data: T; duplicate?: boolean } | { success: false; error: { code: string; message: string } };

export class ApiUnavailable extends Error {}

export async function api<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: "same-origin",
      // Writes are always JSON: the Worker refuses anything else (cross-site form posts cannot send it).
      headers: { Accept: "application/json", ...(init.method && init.method !== "GET" ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiUnavailable("offline");
  }
  const type = res.headers.get("content-type") ?? "";
  // No Worker behind the page (plain `vite`) or an expired Access session: not an API answer.
  if (!type.includes("application/json")) throw new ApiUnavailable(`no api (${res.status})`);
  return (await res.json()) as Envelope<T>;
}

export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
