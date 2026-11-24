/**
 * The two approved Axis environments. Switching is plain navigation to one of exactly these hostnames:
 * no data, token, cookie or session is passed. Each host has its own Cloudflare Access sign-in and its own database.
 */
export const ENVIRONMENTS = {
  production: { id: "production", label: "Production", host: "axis.frameworktools.ca" },
  staging: { id: "staging", label: "Staging", host: "axis-staging.frameworktools.ca" },
} as const;
export type EnvId = keyof typeof ENVIRONMENTS;
export type CurrentEnv = EnvId | "development";

/** Which environment a hostname is. Anything that is not an approved host (or loopback) is unknown, so no switching is offered. */
export function envOfHost(hostname: string): CurrentEnv | null {
  const h = hostname.toLowerCase();
  if (h === ENVIRONMENTS.production.host) return "production";
  if (h === ENVIRONMENTS.staging.host) return "staging";
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "development";
  return null;
}

export const otherEnv = (env: EnvId): EnvId => (env === "production" ? "staging" : "production");

/** A path that is safe to carry across: same-site, absolute, no scheme, no protocol-relative or backslash tricks, no control characters. */
export function safePath(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(pathname)) return "/";
  return pathname;
}

/** The URL of the same page in the other environment. Built only from the allow-list; the query and hash are kept (they hold view state, never credentials). */
export function switchUrl(target: EnvId, where: { pathname: string; search?: string; hash?: string }): string {
  const clean = (s: string | undefined, lead: string) => (s && s.startsWith(lead) && !/[\u0000-\u001f\u007f]/.test(s) ? s : "");
  return `https://${ENVIRONMENTS[target].host}${safePath(where.pathname)}${clean(where.search, "?")}${clean(where.hash, "#")}`;
}

/** True only for the exact approved origins. */
export const isApprovedUrl = (url: string): boolean => {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.port && (u.hostname === ENVIRONMENTS.production.host || u.hostname === ENVIRONMENTS.staging.host); } catch { return false; }
};
