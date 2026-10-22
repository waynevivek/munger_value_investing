# 08: Ship the TCS screener and company view

**What to build:** A working local web product over the verified TCS five-year dataset: a screener row, a company analysis view, a manually entered market price, honest coverage/provenance labels, and reliable loading/empty/error states.

**Blocked by:** 03 (TCS pilot data), 04 (company view requirements).

**Status:** done

## Audit findings (22 October 2026)

Working, and reused as-is:

- `src/quality-score.js` and `src/financial-fit.js` are pure, validated scoring modules. With the pilot CSV and a dated price of ₹3,500 they return quality 100, valuation 0, total 50, and LOW/BASE/HIGH intrinsic values of ₹744.35 / ₹1,210.38 / ₹1,940.77.
- `src/manual-nse-csv.js` normalizes the five TCS fiscal years with complete per-field source, reporting date, and method. `data/normalized/nse-pilot.csv` is the only dataset.
- 25 tests pass and no application code exists yet.

Missing or misleading:

- There is no UI, HTTP layer, README, or runtime entry point. `package.json` only exposes `node --test`.
- No market-price observation with a date and source is stored anywhere. ₹3,500 appears only as an unlabelled input default in `prototypes/val-prototype.html`. The product must not present it as a current or sourced quote.
- A ₹3,500 price gives a large negative margin of safety. Displaying valuation "0" without explaining that it is a price-vs-value score would read as a quality failure.
- A 10-year selection currently has no data behind it; the UI must show the missing years and "insufficient data", not a low score.
- Financial figures mix ₹ crore (`netIncome`, cash flow, capex) with ₹ per share. Labels must keep the units distinct.
- `prototypes/val-prototype.html` duplicates valuation math and is disposable; it will not be used.

## Plan (in priority order)

1. `src/pilot-data.js` — load and describe the CSV through the existing manual adapter; expose coverage years and dataset-level manual/rights metadata.
2. `src/screen-service.js` — validate lookback and the optional manual price, call `scoreFinancialFit`, and add coverage, price-age, warnings, and provenance. No valuation math is reimplemented.
3. `src/server.js` — zero-dependency Node HTTP server: `GET /api/health`, `/api/dataset`, `/api/companies`, `/api/companies/:id`, plus static files from `public/`.
4. `public/` — vanilla-JS screener and company view: scores, intrinsic range, margin of safety, quality breakdown, assumptions, per-field provenance, manual-price labels, warnings.
5. Tests and documentation.

## Acceptance criteria

- [x] `npm start` serves the UI and API locally with no added dependencies.
- [x] The screener lists covered companies with fiscal coverage and quality score at the selected 5- or 10-year lookback.
- [x] The TCS view shows overview, quality score, LOW/BASE/HIGH values, entered price, margin of safety, and every quality check's figure and points.
- [x] Intrinsic values and totals are calculated by `scoreFinancialFit` from the CSV, never hardcoded in the UI.
- [x] A price is accepted only with a positive value, a real calendar date that is not in the future, and a non-empty source. It is always labelled manual/not live, and as stale after 7 days.
- [x] Without a price, valuation and total are `null` with an explicit "price required" state — not zero.
- [x] A 10-year lookback returns "insufficient data" and names the missing fiscal years.
- [x] Every displayed financial input exposes its source, reporting date, and mapping method; the ₹ crore / ₹ per-share units are labelled.
- [x] Loading, empty (no company selected / no price), and error (network, 400, 404, 500) states are explicit and retryable.
- [x] The disclaimer and the unverified NSE redistribution status are visible.

## Tests

- `test/screen-service.test.js` — live calculation at ₹3,500, no-price state, stale price, 10-year coverage gap, invalid lookback/partial price/impossible date/future date, unknown company, provenance completeness.
- `test/server.test.js` — API responses, validation status codes, static serving, path-traversal rejection, security headers.
- `test/render.test.js` — unit/currency/percent formatting, insufficient-data labels, manual/stale price labels, warning and missing-data text, HTML escaping.
- `test/ui-integration.test.js` — boots the real API, imports the browser module into a stubbed DOM, verifies the initial stale-price render, submits a fresh manual price through the form handler, and clears it back to the no-price state.
- Existing scoring and CSV tests continue to pass unchanged.

## Result (22 October 2026)

Implemented `src/pilot-data.js`, `src/screen-service.js`, `src/server.js`, `public/index.html`, `public/styles.css`, `public/app.mjs`, `public/render.mjs`, `README.md`, and the tests above. `package.json` now exposes `npm start`.

Verified with `npm test`: **49 passing, 0 failing** (the original 25 plus 24 new tests). A live `npm start` smoke test on port 3123 returned quality 100, valuation 0, total 50, and LOW/BASE/HIGH ₹744.35 / ₹1,210.38 / ₹1,940.77 for a manually entered ₹3,500 dated 2026-10-01.

No price observation was added to the dataset. ₹3,500 remains an undated, unsourced pilot reference that must be typed into the app with a real as-of date and source; the server stores no price. No browser was available for a visual screenshot review, so UI behavior is verified through the DOM-level integration test instead.
