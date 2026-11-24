/** Money is always an integer number of minor units (cents). Floats never hold currency. */
export type Minor = number;

export function assertMinor(v: number): asserts v is Minor {
  if (!Number.isSafeInteger(v)) throw new RangeError(`Not an integer minor-unit amount: ${v}`);
}

/** "1,234.56" | "-12.5" | "$7" -> minor units. Rejects anything ambiguous. */
export function parseMinor(input: string): Minor {
  const s = input.trim().replace(/[$,\s]/g, "");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError(`Cannot parse amount: "${input}"`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0") || "0");
  assertMinor(cents);
  return m[1] ? -cents : cents;
}

export function sumMinor(values: readonly Minor[]): Minor {
  return values.reduce((a, b) => {
    assertMinor(b);
    return a + b;
  }, 0);
}

export function formatMoney(minor: Minor, opts: { currency?: string; locale?: string; compact?: boolean } = {}): string {
  assertMinor(minor);
  const { currency = "CAD", locale = "en-CA", compact = false } = opts;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  }).format(minor / 100);
}

/** Splits `total` by integer weights with no cent lost or invented (largest remainder). */
export function allocate(total: Minor, weights: readonly number[]): Minor[] {
  assertMinor(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || sum <= 0 || weights.some((w) => w < 0)) throw new RangeError("Invalid weights");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / sum);
  const out = raw.map(Math.floor);
  let rest = abs - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i]++;
    rest--;
  }
  return out.map((v) => v * sign);
}
