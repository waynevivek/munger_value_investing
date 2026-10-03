# Research: owner-earnings valuation defaults

**Purpose:** recommend a small, explainable per-share valuation model for an India-first NSE non-financial-company screener. This note separates sourced methods and principles from proposed numbers. The proposed numbers are scenario defaults for a learning tool, not rules endorsed by Buffett, Munger, CFA Institute, or regulators.

## Sourced principles

### Owner earnings and maintenance investment

Buffett's 1986 Berkshire letter defines owner earnings as reported earnings, plus depreciation, depletion, amortization and certain non-cash charges, less the average annual capitalized spending needed to maintain long-term competitive position and unit volume. He also says to include additional working capital required to maintain that position and volume. Buffett explicitly calls the necessary capital-spending estimate a difficult guess, and warns against adding depreciation back without subtracting the capital spending the business needs. [Berkshire Hathaway 1986 letter](https://www.berkshirehathaway.com/letters/1986.html).

The letter does **not** say maintenance capex equals depreciation, or that maintenance capex is a standardized financial-statement line. It says the estimate depends on the business. CFA Institute says maintenance-capex forecasts are often based on depreciation and amortization, while growth capex forecasts are tied to strategy, expansion plans and revenue growth. Treat D&A as a proxy/check, not proof of maintenance needs. [CFA Institute, *Company Analysis: Forecasting*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/company-analysis-forecasting).

### Discounted cash flow, growth and terminal value

CFA Institute describes DCF as the present value of expected future cash flows discounted at a required return. It notes FCF approaches can fit companies where dividends are absent or do not reflect FCF, and that valuation can use finite-stage growth and a terminal value. The Gordon growth expression requires discount rate `r` greater than perpetual growth `g`; its value is highly sensitive to both assumptions. [CFA Institute, *Discounted Dividend Valuation*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/discounted-dividend-valuation).

Damodaran's NYU Stern valuation material says stable terminal growth should be sustainable, no greater than long-run growth of the relevant economy, and consistent with currency and nominal/real assumptions. It also warns that growth and net reinvestment assumptions are linked; terminal assumptions cannot freely combine high growth with negligible reinvestment. [NYU Stern, terminal value derivation](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/AppldCF/derivn/ch12deriv.html); [NYU Stern, net capital expenditure lecture](https://pages.stern.nyu.edu/adamodar/pdfiles/eqnotes/dcfall.pdf).

Use owner earnings per share after interest (equity cash flow) with a **cost-of-equity-style discount rate**. Keep cash flow and rate on the same nominal basis and currency. Do not mix an equity cash flow with WACC, or firm cash flow with cost of equity. A simple growth perpetuity is mathematically unstable when `r` approaches `g` and invalid when `g >= r`; reject such assumptions.

### Margin of safety

Berkshire's 1992 letter says the purchase price should leave a margin of safety: a value estimate only slightly above price is not enough for Berkshire. The letter does not prescribe a universal percentage. Berkshire's 1994 letter describes intrinsic value as discounted cash that can be taken out over the business's remaining life and emphasizes that this estimate is subjective and changes when forecasts or rates change. [Berkshire Hathaway 1992 letter](https://www.berkshirehathaway.com/letters/1992.html); [Berkshire Hathaway 1994 letter](https://www.berkshirehathaway.com/letters/1994.html).

## Minimal transparent data contract

Keep an auditable normalized annual owner-earnings record and a current price record. Carry provenance at the field or record level so the result can show where numbers came from.

```js
{
  companyId: 'example',
  fiscalYear: 2025,
  currency: 'INR',
  ownerEarningsInputs: {
    earningsToCommonShareholders: 1200000000,
    depreciationDepletionAmortization: 240000000,
    otherNonCashAdjustments: 0,
    maintenanceCapex: 310000000,
    additionalWorkingCapitalRequired: 20000000,
    dilutedWeightedAverageShares: 100000000
  },
  provenance: {
    source: 'annual-report URL or filing identifier',
    reportingDate: '2025-05-20',
    basis: 'consolidated',
    units: 'INR'
  },
  price: {
    pricePerShare: 950,
    asOfDate: '2025-10-02',
    currency: 'INR',
    source: 'price-source identifier',
    corporateActionAdjusted: true
  }
}
```

