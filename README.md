# Munger Screener — local NSE pilot

A local web app for a Buffett/Munger-inspired quality-and-value screen. It shows a company's quality checks, owner-earnings-based LOW/BASE/HIGH intrinsic values, and a 50/50 combined score using a verified five-year TCS dataset.

The pilot covers **one company** (TCS, FY2022–FY2026) and **requires a manually entered, dated market price** for valuation. It is a research aid, not investment advice, and not an official Buffett or Munger formula.

## Run it

Requires Node.js 24 or newer. There are no runtime dependencies.

```bash
npm start
# open http://127.0.0.1:3000
```

The server binds to `127.0.0.1` by default. Set `PORT` or `HOST` only if you need a different local address; this pilot has no authentication and is not intended for public hosting.

```bash
npm test
```

## What the demo shows

- **Screener:** covered companies, available fiscal years, and quality score for a 5- or 10-year selection. Columns sort by company, fiscal coverage, or quality. The 10-year option correctly reports missing FY2017–FY2021 rather than scoring five years as ten.
- **Editable preset:** the quality thresholds and check weights can be edited and reset. Changes are scored by the production engine and saved in the browser. The 50/50 combined weights and valuation scenarios are not editable, so the product decision stays fixed.
- **Company view:** quality 100/100, valuation 0/100 at a premium price, combined 50/100, and the full breakdown behind each number.
- **Intrinsic range:** LOW/BASE/HIGH values calculated live by `src/financial-fit.js`, with the growth, terminal-growth, discount-rate, and maintenance-capex assumptions for each case.
- **Market price:** entered manually with an as-of date and source. It is always labelled manual/not live, and stale after 7 days. No price is fetched or stored by the server.
- **Watchlist:** companies can be added from the company view, shown with a star in the screener, and filtered to watchlisted names only. Membership is stored in this browser.
- **Qualitative review:** separate prompts and notes for moat, management and capital allocation, and circle of competence, with a per-section reviewed checkbox. Saved in this browser and never used by the financial score.
- **JSON backup:** export the watchlist and qualitative reviews as a versioned JSON file. Import validates the file first and then replaces the local research; invalid files are rejected without changing what is already saved.
- **Provenance:** every financial input displays its source, reporting date, and mapping method. Statement amounts are ₹ crore; per-share values are ₹.
- **Honest gaps:** missing price, missing fiscal years, invalid manual input, network failures, and insufficient data each have explicit states. Missing data never becomes a low score.

With the documented pilot reference price of ₹3,500 entered manually, the app reproduces the verified output:

| Component | Result |
|---|---:|
| Quality | 100 / 100 |
| Valuation | 0 / 100 |
| Combined (50/50) | 50 / 100 |
| Low intrinsic value | ₹744.35 |
| Base intrinsic value | ₹1,210.38 |
| High intrinsic value | ₹1,940.77 |
| Base-case margin of safety | −189.17% |

₹3,500 was the pilot's reference price; it is **not** a current quote and has no recorded observation date or source. Enter your own dated price to see the valuation move.

## Data

`data/normalized/nse-pilot.csv` contains five annual TCS rows with per-field source, reporting date, and mapping method. The normalization and reconciliation notes are in `data/raw/nse/TCS/reconciliation.md`; ingestion policy is in `docs/nse-pilot-ingestion.md`.

- Manually transcribed from NSE financial-results PDFs and annual reports. There is **no automated NSE collection, scheduled refresh, or live price feed.**
- The other four pilot companies and ten-year coverage are deferred.
- NSE-derived data is kept local. Redistribution rights for the filings and derived figures are **not verified**, so do not publish this dataset or a hosted version without checking the applicable NSE terms.

## Architecture

| Path | Role |
|---|---|
| `src/quality-score.js` | Pure quality scoring (unchanged production engine) |
| `src/financial-fit.js` | Pure valuation and 50/50 combination (unchanged production engine) |
| `src/manual-nse-csv.js` | Validating manual CSV adapter with per-field provenance |
| `src/pilot-data.js` | Loads and describes the pilot dataset |
| `src/screen-service.js` | Validates lookback/manual price/preset, calls the scorer, adds coverage and warnings |
| `src/server.js` | Zero-dependency HTTP API and static file server |
| `public/research.mjs` | Validated browser-local watchlist and qualitative-review storage |
| `public/` | Screener and company-view client (vanilla ES modules) |
| `test/` | Scoring, adapter, service, HTTP, render, and DOM-level UI integration tests |

### API

- `GET /api/health`
- `GET /api/config` — default quality rubric, valuation assumptions, and combined weights
- `GET /api/dataset?lookbackYears=5|10&preset=...` — dataset metadata plus screener rows
- `GET /api/companies?lookbackYears=5|10&preset=...` — screener rows
- `GET /api/companies/:id?lookbackYears=5|10&price=...&asOfDate=YYYY-MM-DD&priceSource=...&preset=...` — full result, provenance, coverage, price metadata, warnings

Price fields are optional together. Supply all three to calculate valuation; any partial or invalid combination returns a `400` with a clear message. Unknown companies return `404`.

`preset` is URL-encoded JSON with optional `qualityChecks` (`id`, `floor`, `target`, `weight` per check) and `marginOfSafetyTargetPercent`. The server applies only those fields to the default configuration; it ignores attempts to change the 50/50 combined weights or the valuation scenarios, and rejects malformed values with `400 invalid-preset`.

## Limitations

- One company, five annual filings. No quarterly context yet.
- Watchlists and qualitative reviews live only in this browser's local storage. Clearing site data removes them, and there is no account sync; use the JSON backup to move them.
- Import replaces local research rather than merging it. Manual prices, the screen preset, and the financial dataset are not part of the backup.
- Screener sorting covers company, fiscal coverage, and quality. Valuation and combined scores need a per-company manual price and are shown in the company view.
- Preset edits are stored in this browser only; they are not part of the financial dataset or a shared team setting.
- Scores are not calibrated to Indian market conditions; the 50/50 blend can let a cheap, weak company and an expensive, strong company both land mid-range.
- Terminal value can dominate the intrinsic range, and maintenance capex is a scenario percentage of historical total capex, not a disclosed figure.
- The manual price's date and source are self-reported and are not independently verified.
- No browser was available for a screenshot or visual review; the UI is covered by a stubbed-DOM integration test against the real HTTP API and scoring modules.
