export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Recharts and motion set inline style attributes; scripts stay strict.
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** Copies a response and applies security headers plus the right cache policy for its path. */
export function finalize(response: Response, pathname: string): Response {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  if (pathname.startsWith("/api/") || pathname === "/mcp") {
    out.headers.set("Cache-Control", "no-store");
    out.headers.set("Pragma", "no-cache");
  } else if (pathname.startsWith("/assets/")) {
    // Content-hashed build output. `private` keeps shared caches out of it.
    out.headers.set("Cache-Control", "private, max-age=31536000, immutable");
  } else {
    out.headers.set("Cache-Control", "private, no-cache");
  }
  return out;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Rejects cross-origin state-changing requests. */
export function sameOriginWrite(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return true;
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const type = request.headers.get("Content-Type") ?? "";
  return type.toLowerCase().startsWith("application/json");
}
