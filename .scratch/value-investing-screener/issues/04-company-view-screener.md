# 04: Show company analysis and the screener table

**What to build:** An investor can browse the five covered companies, compare their scores, and open an analysis view that explains every check in plain language alongside its figures and result.

**Blocked by:** 03 — Reconcile and ingest five companies from NSE filings.

**Label:** AFK

**Status:** in-progress

- [ ] Show a screener table for the five covered companies, ordered by combined score by default.
- [x] Let the investor choose a 5- or 10-year history and edit the Buffett/Munger-inspired preset filters.
- [ ] Show the combined score beside quality and valuation subscores; provide useful sorting by those scores and displayed financial measures.
- [x] Open a company analysis view with the total, both component scores, the underlying figures, selected period, and assumptions.
- [x] Explain each quality and valuation check in plain language, including what it measures and why the result passed or failed.
- [x] Display “insufficient data” clearly and do not present it as a low score.
- [x] Show the source and reporting date for each financial input and the date of the price used.
- [x] State that the score is a financial aid, not a buy/sell recommendation or an official Buffett/Munger formula.
- [x] Verify the user-visible behavior without coupling UI tests to private scoring implementation details.

## Progress (22 October 2026)

Delivered in issue 08 and extended here:

- The screener table sorts by company, fiscal coverage, and quality, with `aria-sort` and unscored companies kept last.
- A Screen settings panel edits the four quality thresholds, their weights, and the margin-of-safety target. Edits go through `scoreFinancialFit`; the server whitelists only threshold/weight/margin fields, so the 50/50 combined weights and valuation scenarios cannot be changed by a preset. Custom presets persist in browser storage and can be reset.
- Invalid presets return `400 invalid-preset`; the UI validates weights and ordering before applying and restores defaults if a saved preset is rejected.

Still open, because they need the expanded dataset: the five-company table, combined/valuation columns and sorting per row, and a default ordering by combined score. Those move to issue 05 with the remaining company ingestion.

