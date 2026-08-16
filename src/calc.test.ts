import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULTS,
  HISTORY_LIMIT,
  addToHistory,
  calculate,
  kilogramsToGrams,
  loadHistory,
  migrate,
  readWeight,
  MAX_WEIGHT_G,
  MIN_WEIGHT_G,
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
  it("applies price * 1.2 * fx + (weight / 1000) * fx * shipping", () => {
    // Rates are stated explicitly so this stays true when the defaults change.
    // 100 * 1.2 * 22.5 = 2700, plus 2kg * 22.5 * 26 = 1170.
    expect(
      calculate({ fx: "22.5", shipping: "26", price: "100", weight: "2000" }),
    ).toBe("3870");
  });

  it("treats the weight field as grams against a per-kilogram rate", () => {
    // A 330 g parcel at 18 AUD/kg and fx 1: 0.33 * 18 = 5.94 -> 6.
    expect(
      calculate({ fx: "1", shipping: "18", price: "0", weight: "330" }),
    ).toBe("6");
    // Ten times the weight is ten times the shipping component.
    expect(
      calculate({ fx: "1", shipping: "18", price: "0", weight: "3300" }),
    ).toBe("59");
  });

  it("rounds to a whole number, half up", () => {
    // With fx and shipping at 1 and price at 0 the quote is the weight in kg,
    // which keeps these exactly representable and the rounding unambiguous.
    const fromGrams = (weight: string) =>
      calculate({ fx: "1", shipping: "1", price: "0", weight });

    expect(fromGrams("500")).toBe("1");
    expect(fromGrams("1500")).toBe("2");
    expect(fromGrams("2500")).toBe("3");
    expect(fromGrams("400")).toBe("0");
    expect(fromGrams("1750")).toBe("2");
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

describe("migrate", () => {
  class MemoryStorage {
    private data = new Map<string, string>();
    getItem(key: string) {
      return this.data.has(key) ? this.data.get(key)! : null;
    }
    setItem(key: string, value: string) {
      this.data.set(key, value);
    }
    clear() {
      this.data.clear();
    }
  }

  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  });

  it("converts a stored kilogram weight into grams, once", () => {
    localStorage.setItem("PREF_WEIGHT", "0.33");
    migrate();
    expect(localStorage.getItem("PREF_WEIGHT")).toBe("330");

    // Running again must not multiply it a second time.
    migrate();
    expect(localStorage.getItem("PREF_WEIGHT")).toBe("330");
  });

  it("converts weights inside history too", () => {
    localStorage.setItem(
      "PREF_HISTORY",
      JSON.stringify([
        { quote: "3870", at: 1, values: values({ price: "100", weight: "2" }) },
      ]),
    );
    migrate();
    expect(loadHistory()[0].values.weight).toBe("2000");
  });

  it("leaves a blank or unparseable weight alone", () => {
    localStorage.setItem("PREF_WEIGHT", "");
    migrate();
    expect(localStorage.getItem("PREF_WEIGHT")).toBe("");
  });

  it("is a no-op on a device with nothing stored", () => {
    migrate();
    expect(localStorage.getItem("PREF_WEIGHT")).toBeNull();
    expect(loadHistory()).toEqual([]);
  });
});

describe("kilogramsToGrams", () => {
  it("scales by 1000 and rounds to whole grams", () => {
    expect(kilogramsToGrams("0.33")).toBe("330");
    expect(kilogramsToGrams("2")).toBe("2000");
    expect(kilogramsToGrams("0.1235")).toBe("124");
  });

  it("passes through anything it cannot parse", () => {
    expect(kilogramsToGrams("")).toBe("");
    expect(kilogramsToGrams("abc")).toBe("abc");
  });
});

