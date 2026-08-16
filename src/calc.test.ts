import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  HISTORY_LIMIT,
  addToHistory,
  calculate,
  type HistoryEntry,
  type Values,
} from "./calc";

const values = (overrides: Partial<Values> = {}): Values => ({
  ...DEFAULTS,
  price: "0",
  weight: "0",
  ...overrides,
});

describe("calculate", () => {
  it("applies price * 1.2 * fx + weight * fx * shipping", () => {
    // Rates are stated explicitly so this stays true when the defaults change.
    // 100 * 1.2 * 22.5 = 2700, plus 2 * 22.5 * 26 = 1170.
    expect(
      calculate({ fx: "22.5", shipping: "26", price: "100", weight: "2" }),
    ).toBe("3870");
  });

  it("rounds to a whole number, half up", () => {
    // With fx and shipping at 1 and price at 0 the quote is just the weight,
    // which keeps these exactly representable and the rounding unambiguous.
    const fromWeight = (weight: string) =>
      calculate({ fx: "1", shipping: "1", price: "0", weight });

    expect(fromWeight("0.5")).toBe("1");
    expect(fromWeight("1.5")).toBe("2");
    expect(fromWeight("2.5")).toBe("3");
    expect(fromWeight("0.4")).toBe("0");
    expect(fromWeight("1.75")).toBe("2");
  });

  it("uses the stock defaults for fx and shipping", () => {
    expect(DEFAULTS.fx).toBe("22.5");
    expect(DEFAULTS.shipping).toBe("18");
  });

  it("returns null when a field is empty, so the previous quote stays put", () => {
    expect(calculate(values({ price: "" }))).toBeNull();
    expect(calculate(values({ weight: "" }))).toBeNull();
    expect(calculate(values({ fx: "" }))).toBeNull();
    expect(calculate(values({ shipping: "" }))).toBeNull();
  });

  it("returns null for input that is not a number", () => {
    expect(calculate(values({ price: "abc" }))).toBeNull();
    expect(calculate(values({ price: "." }))).toBeNull();
    expect(calculate(values({ price: "1.2.3" }))).toBeNull();
  });

  it("accepts the decimal forms the Android numberDecimal keypad allowed", () => {
    expect(
      calculate({ fx: "1", shipping: "0", price: ".5", weight: "0" }),
    ).toBe("1");
    expect(
      calculate({ fx: "1", shipping: "0", price: "5.", weight: "0" }),
    ).toBe("6");
  });
});

describe("addToHistory", () => {
  const entry = (price: string, at: number): HistoryEntry => ({
    quote: price,
    values: values({ price }),
    at,
  });

  it("puts the newest entry first", () => {
    const history = addToHistory(
      addToHistory([], entry("1", 1)),
      entry("2", 2),
    );
    expect(history.map((item) => item.quote)).toEqual(["2", "1"]);
  });

  it(`keeps at most ${HISTORY_LIMIT} entries`, () => {
    let history: HistoryEntry[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history = addToHistory(history, entry(String(index), index));
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    // The oldest ones fall off the end.
    expect(history[0].quote).toBe(String(HISTORY_LIMIT + 4));
  });

  it("refreshes a repeated calculation instead of duplicating it", () => {
    const history = addToHistory(
      addToHistory(addToHistory([], entry("1", 1)), entry("2", 2)),
      entry("1", 3),
    );
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ quote: "1", at: 3 });
  });
});
