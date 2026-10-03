# Decision log: quality score

## Decision: graded, editable quality rubric

The quality component awards points linearly between a zero-credit floor and a full-credit target for each metric. ROIC is graded year by year and those annual grades are averaged; debt-to-equity uses the selected period's median; earnings and free-cash-flow checks grade the share of selected years that are positive. The initial weights are 25% per check.

The defaults are starting heuristics for a learning tool, not thresholds endorsed by Buffett, Munger, CFA Institute, or a regulator. Berkshire's 1989 acquisition criteria describe demonstrated earning power, good returns on equity, and little or no debt without assigning numeric cutoffs. The [research note](research/quality-rubric.md) records the source review and explains why these numbers are transparent initial choices.

The public configuration is versioned and returned with every score. A UI can clone it with `createEditableQualityScoringConfig`, adjust thresholds or weights, and pass that configuration to the pure scoring function. The scorer validates the configuration and rejects weights that do not add to the configured maximum.

## Decision: owner-earnings valuation and financial-fit score

The valuation starting point uses per-share annual inputs over the selected 5- or 10-year history. The normalized owner-earnings input is the median of annual earnings per share after interest and tax, plus explicitly selected non-cash charges, minus additional working capital required to maintain operations, and before maintenance capex. The capex input is reported total capex per share; if actual maintenance capex has not been estimated, each scenario treats a stated share of average historical total capex as maintenance.

The versioned `FINANCIAL_FIT_CONFIG` holds the quality rubric, three valuation cases, margin-of-safety scoring range, and combined weights. The editable copy factory is `createEditableFinancialFitConfig`. Low/base/high assumptions are:

| Case | 5-year OE growth | Terminal growth | Equity discount rate | Maintenance capex estimate |
|---|---:|---:|---:|---:|
| Low value | 0% | 0% | 15% | 100% of average total capex |
| Base value | 3% | 2% | 12% | 75% of average total capex |
| High value | 6% | 3% | 10% | 50% of average total capex |

The scenario's adjusted starting OE per share is the median selected-year pre-maintenance OE per share less its maintenance-capex percentage times mean total capex per share. It is grown for five years; the terminal value at year five is `year-five OE × (1 + terminal growth) / (equity discount rate − terminal growth)`. The five annual OE forecasts and terminal value are discounted at the case's equity discount rate. Reject a case whose discount rate is not greater than terminal growth.

Margin of safety is `(intrinsic value per share − end-of-day price) / intrinsic value per share`, shown for each case. The valuation subscore uses base-case margin of safety: zero points at or below 0%, linear to 100 points at 25% margin of safety, capped outside that range. The total is `quality × 50% + valuation × 50%`; the output always carries each available subscore and the assumptions snapshot. The end-of-day price and per-share history must use matching currencies and corporate-action basis.

The ranges (growth 0/3/6%, terminal growth 0/2/3%, discount 15/12/10%, maintenance-capex proxy 100/75/50%, and 25% margin target) are transparent general heuristics for a prototype. Research supports the methods and qualitative principles, not these exact numbers. Sources and rationale are in [valuation-model.md](research/valuation-model.md).

## Known limitations

- The initial floor/target values and equal weights are not empirically calibrated on Indian companies. Linear points and a 0–100 display imply more precision than the underlying judgment supports.
- A weighted sum lets strong results in one check offset weak results in another. There is no quality gate or score cap.
- ROIC comparability depends on its accounting definition and capital base. The scoring function accepts a normalized `returnOnCapitalPercent`; the data layer must calculate it consistently, with after-tax operating profit and a compatible average invested-capital denominator.
- Debt-to-equity is only one leverage view. It can be misleading with low or negative book equity and ignores cash, maturities, interest rates, lease obligations, and ability to service interest. Negative ratios receive zero points; a later model may need an unavailable-data state or coverage measure.
- Free cash flow here means operating cash flow less capex. This is a chosen screen measure, not a standardized accounting subtotal or necessarily distributable cash; it omits acquisitions and can be affected by working-capital timing and lumpy capital spending.
- Positive-year counts ignore the size and quality of profit or cash generation, per-share dilution, inflation, restatements, and intra-year changes.
- Absolute thresholds do not adjust for sector economics, business risk, cost of capital, or inflation. This makes cross-sector comparisons rough.
- Requiring a full 5- or 10-year listed history can exclude newer listings and create survivorship bias. Annual observations can hide cycles and recent deterioration.
- The four checks do not establish moat durability, management integrity, governance quality, capital-allocation skill, or circle of competence. Those remain separate investor judgments.
- This quality score excludes valuation and price; the combined financial-fit score is defined separately and must continue to show its quality and valuation components beside the total.
- The maintenance-capex percentage is a scenario proxy for the maintenance/growth split. It can materially distort value where actual upkeep needs differ from total capex or depreciation.
- The five-year growth path and perpetual terminal value are highly sensitive assumptions; terminal value may dominate the range. The 0/3/6% near-term growth, 0/2/3% terminal growth, 15/12/10% discount rates, and 25% base-case margin target are not calibrated to Indian securities or current rates.
- The owner-earnings inputs require consistent earnings attribution, non-cash adjustments, working-capital needs, diluted share counts, and corporate-action adjustment across years. This scorer consumes those normalized per-share values; it does not validate the underlying accounting bridge.
- A low or negative normalized owner-earnings estimate is outside this simple positive-cash-flow model. It is returned as not-valuatable rather than forced into a numeric valuation score; a different model would be needed to value a loss-making or turnaround business.
- Currency equality does not prove that the EOD price is fresh, correctly adjusted for every corporate action, or licensed for redistribution. Source coverage and reuse terms remain open work for ingestion and public release.
- The current input check verifies that the EOD date has a `YYYY-MM-DD` shape, but does not reject impossible calendar dates or confirm that the quote is truly end-of-day for that date.
- The quality and financial-fit modules currently duplicate small helpers and fiscal-year selection logic. This can lead to behavioral drift if those paths are changed independently.
- Valuation and quality are added at 50/50, so a low-quality company with a very attractive estimated price can still have a moderate total. This is required by the current product decision and should be presented with both component scores and the research-aid disclaimer.