describe("readWeight", () => {
  // grams === null means "no usable number", which leaves the quote untouched.
  const cases: Array<{
    input: string;
    grams: number | null;
    corrected?: boolean;
    underMin?: boolean;
    overMax?: boolean;
    why: string;
  }> = [
    // --- nothing usable -----------------------------------------------------
    { input: "", grams: null, why: "empty field" },
    { input: "   ", grams: null, why: "whitespace only" },
    { input: "abc", grams: null, why: "not a number" },
    { input: ".", grams: null, why: "a lone decimal point" },
    { input: "1.2.3", grams: null, why: "two decimal points" },
    { input: "-5", grams: null, why: "negative grams are meaningless" },
    { input: "-0.5", grams: null, why: "negative kilograms too" },

    // --- decimals are always kilograms -------------------------------------
    { input: ".33", grams: 330, corrected: true, why: "no leading zero" },
    { input: "0.33", grams: 330, corrected: true, why: "with leading zero" },
    { input: "0,33", grams: 330, corrected: true, why: "comma decimal key" },
    { input: "1.5", grams: 1500, corrected: true, why: "1.5 kg" },
    { input: "0.5", grams: 500, corrected: true, why: "half a kilo" },
    { input: "2.0", grams: 2000, corrected: true, why: "trailing .0 is still 2 kg" },
    { input: "0.02", grams: 20, corrected: true, why: "exactly the lightest SKU" },

    // --- whole numbers too light to be grams are kilograms ------------------
    { input: "1", grams: 1000, corrected: true, why: "1 g is below the 20 g floor" },
    { input: "2", grams: 2000, corrected: true, why: "2 kg is the heaviest SKU" },

    // --- whole numbers inside the gram range are taken at face value --------
    { input: "20", grams: 20, why: "the lightest SKU, exactly" },
    { input: "33", grams: 33, why: "33 is grams, definitely not 33 kg" },
    { input: "330", grams: 330, why: "a typical parcel" },
    { input: "500", grams: 500, why: "top of the usual range" },
    { input: "1500", grams: 1500, why: "a heavy but real parcel" },
    { input: "2000", grams: 2000, why: "the heaviest SKU, exactly" },
    { input: "1e3", grams: 1000, why: "exponent notation still parses" },

    // --- neither reading fits: flagged, not silently bent ------------------
    { input: "0", grams: 0, why: "mid-typing, so no warning" },
    { input: "3", grams: 3, underMin: true, why: "3 kg exceeds max, so 3 g" },
    { input: "19", grams: 19, underMin: true, why: "just under the lightest SKU" },
    { input: "5.", grams: 5, underMin: true, why: "half-typed decimal" },
    { input: "0.019", grams: 19, corrected: true, underMin: true, why: "19 g in kg form" },
    { input: "2.5", grams: 2500, corrected: true, overMax: true, why: "over the 2 kg max" },
    { input: "2001", grams: 2001, overMax: true, why: "one gram too heavy" },
    { input: "3300", grams: 3300, overMax: true, why: "well over the max" },
  ];

  for (const c of cases) {
    it(`"${c.input}" -> ${c.grams === null ? "no reading" : c.grams + " g"} (${c.why})`, () => {
      expect(readWeight(c.input)).toEqual({
        grams: c.grams,
        corrected: c.corrected ?? false,
        underMin: c.underMin ?? false,
        overMax: c.overMax ?? false,
      });
    });
  }

  it("never reports a value outside the range as in-range", () => {
    for (const c of cases) {
      const r = readWeight(c.input);
      if (r.grams === null) continue;
      expect(r.underMin).toBe(r.grams > 0 && r.grams < MIN_WEIGHT_G);
      expect(r.overMax).toBe(r.grams > MAX_WEIGHT_G);
    }
  });

  it("reads every whole number in the SKU range as grams, unchanged", () => {
    for (let g = MIN_WEIGHT_G; g <= MAX_WEIGHT_G; g += 1) {
      const r = readWeight(String(g));
      expect(r).toMatchObject({ grams: g, corrected: false, underMin: false, overMax: false });
    }
  });

  it("agrees with itself: typing kg or the equivalent grams gives one quote", () => {
    const rates = { fx: "22.5", shipping: "18", price: "100" };
    for (const [kg, grams] of [
      [".33", "330"],
      ["0.5", "500"],
      ["1.5", "1500"],
      ["2", "2000"],
      ["1", "1000"],
    ]) {
      expect(calculate({ ...rates, weight: kg })).toBe(
        calculate({ ...rates, weight: grams }),
      );
    }
  });
});
