# 01: Calculate quality score and insufficient-data status

**What to build:** An investor can assess one company’s financial quality over a selected 5- or 10-year history and see the figures and checks behind the result. If the required annual history is incomplete, the result clearly says “insufficient data” instead of assigning a low score.

**Blocked by:** None (can start immediately).

**Label:** HITL

**Status:** ready-for-agent

- [ ] Implement the pure quality-scoring behavior from normalized company financials organized by fiscal year.
- [ ] Return the quality subscore and per-check figures and pass/fail results for profitability, manageable debt, earnings consistency, and cash generation.
- [ ] Support the selected 5-year or 10-year lookback and require complete annual history for every required input.
- [ ] Return “insufficient data” with no numeric quality score if any required input lacks the full selected history; do not treat missing data as a failed check.
- [ ] Make the selected metrics, thresholds, and factor weights explicit so a human can review this financial-modeling choice.
- [ ] Verify the behavior with small hand-written fixtures for complete 5-year and 10-year histories, failed checks, and incomplete histories; do not use real NSE data in scoring tests.

