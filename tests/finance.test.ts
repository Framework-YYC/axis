import { describe, expect, it } from "vitest";
import { allocate, formatMoney, parseMinor, sumMinor } from "../shared/money";
import { balanceDeltas, cashFlow, deriveKind, type Account, type Txn } from "../shared/ledger";

const accounts = new Map<string, Account>([
  ["chq", { id: "chq", type: "bank" }], ["sav", { id: "sav", type: "bank" }],
  ["visa", { id: "visa", type: "credit_card" }], ["loan", { id: "loan", type: "loan" }],
]);

describe("money", () => {
  it("parses to integer cents without float error", () => {
    expect(parseMinor("$1,234.56")).toBe(123456);
    expect(parseMinor("-0.1")).toBe(-10);
    expect(parseMinor("19.99") + parseMinor("0.01")).toBe(2000);
    expect(() => parseMinor("1.234")).toThrow();
    expect(() => parseMinor("abc")).toThrow();
  });
  it("rejects non-integer minor units", () => {
    expect(() => sumMinor([1, 2.5])).toThrow();
    expect(() => formatMoney(10.5)).toThrow();
  });
  it("formats CAD", () => expect(formatMoney(123456)).toMatch(/1,234\.56/));
  it("allocates without losing a cent", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocate(-100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-100);
    expect(allocate(1000, [50, 30, 20])).toEqual([500, 300, 200]);
  });
});

describe("ledger classification", () => {
  const card: Txn = { id: "1", accountId: "visa", amountMinor: -10000 }; // $100 purchase on the card
  const payment: Txn = { id: "2", accountId: "chq", counterAccountId: "visa", amountMinor: -10000 }; // paid from chequing
  const move: Txn = { id: "3", accountId: "chq", counterAccountId: "sav", amountMinor: -50000 };
  const pay: Txn = { id: "4", accountId: "chq", amountMinor: 250000 };

  it("classifies kinds", () => {
    expect(deriveKind(card, accounts)).toBe("expense");
    expect(deriveKind(payment, accounts)).toBe("card_payment");
    expect(deriveKind(move, accounts)).toBe("transfer");
    expect(deriveKind({ ...payment, counterAccountId: "loan" }, accounts)).toBe("loan_payment");
    expect(deriveKind(pay, accounts)).toBe("income");
  });
  it("does not double count a card purchase and its payment, or transfers", () => {
    const cf = cashFlow([card, payment, move, pay], accounts);
    expect(cf).toEqual({ income: 250000, expenses: 10000, net: 240000 });
  });
  it("transfers net to zero across accounts", () => {
    const total = [...balanceDeltas(move), ...balanceDeltas(payment)].reduce((a, d) => a + d.delta, 0);
    expect(total).toBe(0);
  });
  it("rejects a transaction pointing at an unknown account", () => {
    expect(() => deriveKind({ id: "x", accountId: "chq", counterAccountId: "ghost", amountMinor: -1 }, accounts)).toThrow();
  });
});
