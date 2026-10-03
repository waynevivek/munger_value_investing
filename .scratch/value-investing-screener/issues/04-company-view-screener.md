# 04: Show company analysis and the screener table

**What to build:** An investor can browse the five covered companies, compare their scores, and open an analysis view that explains every check in plain language alongside its figures and result.

**Blocked by:** 03 — Reconcile and ingest five companies from NSE filings.

**Label:** AFK

**Status:** ready-for-agent

- [ ] Show a screener table for the five covered companies, ordered by combined score by default.
- [ ] Let the investor choose a 5- or 10-year history and edit the Buffett/Munger-inspired preset filters.
- [ ] Show the combined score beside quality and valuation subscores; provide useful sorting by those scores and displayed financial measures.
- [ ] Open a company analysis view with the total, both component scores, the underlying figures, selected period, and assumptions.
- [ ] Explain each quality and valuation check in plain language, including what it measures and why the result passed or failed.
- [ ] Display “insufficient data” clearly and do not present it as a low score.
- [ ] Show the source and reporting date for each financial input and the date of the price used.
- [ ] State that the score is a financial aid, not a buy/sell recommendation or an official Buffett/Munger formula.
- [ ] Verify the user-visible behavior without coupling UI tests to private scoring implementation details.

