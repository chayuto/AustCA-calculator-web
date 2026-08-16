/**
 * Port of the calculation + persistence logic from the original Android app
 * (me.chayut.austcacal.MainActivity).
 */

export const FIELDS = ["fx", "shipping", "price", "weight"] as const;

export type Field = (typeof FIELDS)[number];

export type Values = Record<Field, string>;

/**
 * Storage keys are kept identical to the Android SharedPreferences keys so the
 * mapping between the two apps stays obvious.
 */
const STORAGE_KEYS: Record<Field, string> = {
  fx: "PREF_FX",
  shipping: "PREF_SHIPPING",
  price: "PREF_PRICE",
  weight: "PREF_WEIGHT",
};

/** Same defaults the Android app seeded its EditTexts with. */
export const DEFAULTS: Values = {
  fx: "22.5",
  shipping: "26",
  price: "",
  weight: "",
};

/** Text shown in the quote area before the first successful calculation. */
export const INITIAL_QUOTE = "Quote";

/**
 * Equivalent of Kotlin's String.toFloat(): returns NaN for anything that isn't
 * a plain finite number, including the empty string.
 */
function parse(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * quote = price * 1.2 * fx + weight * fx * shipping
 *
 * Returns null when any input fails to parse. The Android version swallowed the
 * NumberFormatException and left the previous quote on screen, so callers should
 * treat null as "leave the display alone".
 */
export function calculate(values: Values): string | null {
  const fx = parse(values.fx);
  const price = parse(values.price);
  const weight = parse(values.weight);
  const shipping = parse(values.shipping);

  if ([fx, price, weight, shipping].some(Number.isNaN)) return null;

  const quote = price * 1.2 * fx + weight * fx * shipping;
  if (!Number.isFinite(quote)) return null;

  // Matches String.format("%.0f", quote) — half-up to a whole number.
  return String(Math.round(quote));
}

/**
 * localStorage rather than sessionStorage: SharedPreferences survived the app
 * being closed, and sessionStorage would not. There is nothing sensitive here,
 * so the values are stored as plain text under stable keys.
 */
export function load(): Values {
  const values = { ...DEFAULTS };
  try {
    for (const field of FIELDS) {
      const stored = localStorage.getItem(STORAGE_KEYS[field]);
      if (stored !== null) values[field] = stored;
    }
  } catch {
    // Private-mode browsers can throw on access; fall back to the defaults.
  }
  return values;
}

export function save(values: Values): void {
  try {
    for (const field of FIELDS) {
      localStorage.setItem(STORAGE_KEYS[field], values[field]);
    }
  } catch {
    // Storage full or blocked — calculating still works, so don't interrupt.
  }
}

/* ------------------------------------------------------------------ history */

const HISTORY_KEY = "PREF_HISTORY";

/** How many past calculations are kept. Oldest entries fall off the end. */
export const HISTORY_LIMIT = 20;

export type HistoryEntry = {
  /** The rounded quote, as displayed. */
  quote: string;
  /** The inputs that produced it, so an entry can be reloaded. */
  values: Values;
  /** Epoch milliseconds. */
  at: number;
};

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.quote === "string" &&
    typeof entry.at === "number" &&
    typeof entry.values === "object" &&
    entry.values !== null &&
    FIELDS.every((field) => typeof entry.values![field] === "string")
  );
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Anything malformed is dropped rather than crashing the app on open.
    return Array.isArray(parsed)
      ? parsed.filter(isEntry).slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Not worth interrupting a calculation over.
  }
}

function sameInputs(a: Values, b: Values): boolean {
  return FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Prepends an entry, newest first. Repeating the same calculation refreshes the
 * existing entry's timestamp instead of filling the list with duplicates.
 */
export function addToHistory(
  entries: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  const withoutDuplicate = entries.filter(
    (existing) => !sameInputs(existing.values, entry.values),
  );
  return [entry, ...withoutDuplicate].slice(0, HISTORY_LIMIT);
}
