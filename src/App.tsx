import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_QUOTE,
  addToHistory,
  calculate,
  load,
  loadHistory,
  save,
  saveHistory,
  type Field,
  type HistoryEntry,
  type Values,
} from "./calc";
import "./App.css";

const LABELS: Record<Field, { label: string; placeholder: string }> = {
  price: { label: "Price", placeholder: "Price" },
  weight: { label: "Weight", placeholder: "Kg" },
  fx: { label: "FX", placeholder: "AUD/THB" },
  shipping: { label: "Shipping", placeholder: "AUD/KG" },
};

/** The two values that change on every quote, versus the ones that rarely do. */
const PER_QUOTE: Field[] = ["price", "weight"];
const RATES: Field[] = ["fx", "shipping"];

/** Restores the previous session and its result in one read. */
function initialState(): { values: Values; quote: string } {
  const values = load();
  return { values, quote: calculate(values) ?? INITIAL_QUOTE };
}

/** "14:32" / "Tue 14:32" / "3 Feb" depending on how far back the entry is. */
function formatWhen(at: number): string {
  const then = new Date(at);
  const ageInHours = (Date.now() - at) / 3_600_000;
  if (ageInHours < 24) {
    return then.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (ageInHours < 24 * 7) {
    return then.toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function App() {
  const [initial] = useState(initialState);
  const [values, setValues] = useState<Values>(initial.values);
  const [quote, setQuote] = useState(initial.quote);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});

  const update = useCallback((field: Field, value: string) => {
    setValues((previous) => {
      const next = { ...previous, [field]: value };
      save(next);
      // Live result as you type: this is a quick-access tool, so waiting for a
      // button press to see the number is a round trip that buys nothing.
      const result = calculate(next);
      if (result !== null) setQuote(result);
      return next;
    });
  }, []);

  // Belt and braces: flush again when the tab is backgrounded or closed, which
  // covers the cases where a write could otherwise be lost mid-keystroke.
  useEffect(() => {
    const flush = () => save(values);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [values]);

  const clear = (field: Field) => {
    update(field, "");
    // Focusing inside the click handler keeps the mobile keyboard open, which
    // is what the Android version did via InputMethodManager.
    inputs.current[field]?.focus();
  };

  // The result is already live, so Calculate's job is to commit the current
  // quote to history. Invalid input leaves the previous quote in place, as before.
  const onCalculate = () => {
    save(values);
    const result = calculate(values);
    if (result === null) return;
    setQuote(result);
    setHistory((previous) => {
      const next = addToHistory(previous, {
        quote: result,
        values,
        at: Date.now(),
      });
      saveHistory(next);
      return next;
    });
  };

  /** Tapping a past calculation puts its inputs back into the form. */
  const restore = (entry: HistoryEntry) => {
    setValues(entry.values);
    save(entry.values);
    setQuote(entry.quote);
    setHistoryOpen(false);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    setHistoryOpen(false);
  };

  const renderRow = (field: Field) => (
    <div className="row" key={field}>
      <label className="row-label" htmlFor={field}>
        {LABELS[field].label}
      </label>

      <input
        id={field}
        ref={(element) => {
          inputs.current[field] = element;
        }}
        className="row-input"
        // Shows the decimal keypad on mobile without rejecting paste.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={LABELS[field].placeholder}
        value={values[field]}
        onChange={(event) => update(field, event.target.value)}
        onFocus={(event) => event.target.select()}
      />

      <button
        type="button"
        className="btn btn-clear"
        aria-label={`Clear ${LABELS[field].label}`}
        onClick={() => clear(field)}
      >
        &times;
      </button>
    </div>
  );

  return (
    <main className="panel">
      {/* Pinned at the top so it stays visible once the keyboard is up. */}
      <output className="quote" aria-live="polite">
        {quote}
      </output>

      <section className="group">{PER_QUOTE.map(renderRow)}</section>

      <section className="group group-rates">
        <h2 className="group-title">Rates</h2>
        {RATES.map(renderRow)}
      </section>

      <button type="button" className="btn btn-calculate" onClick={onCalculate}>
        Calculate
      </button>

      <section className="history">
        <button
          type="button"
          className="history-toggle"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-controls="history-list"
          disabled={history.length === 0}
        >
          <span className="history-chevron" data-open={historyOpen} aria-hidden>
            &#9656;
          </span>
          History
          <span className="history-count">{history.length}</span>
        </button>

        {historyOpen && (
          <ul className="history-list" id="history-list">
            {history.map((entry) => (
              <li key={entry.at}>
                <button
                  type="button"
                  className="history-entry"
                  onClick={() => restore(entry)}
                >
                  <span className="history-quote">{entry.quote}</span>
                  <span className="history-detail">
                    {entry.values.price} &times; {entry.values.weight}kg
                    <span className="history-rates">
                      {" "}
                      @ {entry.values.fx} / {entry.values.shipping}
                    </span>
                  </span>
                  <span className="history-when">{formatWhen(entry.at)}</span>
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                className="history-clear"
                onClick={clearHistory}
              >
                Clear history
              </button>
            </li>
          </ul>
        )}
      </section>
    </main>
  );
}
