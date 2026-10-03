# 02: Calculate valuation and combined financial-fit scores

**What to build:** An investor can see how a company’s price compares with an owner-earnings-based intrinsic-value range, and how valuation combines with financial quality in one research-aid score.

**Blocked by:** 01 — Calculate quality score and insufficient-data status.

**Label:** HITL

**Status:** ready-for-agent

- [ ] Extend the pure scoring behavior to calculate a valuation subscore from normalized owner earnings, an end-of-day price input, and explicit valuation assumptions.
- [ ] Return a low/base/high intrinsic-value range and a margin-of-safety comparison, with the assumptions used in the result.
- [ ] Calculate the 0–100 combined score with 50% quality and 50% valuation contribution; always retain both component scores in the result and apply no separate quality gate.
- [ ] Return “insufficient data” without a numeric total if required quality, valuation, or price inputs are missing for the selected history.
- [ ] Use hand-written fixtures to verify valuation cases, total-score composition, assumptions, and insufficient-data behavior; do not use real NSE data in these scoring tests.
- [ ] Have a human review the owner-earnings calculation and valuation assumptions because they materially affect the result.

