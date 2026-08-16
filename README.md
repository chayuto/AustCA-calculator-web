# AustCA Cal

Mobile-first web version of the [AustCA-calculator](https://github.com/chayuto/AustCA-calculator)
Android app. Quote calculator for FX, shipping, price and weight.

```
quote = price × 1.2 × fx + (weight_g / 1000) × fx × shipping
```

## Behaviour carried over from the Android app

- Same formula, rounded half-up to a whole number.
- Same FX default of `22.5`. Shipping defaults to `18` (the Android app shipped `26`).
- Invalid or empty input leaves the previous quote on screen rather than erroring.

## What changed

- **Live result.** The quote updates as you type. `Calculate` is still there, and
  now also commits the result to history.
- **Storage.** `SharedPreferences` became `localStorage`, which has the same
  survives-a-restart semantics. `sessionStorage` would not — it is wiped when the
  tab closes. Values are written on every keystroke and flushed again when the
  page is hidden, so nothing is lost.
- **History.** The last 20 calculations are kept. Tap one to load its inputs back
  into the form. Repeating a calculation refreshes the existing entry instead of
  duplicating it.
- **Weight is entered in grams**, not kilograms — most parcels are 100–500 g, and
  typing `330` beats typing `0.33` on a phone. The shipping rate stays AUD per kg.
  A one-time migration rescales any weight and history already stored on the device.
- **The weight unit is inferred.** Every SKU weighs between 20 g and 2 kg, so for
  any typed number at most one of "grams" and "kilograms" normally lands in range:

  | typed | read as | why |
  |---|---|---|
  | `.33`, `0.33`, `1.5` | 330 g, 330 g, 1500 g | fractional grams never occur |
  | `1`, `2` | 1000 g, 2000 g | 1 g is below the lightest SKU |
  | `20`, `33`, `330`, `2000` | as typed | already in the gram range |
  | `19`, `3` | 19 g, 3 g — flagged | too light; 19 kg is not a parcel either |
  | `2.5`, `3300` | 2500 g, 3300 g — flagged | over the 2 kg max |

  The typed text is never rewritten while you type. Instead a line under the field
  says what was assumed (`.33 kg = 330 g`), and out-of-range weights are flagged in
  red but still calculated. A comma decimal key (`0,33`) is accepted too.
- **Layout.** Price and Weight sit at the top since they change every time; FX and
  Shipping are demoted to a `Rates` group. The result is pinned above the inputs so
  it stays visible when the keyboard is up.
- **Offline.** A service worker caches the app, so repeat opens are instant and
  work with no connection. Installable to the home screen as a PWA.

Nothing is sent anywhere — there is no account, no server, and no analytics. All
state lives in the browser on the device.

## Develop

```bash
npm install
npm run dev
npm test
```

## Deploy

Published to GitHub Pages from the `gh-pages` branch. This pushes the built
`dist/` directly and does not depend on GitHub Actions:

```bash
npm run deploy
```