For each annual record, calculate:

`ownerEarnings = earningsToCommonShareholders + D&A + explicitly selected other non-cash adjustments − maintenanceCapex − additionalWorkingCapitalRequired`

`ownerEarningsPerShare = ownerEarnings / dilutedWeightedAverageShares`

Use earnings attributable to common shareholders after interest and tax if discounting owner earnings at an equity required return. Do not add back interest or subtract net debt again in that equity-value path. If inputs start from EBIT/FCFF instead, use a firm-level model and bridge enterprise value to equity value; do not mix the two definitions.

For a stable, explainable normalized starting value, use the median of the selected 5- or 10-year owner-earnings-per-share observations, only when the complete history is available. Keep each year's components visible. A separate analyst-reviewed `maintenanceCapex` estimate is preferable; when only total capex is known, use the scenario proxy below and clearly label it as an estimate. Ensure historical per-share values are adjusted for splits and similar corporate actions, and use a share count / price series consistent with that adjustment.

The DCF function can then take `normalizedOwnerEarningsPerShare`, `pricePerShare`, `priceAsOfDate`, currency, provenance, scenario assumptions, and horizon. It returns per-share value for low/base/high cases, upside/downside versus price, margin of safety, and all assumptions. Require positive normalized owner earnings for the simple growth-perpetuity model; negative or near-zero owner earnings need a different valuation model and should be `not-valuatable`/insufficient rather than forced through a perpetuity.

## Proposed low/base/high defaults (heuristics)

A minimal two-stage model: project per-share owner earnings for five years at the scenario's near-term annual growth rate, then use a stable terminal growth rate. For scenario `s`:

`OE[t] = normalizedOEPerShare × (1 + nearTermGrowth[s])^t`, for `t = 1..5`

`terminalValue[5] = OE[5] × (1 + terminalGrowth[s]) / (discountRate[s] − terminalGrowth[s])`

`intrinsicValuePerShare[s] = sum(OE[t] / (1 + discountRate[s])^t, t=1..5) + terminalValue[5] / (1 + discountRate[s])^5`

| Assumption | Low-value case | Base case | High-value case | Rationale / status |
|---|---:|---:|---:|---|
| Explicit owner-earnings growth, years 1–5 | 0% | 3% | 6% | Proposed modest growth sensitivity; no number is source-endorsed. |
| Stable terminal growth | 0% | 2% | 3% | Proposed conservative sensitivity; must remain below discount rate and be supportable against long-run nominal growth in the matching currency. |
| Equity discount rate | 15% | 12% | 10% | Proposed round-number sensitivity, not a current Indian cost-of-equity estimate. Each company’s risk and market rates differ; update or edit assumptions rather than imply a universal rate. |
| Maintenance-capex proxy if true maintenance capex is unknown | 100% of selected-period average total capex | 75% of average total capex | 50% of average total capex | Proposed uncertainty range only. Low-value case conservatively counts all observed capex as maintenance; base/high cases assume some spending is growth capital, which cannot be known from this ratio alone. |
| Explicit forecast length | 5 years | 5 years | 5 years | Product simplification, not a sourced rule. NYU Stern materials caution against assuming unusually long above-normal growth periods without support. |

Calculate average total capex and per-share earnings/capex using the same selected historical window. The low-value case intentionally treats all observed capex as necessary upkeep. The base/high capex multipliers are judgmental scenario assumptions. If actual maintenance capex is manually reviewed, replace the proxy with that estimate and retain the source, reviewer/date, and rationale.

The three cases are an assumption sensitivity range, **not a statistical confidence interval**. Before computing terminal value validate `discountRate > terminalGrowth`; flag implausible or mismatched real/nominal inputs. Do not imply 15%, 12%, or 10% are appropriate for every NSE company or current Indian market conditions.

## Graded valuation score proposal

Display price, all three intrinsic values, and base-case margin of safety:

`baseMarginOfSafety = (baseIntrinsicValuePerShare − currentPrice) / baseIntrinsicValuePerShare`

