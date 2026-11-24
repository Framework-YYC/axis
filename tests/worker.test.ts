import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
import type { Env } from "../worker/env";

const assets = { fetch: vi.fn(async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } })) };
const db = { prepare: () => ({ first: async () => ({ ok: 1 }) }) };
const dev = { ASSETS: assets, AXIS_DB: db, ENVIRONMENT: "development", OWNER_EMAIL: "dev@example.invalid" } as unknown as Env;
const staging = { ...dev, ENVIRONMENT: "staging" } as unknown as Env;
const L = "http://localhost:8787";

describe("worker", () => {
  it("denies unauthenticated requests to the app shell and the API in a deployed environment", async () => {
    for (const path of ["/", "/api/v1/me", "/assets/x.js"]) {
      const res = await worker.fetch(new Request(`https://axis-staging.frameworktools.ca${path}`), staging);
      expect([401, 500]).toContain(res.status);
    }
    expect(assets.fetch).not.toHaveBeenCalled();
  });
  it("API responses are never cacheable and carry security headers", async () => {
    const res = await worker.fetch(new Request(`${L}/api/v1/me`), dev);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("serves static assets through the Worker with a private cache policy", async () => {
    const res = await worker.fetch(new Request(`${L}/`), dev);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });
  it("rejects cross-origin or non-JSON writes and unknown methods on assets", async () => {
    const cross = await worker.fetch(new Request(`${L}/api/v1/tasks`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" }), dev);
    expect(cross.status).toBe(403);
    const form = await worker.fetch(new Request(`${L}/api/v1/tasks`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }), dev);
    expect(form.status).toBe(403);
    expect((await worker.fetch(new Request(`${L}/`, { method: "DELETE" }), dev)).status).toBe(405);
  });
  it("unknown API paths return an explicit failure", async () => {
    const res = await worker.fetch(new Request(`${L}/api/nope`), dev);
    expect(res.status).toBe(404);
    expect((await res.json()) as object).toMatchObject({ success: false });
  });
});
