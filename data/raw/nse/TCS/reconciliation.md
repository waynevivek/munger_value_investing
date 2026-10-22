# TCS NSE pilot reconciliation (FY2021-22 to FY2025-26)

## Scope and files

This manual pilot uses the five annual financial-results PDFs and five annual reports in this directory. The results PDFs are the primary source for the normalized rows; annual reports were used as an independent check of the consolidated statements and of TCS's published ratios. No NSE data was fetched automatically.

| Fiscal year | Financial-results PDF | Results pages used |
|---|---|---|
| 2021-22 | `financial-results/financial-results-for-the-quarter-and-year-ended-march-31-2022-and-recommendation-of-final-dividend (1).pdf` | consolidated results p. 7; balance sheet p. 9; cash flows pp. 11-12 |
| 2022-23 | `financial-results/Consolidated and Standalone.pdf` | consolidated results p. 1; balance sheet p. 3; cash flows p. 5 |
| 2023-24 | `financial-results/Consolidated and Standalone (2).pdf` | consolidated results p. 1; balance sheet p. 3; cash flows pp. 5-6 |
| 2024-25 | `financial-results/Consolidated and Standalone (3).pdf` | consolidated results p. 1; balance sheet p. 3; cash flows p. 6 |
| 2025-26 | `financial-results/Consolidated and Standalone (1).pdf` | consolidated results p. 1; balance sheet p. 3; cash flows p. 6 |

The corresponding annual reports are `annual-reports/annual-report-2021-2022.pdf` through `annual-reports/annual-report-2025-2026.pdf`. Figures are consolidated, in ₹ crore except per-share values and ratios. `reportingDate` is the fiscal year end, not the filing publication date.

## Reconciliation checks

The results filings and annual reports agree on the figures used for the normalized rows at the filings' displayed precision. The consolidated annual cash-flow statements reconcile as follows:

| FY | Parent-attributable net income (₹ cr) | Net operating cash (₹ cr) | PPE purchases (₹ cr) | Intangible purchases (₹ cr) | Capex used (₹ cr) | FCF = operating cash - capex (₹ cr) |
|---|---:|---:|---:|---:|---:|---:|
| 2021-22 | 38,327 | 39,949 | 2,483 | 497 | 2,980 | 36,969 |
| 2022-23 | 42,147 | 41,965 | 2,532 | 355 | 2,887 | 39,078 |
| 2023-24 | 45,908 | 44,338 | 2,202 | 442 | 2,644 | 41,694 |
| 2024-25 | 48,553 | 48,908 | 2,917 | 944 | 3,861 | 45,047 |
| 2025-26 | 49,210 | 52,094 | 3,670 | 408 | 4,078 | 48,016 |

Net income is the profit attributable to TCS shareholders, rather than total group profit including non-controlling interests. The published consolidated ROCE is rounded to 60.4%, 65.2%, 74.3%, 76.0%, and 67.8% respectively. It is not used as the normalized return-on-capital input: the annual report defines that ratio using pre-tax profit before finance costs and closing capital employed, while the project scoring definition calls for after-tax operating profit over average invested capital.

The debt/equity figures are derived from the consolidated balance sheets and align with the annual reports' debt/equity ratio of 0.1 when rounded to one decimal. The annual report's debt definition includes borrowings and lease liabilities; these balance sheets show no borrowings in the included debt measure, so current and noncurrent lease liabilities are included.

## Normalization methods

- **Return on capital (%)**: `NOPAT / average invested capital * 100`. `NOPAT = (profit before tax + finance costs - other income) * (1 - total tax expense / profit before tax)`. Average invested capital is the mean of current and prior fiscal year-end `total equity + current lease liabilities + noncurrent lease liabilities + deferred tax liabilities`. FY2021 opening figures for the FY2022 average come from the FY2021 comparative column in the FY2021-22 annual report. This is a consistent screening estimate, not TCS's reported ROCE.
- **Debt/equity**: `(current + noncurrent lease liabilities) / total consolidated equity`, in times. TCS reports no borrowing balance in these statements; leases are retained in debt to match its ratio definition.
- **Net income**: profit attributable to shareholders of TCS, in ₹ crore.
- **Operating cash flow**: net cash generated from operating activities after tax, in ₹ crore.
- **Capital expenditure**: cash payments for PPE plus intangible assets, expressed as a positive outflow in ₹ crore. The separately presented payment for acquiring right-of-use assets is excluded because lease liabilities are already included in debt/equity. This convention is applied consistently and checked against the project FCF definition.
- **Free cash flow check**: derived as operating cash flow minus capital expenditure; it is not a separate CSV field because the scorer derives it from those two inputs.
- **Owner earnings before maintenance capex/share**: `(parent-attributable net income + depreciation and amortisation + signed operating working-capital cash impact) / implied diluted weighted shares`. The working-capital cash impact is `cash generated from operations - operating profit before working-capital changes`. Implied diluted weighted shares are `parent-attributable net income / reported diluted EPS`. This operationalizes the project's owner-earnings definition; it is not a reported accounting subtotal.
- **Total capex/share**: total capex above divided by the same implied diluted weighted shares. The printed diluted EPS is rounded, so per-share values are estimates at that precision.

Maintenance capex is not separately disclosed in these filings. The CSV therefore contains total capex/share for the model's stated scenario proxy; it does not label total capex as maintenance capex. The score's scenario assumptions estimate the maintenance share from historical total capex.

## Data output

The five rows and per-field provenance are in `data/normalized/nse-pilot.csv`. Each normalized field points to the relevant results PDF pages, records the FY end as its reporting date, and states its mapping. The dataset is a local pilot and does not establish rights to publicly redistribute NSE filings or derived data.
