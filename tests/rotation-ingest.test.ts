import { describe, expect, it } from "vitest";
import { addDays, rotationStatus } from "../shared/rotation";
import { dedupeKey, validateEnvelope, type ImportEnvelope } from "../shared/ingest";
import { formatVolume, formatWeight, kgToLb, lbToKg } from "../shared/units";

const cfg = { anchorDate: "2026-11-16", onDays: 14, offDays: 7 };

describe("work rotation 14 on / 7 off", () => {
  it("day 1 and day 14 of the on block", () => {
    expect(rotationStatus("2026-11-16", cfg)).toMatchObject({ phase: "on", dayInPhase: 1, daysRemaining: 13 });
    expect(rotationStatus("2026-11-29", cfg)).toMatchObject({ phase: "on", dayInPhase: 14, daysRemaining: 0, nextChange: "2026-11-30" });
  });
  it("off block then next on block", () => {
    expect(rotationStatus("2026-11-30", cfg)).toMatchObject({ phase: "off", dayInPhase: 1, daysRemaining: 6 });
    expect(rotationStatus("2026-12-07", cfg)).toMatchObject({ phase: "on", dayInPhase: 1 });
  });
  it("works before the anchor and across year ends", () => {
    expect(rotationStatus("2026-11-15", cfg)).toMatchObject({ phase: "off", dayInPhase: 7 });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(rotationStatus("2027-01-01", cfg).phase).toMatch(/on|off/);
  });
  it("rejects invalid input", () => {
    expect(() => rotationStatus("2026-13-40x", cfg)).toThrow();
    expect(() => rotationStatus("2026-11-16", { ...cfg, onDays: 0 })).toThrow();
  });
});

const env = (items: ImportEnvelope["items"]): ImportEnvelope => ({
  schema: "axis.import.v1", source: { kind: "chatgpt", name: "Personal assistant" }, generatedAt: "2026-11-24T12:00:00Z", items,
});
describe("import envelope", () => {
  it("validates a good envelope and rejects bad ones with reasons", () => {
    expect(validateEnvelope(env([{ type: "task", data: { title: "x" } }])).ok).toBe(true);
    for (const bad of [null, {}, { ...env([]), items: [] }, { ...env([{ type: "nope" as never, data: {} }]) }, { ...env([{ type: "task", data: {} }]), schema: "v0" }]) {
      const r = validateEnvelope(bad);
      expect(r.ok).toBe(false);
    }
    const many = env(Array.from({ length: 501 }, () => ({ type: "task" as const, data: {} })));
    expect(validateEnvelope(many)).toMatchObject({ ok: false });
  });
  it("dedupe keys are stable, order-insensitive and distinguish content", async () => {
    const s = env([]).source;
    const a = await dedupeKey(s, { type: "task", data: { title: "Pay rent", due: "2026-12-01" } });
    const b = await dedupeKey(s, { type: "task", data: { due: "2026-12-01", title: "Pay rent" } });
    const c = await dedupeKey(s, { type: "task", data: { title: "Pay rent", due: "2026-12-02" } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(await dedupeKey(s, { type: "task", externalId: "42", data: { title: "A" } })).toBe(await dedupeKey(s, { type: "task", externalId: "42", data: { title: "B" } }));
  });
});

describe("units", () => {
  it("converts and formats", () => {
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80, 6);
    expect(formatWeight(80, "imperial")).toBe("176.4 lb");
    expect(formatWeight(80, "metric")).toBe("80.0 kg");
    expect(formatVolume(2000, "metric")).toBe("2.0 L");
  });
});