Proposed graded score: 0 points when price is at or above base intrinsic value; ramp linearly to 100 points when price is at or below 75% of base intrinsic value (a 25% discount to that estimate); clip between 0 and 100. Equivalently, for a positive base value:

`valuationScore = 100 × clamp(baseMarginOfSafety / 0.25, 0, 1)`

Keep the 25% target as an editable, prominently displayed heuristic, not a rule from Buffett or Graham. Show low-case margin of safety as a conservative cross-check. This gradual score avoids a binary pass/fail cliff, but does not remove model uncertainty. Continue the agreed total formula: `totalScore = 0.5 × qualityScore + 0.5 × valuationScore`, always display both components, and do not add a quality gate.

## Known limitations for the decision log

- Buffett says maintenance spending needed to preserve unit volume and competitive position is a difficult business-specific estimate. Annual filings generally expose total capex, not a reliable maintenance/growth split. Applying 50/75/100% of total capex is a scenario proxy, not a discovery of actual maintenance capex.
- Using earnings plus D&A less capex and working-capital needs is not a guarantee of distributable cash. It can omit lease principal, acquisitions, stock compensation dilution, debt repayments, and other claims unless deliberately adjusted. Decide what “other non-cash adjustments” means and show it.
- Median historical per-share owner earnings can be stale or unrepresentative after a structural business change; it can discard current trend information. Full history does not make old earnings a forecast.
- A single five-year near-term growth rate and a perpetual terminal rate assume a smooth path that real businesses rarely follow. Terminal value can dominate the result and be very sensitive to small changes in growth/discount rates.
- Fixed 0/3/6% growth and 15/12/10% discount scenarios are intentionally generic. They do not incorporate company-specific equity risk, interest-rate changes, sector/country risk, inflation, or management capital allocation. These must be editable and clearly dated.
- Fixed terminal-growth percentages can exceed plausible long-run nominal growth for some currency/inflation conditions despite passing `g < r`; cap them using an appropriate country/currency long-run-growth assumption when that context is available.
- A linear 25% margin-of-safety score treats estimated value as precise and makes an arbitrary full-credit cutoff. It may rank the uncertain high-growth case too generously or make companies with negative earnings impossible to compare.
- Share dilution, buybacks, splits, bonus issues, and multiple share classes can break per-share history/price comparability. Use matched, adjusted shares/price, and disclose that the simple forecast holds per-share owner earnings growth as modeled.
- The method is designed for operating non-financial companies; banks, insurers, and other financial businesses need different cash-flow and balance-sheet models.
- Intrinsic value is an estimate with potentially large error bars, not a market price forecast. The score is a research aid and not a buy/sell recommendation or individualized investment advice.

## Sources

1. [Berkshire Hathaway, 1986 shareholder letter](https://www.berkshirehathaway.com/letters/1986.html) — owner-earnings definition, working capital, capex-estimation uncertainty, and criticism of cash-flow measures that omit maintenance investment.
2. [Berkshire Hathaway, 1992 shareholder letter](https://www.berkshirehathaway.com/letters/1992.html) — margin of safety and avoiding businesses whose cash flows cannot be predicted.
3. [Berkshire Hathaway, 1994 shareholder letter](https://www.berkshirehathaway.com/letters/1994.html) — intrinsic value as discounted cash and its subjectivity.
4. [CFA Institute, *Discounted Dividend Valuation*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/discounted-dividend-valuation) — DCF present-value method, two-stage growth, required return, `r > g`, and sensitivity.
5. [CFA Institute, *Company Analysis: Forecasting*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/company-analysis-forecasting) — scenario analysis and maintenance-vs-growth capex forecasting concepts.
6. [NYU Stern / Aswath Damodaran, terminal-value derivation](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/AppldCF/derivn/ch12deriv.html) — sustainable terminal growth, currency consistency, growth period, and limitations of exit multiples.
7. [NYU Stern / Aswath Damodaran, *Discounted Cashflow Valuation* slides](https://pages.stern.nyu.edu/adamodar/pdfiles/eqnotes/dcfall.pdf) — reinvestment/capex linkage to growth and treatment of depreciation/capital expenditures.
