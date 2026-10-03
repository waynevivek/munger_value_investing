# Decision log: quality score

## Decision: graded, editable quality rubric

The quality component awards points linearly between a zero-credit floor and a full-credit target for each metric. ROIC is graded year by year and those annual grades are averaged; debt-to-equity uses the selected period's median; earnings and free-cash-flow checks grade the share of selected years that are positive. The initial weights are 25% per check.

The defaults are starting heuristics for a learning tool, not thresholds endorsed by Buffett, Munger, CFA Institute, or a regulator. Berkshire's 1989 acquisition criteria describe demonstrated earning power, good returns on equity, and little or no debt without assigning numeric cutoffs. The [research note](research/quality-rubric.md) records the source review and explains why these numbers are transparent initial choices.

The public configuration is versioned and returned with every score. A UI can clone it with `createEditableQualityScoringConfig`, adjust thresholds or weights, and pass that configuration to the pure scoring function. The scorer validates the configuration and rejects weights that do not add to the configured maximum.

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
