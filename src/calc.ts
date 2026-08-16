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
  shipping: "18",
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

/** Weight is entered in grams; the shipping rate is per kilogram. */
export const GRAMS_PER_KG = 1000;

/**
 * quote = price * 1.2 * fx + (weight / 1000) * fx * shipping
 *
 * Returns null when any input fails to parse. The Android version swallowed the
 * NumberFormatException and left the previous quote on screen, so callers should
 * treat null as "leave the display alone".
 */
export function calculate(values: Values): string | null {
  const fx = parse(values.fx);
  const price = parse(values.price);
  const grams = parse(values.weight);
  const shipping = parse(values.shipping);

  if ([fx, price, grams, shipping].some(Number.isNaN)) return null;

  const quote = price * 1.2 * fx + (grams / GRAMS_PER_KG) * fx * shipping;
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

/* ---------------------------------------------------------------- migration */

const SCHEMA_KEY = "PREF_SCHEMA";

/** 2 = weight is stored in grams. Anything earlier stored it in kilograms. */
const SCHEMA_VERSION = 2;

/** "0.33" kg -> "330" g. Non-numeric or blank values are left untouched. */
export function kilogramsToGrams(raw: string): string {
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(parsed)) return raw;
  // Grams are fine as whole numbers at the scale this app deals with.
  return String(Math.round(parsed * GRAMS_PER_KG));
}

/**
 * Rewrites anything already on the device into the current schema. Without this,
 * a stored "2" meaning 2 kg would silently start meaning 2 g.
 *
 * Must run before the first load().
 */
export function migrate(): void {
  try {
    if (Number(localStorage.getItem(SCHEMA_KEY)) >= SCHEMA_VERSION) return;

    const weight = localStorage.getItem(STORAGE_KEYS.weight);
    if (weight !== null) {
      localStorage.setItem(STORAGE_KEYS.weight, kilogramsToGrams(weight));
    }

    const history = loadHistory();
    if (history.length > 0) {
      saveHistory(
        history.map((entry) => ({
          ...entry,
          values: {
            ...entry.values,
            weight: kilogramsToGrams(entry.values.weight),
          },
        })),
      );
    }

    localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
  } catch {
    // A failed migration must not stop the app from opening.
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
