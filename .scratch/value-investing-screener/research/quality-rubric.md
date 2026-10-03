# Research: graded quality-score rubric

**Purpose:** recommend transparent starting defaults for an educational, India-first screener of non-financial NSE companies. This note distinguishes source-backed investing/accounting principles from proposed scoring heuristics. None of the numeric defaults below is a Buffett, Munger, CFA Institute, or regulatory threshold.

## What the sources support

- **Returns matter in relation to capital and alternatives.** CFA Institute describes ROIC as a company-wide return across investments that can be compared with an investor's required return, while stressing that ROIC has limitations and assumptions. It defines ROIC as after-tax EBIT divided by average interest-bearing debt plus average shareholders' equity. This supports examining capital efficiency, not a universal ROIC cutoff. [CFA Institute, *Capital Investments and Capital Allocation*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/capital-investments-and-capital-allocation); [CFA Institute, financial ratio list](https://www.cfainstitute.org/sites/default/files/-/media/documents/support/programs/cfa/cfa_program_level_ii_financial_ratio_list.pdf).
- **Buffett and Munger describe durable economics and sensible capital use, not a numeric screening formula.** Buffett says Berkshire favored businesses with demonstrated consistent earning power and good returns on equity while using little or no debt; he also describes preferring businesses that can deploy incremental capital at high returns over time. These are qualitative principles and Berkshire's own acquisition criteria, not universal cutoffs. [Berkshire Hathaway 1989 letter](https://www.berkshirehathaway.com/letters/1989.html); [Berkshire Hathaway 1992 letter](https://www.berkshirehathaway.com/letters/1992.html).
- **A debt ratio needs a clearly defined numerator and denominator.** CFA Institute defines total debt as interest-bearing short- and long-term debt (excluding accrued expenses and accounts payable), and debt-to-equity as total debt divided by total shareholders' equity. The ratio is not meaningful in the ordinary way when equity is zero or negative. [CFA Institute, financial ratio list](https://www.cfainstitute.org/sites/default/files/-/media/documents/support/programs/cfa/cfa_program_level_ii_financial_ratio_list.pdf).
- **Free cash flow has no single standardized accounting definition.** A common calculation is operating cash flow less capital expenditures, but this is a non-GAAP / non-IFRS measure; one SEC-filed definition explicitly cautions that FCF is not discretionary residual cash and omits items such as lease obligations and acquisitions. State the platform's formula and show its statement inputs. [SEC-filed non-GAAP measure disclosure](https://www.sec.gov/Archives/edgar/data/1018724/000119312510015621/dex992.htm); [CFA Institute, financial ratio list (FCFE/FCFF definitions)](https://www.cfainstitute.org/sites/default/files/-/media/documents/support/programs/cfa/cfa_program_level_ii_financial_ratio_list.pdf).
- **Historical consistency is a useful prompt, not proof of future performance.** Berkshire's letter discusses consistent earning power while cautioning against relying on projections and notes that accounting maneuvers can inflate short-term earnings. Historical annual figures should therefore be shown with sources and dates and should not imply a forecast. [Berkshire Hathaway 1989 letter](https://www.berkshirehathaway.com/letters/1989.html); [Berkshire Hathaway 1992 letter](https://www.berkshirehathaway.com/letters/1992.html).

## Proposed defaults for the prototype

Use a linear ramp from zero credit at the **floor** to full credit at the **target**, clipped to 0–100% of that check's weight. For lower-is-better metrics such as debt, the target is the low value that earns full credit and the floor is the high value that earns zero. Aggregate each check's normalized points times its configured weight. Keep the existing equal 25% weights as a transparent initial choice, not a research finding.

| Check | Suggested measurement over selected annual window | Zero-credit floor | Full-credit target | Plain-language explanation |
|---|---|---:|---:|---|
| Profitability | Annual ROIC; score each year's ROIC and average the annual points | 0% | 15% | “This checks whether the company earns a meaningful return on the money invested in its business.” |
| Manageable debt | Median debt-to-equity; total interest-bearing debt / total shareholders' equity | 2.0× | 0.25× | “This checks how much interest-bearing debt the company carries compared with shareholders' equity; lower is generally less leveraged.” |
| Earnings consistency | Share of selected years with net income > 0 | 40% of years | 80% of years | “This checks how often the company reported a profit during the selected period.” |
| Cash generation | Share of selected years with FCF > 0, where FCF = cash flow from operations − capital expenditure | 40% of years | 80% of years | “This checks how often operations generated cash after the recorded capital spending.” |

These are **proposed starting heuristics**, selected for interpretability and a smooth graded result. They are not empirical Indian-market cutoffs and should not be presented as “Buffett's rules.” For the 5-year view, an 80% target means 4 of 5 positive years; for the 10-year view it means 8 of 10. The 40% floor means 2/5 or 4/10 positive years earns zero points on that consistency check. ROIC's 15% target is a simple absolute preference; actual required returns vary by company and over time. Debt-to-equity's 2.0× floor and 0.25× target are deliberately broad initial anchors, not universal boundaries.

For the selected history, use annual values as supplied by the data layer. Do not silently substitute missing years or treat missing data as zero: preserve the existing “insufficient data” result. If required ROIC or debt inputs are undefined (for example, negative/zero equity), report the check as unavailable and the overall quality result as insufficient until the domain rule is deliberately revised.

## Suggested configuration shape

Keep every tunable threshold, weight, and display explanation in one exported configuration object so the UI can show exactly which model was applied and later edit it. For example:

```js
{
  version: 1,
  checks: {
    profitability: {
      metric: 'annual-roic-percent', floor: 0, target: 15,
      weight: 25,
      explanation: 'This checks whether the company earns a meaningful return on the money invested in its business.'
    },
    manageableDebt: {
      metric: 'median-debt-to-equity', floor: 2, target: 0.25,
      direction: 'lower-is-better', weight: 25,
      explanation: 'This checks how much interest-bearing debt the company carries compared with shareholders\' equity; lower is generally less leveraged.'
    },
    earningsConsistency: {
      metric: 'positive-net-income-year-percent', floor: 40, target: 80,
      weight: 25,
      explanation: 'This checks how often the company reported a profit during the selected period.'
    },
    cashGeneration: {
      metric: 'positive-free-cash-flow-year-percent', floor: 40, target: 80,
      weight: 25,
      explanation: 'This checks how often operations generated cash after the recorded capital spending.'
    }
  }
}
```

Treat the configuration as part of the result's assumptions (ideally include a version or snapshot) so scores remain interpretable after edits. Validate that weights are nonnegative and sum to 100, floors and targets differ, and the direction is explicit. These validation recommendations are implementation safeguards, not sourced financial standards.

## Known limitations to put in the decision log

- The four financial checks do not measure moat durability, customer dependence, management honesty/capability, governance, industry structure, or whether reinvested earnings create value. They are proxies for a first-pass screen, not a complete “Buffett/Munger score.”
- A fixed 15% ROIC target ignores differences in cost of capital, business risk, inflation, and sector economics. ROIC itself depends on accounting classification, tax rate, capital denominator, acquisitions, and intangible assets; a superficially high value can be misleading.
- Debt-to-equity can mislead for companies with very low, negative, or unusually accounting-sensitive equity. It ignores debt maturity, cash balances, interest rates, lease liabilities, and debt-service capacity; interest coverage and net debt measures may be useful later.
- FCF = operating cash flow − capex is not standardized and is sensitive to working-capital timing and the classification of capex. It does not necessarily mean cash available for distribution; it omits acquisitions and may omit lease principal. Capital expenditure can be lumpy, so the positive-year count loses magnitude and timing.
- Counting positive-earnings years ignores size, per-share dilution, inflation, and earnings quality; reported profit can be affected by one-off items and accounting choices.
- Equal check weights and linear interpolation are design choices. A high result in one check can compensate for a weak result in another, and score precision may overstate what coarse, audited annual inputs justify.
- 5- and 10-year lookbacks can favor survivors and established listings; a full-window requirement excludes young listings and firms with incomplete public history. Annual measures hide intra-year changes and cyclicality.
- Financial institutions should remain outside this non-financial rubric: their balance-sheet leverage and cash-flow classifications are structurally different, so the same ratios are not comparable.
- Company-level financial statement inputs can differ between consolidated and standalone statements, fiscal-year boundaries, restatements, units, and source mappings. Every input should retain its statement source, reporting date, units, and consolidation basis.
- The score is a descriptive educational screen. It does not assess market price or intrinsic value, and it is not individualized investment advice or a buy/sell recommendation.

## Sources

1. [Berkshire Hathaway, 1989 shareholder letter](https://www.berkshirehathaway.com/letters/1989.html) — consistent earning power, returns, limited debt, and warnings about leverage / accounting measures.
2. [Berkshire Hathaway, 1992 shareholder letter](https://www.berkshirehathaway.com/letters/1992.html) — high returns on incremental capital and limits of numerical prediction.
3. [CFA Institute, *Capital Investments and Capital Allocation*](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/capital-investments-and-capital-allocation) — ROIC as a company-wide return comparable to a required return, subject to assumptions and limitations.
4. [CFA Institute, financial ratio list](https://www.cfainstitute.org/sites/default/files/-/media/documents/support/programs/cfa/cfa_program_level_ii_financial_ratio_list.pdf) — formulas for ROIC, debt-to-equity, debt, and FCFE/FCFF.
5. [SEC-filed non-GAAP measure disclosure](https://www.sec.gov/Archives/edgar/data/1018724/000119312510015621/dex992.htm) — an issuer's FCF formula and explicit limitations; used as an illustration that FCF definitions and scope require disclosure, not as a universal accounting rule.
