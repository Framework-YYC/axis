import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prod = readFileSync(".github/workflows/deploy-production.yml", "utf8");
const stage = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

describe("deploy workflows (public repository rules)", () => {
  it("production is manual-only, from main, with typed confirmation and the production environment", () => {
    const c = code(prod);
    expect(c).toMatch(/on:\s+workflow_dispatch:/);
    expect(c).not.toMatch(/^\s*(push|pull_request|pull_request_target|schedule):/m);
    expect(c).toContain("github.ref == 'refs/heads/main'");
    expect(c).toContain("deploy production");
    expect(c).toContain("environment: production");
    expect(c).toContain("--env production");
    expect(c).not.toContain("--env staging");
  });
  it("neither workflow can reach the other environment or use pull_request_target", () => {
    expect(code(stage)).not.toContain("--env production");
    for (const w of [prod, stage]) {
      expect(code(w)).not.toContain("pull_request_target");
      expect(code(w)).toContain("persist-credentials: false");
      expect(code(w)).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    }
  });
  it("production has its own database and the single cron trigger; staging has none", () => {
    const cfg = readFileSync("wrangler.jsonc", "utf8");
    const stagingBlock = cfg.slice(cfg.indexOf('"staging": {'), cfg.indexOf('"production": {'));
    const prodBlock = cfg.slice(cfg.indexOf('"production": {'));
    expect(prodBlock).toContain('"database_name": "axis-production"');
    expect(prodBlock).toContain('"crons": ["* * * * *"]');
    expect(prodBlock).not.toContain("600a5970"); // never the staging database id
    expect(stagingBlock).toContain('"crons": []'); // the account has one free cron slot left; production uses it
  });
});
