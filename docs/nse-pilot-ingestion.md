# NSE pilot ingestion

## Coverage check (3 October 2026)

NSE's [Regulation 33 financial-results page](https://www.nseindia.com/companies-listing/corporate-filings-financial-results) offers CSV download and XBRL-to-Excel conversion. NSE describes its [XBRL filings](https://www.nseindia.com/static/companies-listing/xbrl-information) as tagged financial-statement and compliance information, but the filing is company-submitted and must be checked against its annual report. The exchange does not promise that these filings directly supply all the normalized inputs used by this screener.

| Scoring input | Available directly? | Pilot mapping |
| --- | --- | --- |
| Net income | Generally a reported profit-and-loss statement item | Record the selected annual/consolidated or standalone value consistently. |
| Debt-to-equity | No single normalized ratio is guaranteed | Derive interest-bearing borrowings divided by shareholders' equity; record the exact debt and equity line mapping. Do not substitute total liabilities for debt. |
| Return on capital | No single normalized ratio is guaranteed | Derive from operating profit after tax and a documented average invested-capital denominator. Record component line items and formula in the field mapping. |
| Free cash flow | Not generally a single standardized result | Derive operating cash flow minus capital expenditure. `operatingCashFlow` and `capitalExpenditure` are separately required by the scorer. |
| Owner earnings | No single filed figure | Apply the method in `.scratch/value-investing-screener/decision-log.md`, including earnings attribution, non-cash charges and additional working capital, then normalize per share. Preserve the component mapping and formula. |
| Maintenance capex | Not separately identified from total capex in the standard filing | The prototype estimates it as an explicit scenario percentage of average reported total capex. Do not label total capex as maintenance capex or invent a company-specific split. |

ROIC, debt-to-equity, free cash flow, and owner earnings therefore need a documented mapping or calculation. Maintenance capex remains an estimate. The filings alone do not establish ten years of consistent history for each issuer; inspect the actual company filing archive and annual reports before claiming a 5- or 10-year score.

## Manual import format

`src/manual-nse-csv.js` accepts a manually prepared CSV with one row per company fiscal year. It does not access NSE or interpret every evolving NSE taxonomy/XBRL presentation. Use NSE's manual CSV/XBRL export and annual report as source material, then enter the checked normalized values in the following columns:

- `companyId`, `companyName`, `currency`, `fiscalYear`, `source`, `reportingDate`
- Each of `returnOnCapitalPercent`, `debtToEquity`, `netIncome`, `operatingCashFlow`, `capitalExpenditure`, `ownerEarningsBeforeMaintenanceCapexPerShare`, and `totalCapitalExpenditurePerShare`
- For each populated financial field, `<field>Source`, `<field>ReportingDate`, and `<field>Method`

Keep monetary inputs in a consistent unit for the company and year history. Use blank cells when a value cannot be verified; the adapter preserves them as `null`, which lets the scoring functions return insufficient data. Do not fill a gap with a value from a different period or source without recording that source and mapping. The adapter sorts records by fiscal year and rejects duplicate company-years, malformed numbers, and populated values without field-level provenance.

## TCS-only five-year pilot (completed October 2026)

The TCS-only, five-year manual pilot is recorded in `data/normalized/nse-pilot.csv`, with its source mappings and reconciliation at `data/raw/nse/TCS/reconciliation.md`. It covers FY2021-22 through FY2025-26. Annual reports alone do not supply a ready-made normalized dataset: they and the results attachments both contain useful statement data, but ROIC, debt/equity, free cash flow, and owner earnings need the documented mappings. For this pilot, use both the annual-results PDFs and annual reports to check the statements and ratio definitions.

**Status**: Quality score 100/100; financial fit scored (total 50, quality 100 × 50% + valuation 0 × 50%). With the pilot reference price of ₹3,500 entered manually, the model intrinsic value is ~₹1,210 and the margin of safety is negative, indicating TCS trades as a premium-quality franchise at that reference price. No price observation is stored: ₹3,500 is undated and unsourced, and the local screener requires the user to enter a dated manual price before valuation is calculated. A local UI over this dataset is available with `npm start`; see `README.md`.

**Deferred**: The other four companies (HINDUNILVR, MARUTI, NTPC, ULTRACEMCO) and 10-year coverage remain deferred until TCS end-to-end review is complete. No automated NSE collection has been added; manual-only approach preserved per NSE copyright and terms-of-use policy.

## Rights and collection method

The NSE website's [copyright policy](https://www.nseindia.com/static/nse-copyright) permits users to view, print, and download content for personal, non-commercial, or educational use with acknowledgement. It reserves copyright and restricts reproducing or transmitting content elsewhere. NSE's [data-sharing policy](https://www.nseindia.com/static/market-data/nse-data-policy) says market-data redistribution is permitted only as agreed in the relevant agreement. NSE's [Terms of Use](https://www.nseindia.com/static/nse-terms-of-use) prohibit systematic or automated collection, including scraping, mining, extraction, or harvesting.

For this pilot, download each filing manually from the NSE financial-results interface and reconcile it locally. Do not add a scraper, automated downloader, scheduled refresh, or public-hosted NSE-derived dataset. These public terms do not establish permission to redistribute the normalized figures in a public product; obtain applicable rights before that step. Price data needs a separate source and rights review.
