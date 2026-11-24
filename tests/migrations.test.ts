import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = join(import.meta.dirname, "..", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

describe("migrations", () => {
  it("are sequentially numbered", () => {
    files.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(4, "0") + "_")).toBe(true));
  });
  it("contain no destructive statements", () => {
    for (const f of files) {
      // Trigger headers ("BEFORE UPDATE ON t") name an operation without performing one, and a trigger only ever raises an error here.
      const sql = readFileSync(join(dir, f), "utf8").replace(/--.*$/gm, "").replace(/BEFORE\s+(INSERT|UPDATE|DELETE)\s+ON\s+\w+/gi, "").replace(/'[^']*'/g, "''"); // string literals (op names, messages) are data, not statements
      expect(sql, f).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|RENAME|PRAGMA)\b|INSERT\s+OR\s+REPLACE|\bREPLACE\s+INTO/i);
    }
  });
  it("apply cleanly and seed the initial categories and defaults", () => {
    const db = new DatabaseSync(":memory:");
    for (const f of files) db.exec(readFileSync(join(dir, f), "utf8"));
    const cats = db.prepare("SELECT name FROM categories ORDER BY sort_order").all().map((r) => r.name);
    expect(cats).toEqual(["Personal", "Work", "Finance", "Framework", "Nexus", "Health", "Learning & Development"]);
    const cur = db.prepare("SELECT value FROM settings WHERE key='currency'").get();
    expect(cur?.value).toBe("CAD");
    expect(() => db.prepare("INSERT INTO categories (id,name) VALUES ('x','Personal')").run()).toThrow(); // unique names
  });
});
