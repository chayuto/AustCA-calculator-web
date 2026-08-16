# AustCA Cal

Mobile-first web version of the [AustCA-calculator](https://github.com/chayuto/AustCA-calculator)
Android app. Quote calculator for FX, shipping, price and weight.

```
quote = price × 1.2 × fx + weight × fx × shipping
```

## Behaviour carried over from the Android app

- Same formula, rounded half-up to a whole number.
- Same defaults: FX `22.5`, Shipping `26`.
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
