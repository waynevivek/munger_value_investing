# 03: Reconcile and ingest five companies from NSE filings

**What to build:** The proof of concept can use source-backed financial histories for five NSE mainboard non-financial companies, with their financial facts normalized by fiscal year and traceable to the original filing or annual report.

**Blocked by:** 02 — Calculate valuation and combined financial-fit scores.

**Label:** HITL

**Status:** ready-for-agent

- [ ] Before implementing the importer, verify for five pilot companies whether NSE XBRL/CSV financial-result filings contain every input required by tickets 01 and 02 over the selected 5- and 10-year periods.
- [ ] Reconcile the required filed values for those companies against their annual reports and document any differences or accounting mappings that affect the normalized values.
- [ ] Where an NSE filing does not contain a required input, document the alternate source or mapping and preserve its provenance; never silently substitute a value.
- [ ] Normalize the verified observations by company and fiscal year while retaining source and reporting date for each input.
- [ ] Provide the five-company dataset to the existing scoring behavior and ensure absent history produces “insufficient data.”
- [ ] Test the ingestion adapter with small hand-written source-format fixtures and verify normalized values and provenance; keep live NSE availability out of automated tests.
- [ ] Human review the reconciliation and source mapping. Keep this proof of concept local until public reuse rights are verified.

