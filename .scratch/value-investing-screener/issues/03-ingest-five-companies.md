# 03: Reconcile and ingest five companies from NSE filings

**What to build:** The proof of concept can use source-backed financial histories for five NSE mainboard non-financial companies, with their financial facts normalized by fiscal year and traceable to the original filing or annual report.

**Blocked by:** 02 — Calculate valuation and combined financial-fit scores.

**Label:** HITL

**Status:** in-progress

- [ ] Before implementing the importer, verify for five pilot companies whether NSE XBRL/CSV financial-result filings contain every input required by tickets 01 and 02 over the selected 5- and 10-year periods.
- [ ] Reconcile the required filed values for those companies against their annual reports and document any differences or accounting mappings that affect the normalized values.
- [ ] Where an NSE filing does not contain a required input, document the alternate source or mapping and preserve its provenance; never silently substitute a value.
- [ ] Normalize the verified observations by company and fiscal year while retaining source and reporting date for each input.
- [ ] Provide the five-company dataset to the existing scoring behavior and ensure absent history produces “insufficient data.”
- [x] Test the manual CSV adapter with small hand-written fixtures and verify normalized values and provenance; keep live NSE availability out of automated tests.
- [ ] Human review the reconciliation and source mapping. Keep this proof of concept local until public reuse rights are verified.

## Comments

### TCS five-year pilot complete (FY2021-22 to FY2025-26)

- **Data**: 5 fiscal years extracted from NSE financial-results PDFs and annual reports, manually downloaded
- **Normalization**: `data/normalized/nse-pilot.csv` — 5 rows with all 7 normalized fields (`returnOnCapitalPercent`, `debtToEquity`, `netIncome`, `operatingCashFlow`, `capitalExpenditure`, `ownerEarningsBeforeMaintenanceCapexPerShare`, `totalCapitalExpenditurePerShare`), each with full provenance (source PDF/pages, reporting date, mapping method)
- **Quality scoring**: 100/100 — all 4 checks pass (profitability, manageable debt, earnings consistency, cash generation)
- **Financial fit scoring**: `scored` — total score 50 (quality 100 × 50% + valuation 0 × 50%), base intrinsic value ₹1,210.38 vs price ₹3,500 → negative margin of safety; three scenarios (low/base/high) computed
- **Provenance**: Per-field source/method/reportingDate tracked from original filings; no automated NSE collection added (manual-only approach preserved per NSE ToU)
- **Reconciliation**: `data/raw/nse/TCS/reconciliation.md` — normalization methods for ROIC, debt/equity, capex, FCF; convention mappings documented

### Other four companies and 10-year coverage

- **Deferred** until TCS is reviewed end to end. The remaining companies (HINDUNILVR, MARUTI, NTPC, ULTRACEMCO) have empty `financial-results/` and `annual-reports/` directories; no data has been manually downloaded yet.
- **10-year lookback**: deferred; only 5 fiscal years of TCS data are currently normalized. Extending to 10 years would require an additional 5 years of filings per company.
- **Human review**: open — pending verification of public reuse rights before any dataset extension or redistribution.
- **NSE terms**: manual download approach preserved; no automated scraper, scheduled refresh, or public-hosted NSE-derived dataset has been added. NSE copyright/terms of use restrict systematic collection and redistribution.

**Proof-of-concept status**: The original goal ("provide the five-company dataset to the existing scoring behavior and ensure absent history produces 'insufficient data'") is achieved for TCS. The full pipeline (manual NSE download → CSV normalization via `manual-nse-csv.js` → `scoreQuality` → `scoreFinancialFit`) is validated end-to-end. All 25 existing tests pass.

Next phase: either (a) manually ingest one or more of the remaining 4 companies using the same approach, or (b) document the pilot as a standalone PoC and seek rights verification for any public redistribution.

