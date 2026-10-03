Status: ready-for-agent

# India Value Investing Screener

## Problem Statement

Self-directed investors in India who know basic investing need a clear way to find and compare financially strong companies at potentially reasonable prices. General-purpose screeners can make ratios easy to browse, but they do not explain how the figures relate to a long-term value-investing approach or make the assumptions behind a combined score visible. A score that blends business quality and valuation can also hide whether a company is financially strong but expensive, or cheap but financially weak.

The project is also a fun learning exercise for its builder. It should begin as a small, checked-data proof of concept, while preserving a path to a microtool that others could use. Its financial score must be presented as an aid to research, not as a buy/sell recommendation or as a formula endorsed by Warren Buffett or Charlie Munger.

## Solution

Build a browser-based, India-focused stock screener for NSE mainboard non-financial companies. Start with a limited, checked set of companies. Let investors apply an editable Buffett/Munger-inspired preset, inspect a ranked screener, and open a company view that explains the result with financial figures, dates, assumptions, and pass/fail checks.

The screen result has a 0–100 combined financial-fit score made from a quality component and a valuation component, each contributing 50%. Always display both components beside the total. The quality component covers profitability, manageable debt, earnings consistency, and cash generation. The valuation component uses a conservative owner-earnings-based intrinsic-value range and a margin-of-safety lens. Users choose a 5- or 10-year lookback. A result is “insufficient data” if any required input lacks the full selected history; missing history is not treated as poor performance.

Use full fiscal-year results for the core score and show newer quarterly results separately as context. Display end-of-day price and its date. Present an investor-guided qualitative checklist for moat, management and capital allocation, and circle of competence separately from the financial score.

Save watchlists and qualitative notes in the browser without sign-up. Provide JSON export and import so users can back up or move that local work. For the initial proof of concept, use a limited checked dataset. NSE financial-results filings (CSV/XBRL) and company annual reports are candidate primary sources; complete historical coverage and reuse rights have not been verified. Confirm data coverage and terms for both financial statements and end-of-day prices before opening a public version.

## User Stories

1. As an India-based self-directed investor with basic investing knowledge, I want to screen Indian companies using a value-investing lens, so that I can find candidates for my own research.
2. As a visitor, I want to use the screener without creating an account, so that I can try it with minimal friction.
3. As a visitor, I want the product to state that its score is a financial aid and not a buy/sell recommendation, so that I understand the limits of the result.
4. As an investor, I want a ready-made Buffett/Munger-inspired screen, so that I have a useful starting point instead of building every filter from scratch.
5. As an investor, I want to edit the preset’s filters, so that I can explore how different financial requirements change the candidate set.
6. As an investor, I want to see the NSE mainboard non-financial companies included in the proof of concept, so that I know the market and company types covered by the results.
7. As an investor, I want the screener to rank covered companies by their combined financial-fit score by default, so that I can quickly find stronger matches for further research.
8. As an investor, I want to sort the table by the combined score, quality component, valuation component, and displayed financial measures, so that I can compare candidates in different ways.
9. As an investor, I want to select either a 5-year or 10-year financial history, so that I can inspect both a shorter and longer track record.
10. As an investor, I want the full selected history required for every scored input, so that a short or incomplete record does not receive a misleading score.
11. As an investor, I want a company with insufficient history to be marked “insufficient data” rather than assigned a low score, so that missing records are not mistaken for poor performance.
12. As an investor, I want to see the combined score alongside separate quality and valuation components, so that a strong company at a high price is distinguishable from a weak company at a low price.
13. As an investor, I want to see how profitability contributes to the quality component, so that I can understand the company’s financial returns.
14. As an investor, I want to see how debt and financial strength contribute to the quality component, so that I can assess the company’s capacity to withstand obligations.
15. As an investor, I want to see earnings consistency across the selected history, so that I can assess how stable the company’s financial performance has been.
16. As an investor, I want to see cash generation and the figures used to assess it, so that I can distinguish reported earnings from cash available to owners.
17. As an investor, I want to see an owner-earnings-based intrinsic-value range and the margin-of-safety comparison, so that I can understand how valuation affects the result.
18. As an investor, I want to see the assumptions used in the valuation range, so that I can judge how sensitive the result is to those assumptions.
19. As an investor, I want each financial check to show its figure, selected period, and pass/fail result, so that I can trace how the screen result was produced.
20. As an investor, I want to see the source and reporting date for each financial input, so that I can assess its provenance and freshness.
21. As an investor, I want full-year financial results to drive the core score, so that one seasonal or unusual quarter does not unexpectedly dominate the long-term assessment.
22. As an investor, I want newer quarterly results shown separately from the core score, so that I can notice a recent change in performance without confusing it with the annual history.
23. As an investor, I want the end-of-day market price and its date displayed, so that I can tell which price was used in the valuation comparison.
24. As an investor, I want a company view that explains its score, component scores, figures, assumptions, and missing data, so that I can investigate a candidate rather than rely on a table number.
25. As an investor, I want a separate qualitative checklist for competitive advantage or moat, management and capital allocation, and circle of competence, so that I can consider principles that financial data alone cannot establish.
26. As an investor, I want to add notes to the qualitative checklist, so that I can record my reasoning and open questions for each company.
27. As an investor, I want to save companies to a watchlist in my browser, so that I can return to candidates without signing up.
28. As an investor, I want watchlists and qualitative notes to remain available in the same browser between visits, so that my research work is not lost during ordinary use.
29. As an investor, I want to export my watchlists and notes as JSON, so that I can back them up before clearing browser data or changing devices.
30. As an investor, I want to import a previously exported JSON backup, so that I can restore my watchlists and notes.
31. As an investor, I want invalid or incompatible JSON imports to be rejected with a clear explanation, so that an import does not silently corrupt my saved research.
32. As a project owner, I want the initial proof of concept to work with a limited, checked set of companies, so that I can validate the data model and scoring behavior before attempting full-universe coverage.
33. As a project owner, I want the app to retain financial source and reporting-date provenance, so that score explanations can be traced back to the input data.
34. As a project owner, I want the full-universe public version to depend on verified data coverage and reuse terms, so that the product does not assume that accessible exchange data can be redistributed.

## Implementation Decisions

- The initial deliverable is a browser-based proof of concept for NSE mainboard non-financial companies, backed by a limited checked company set. Banks, insurers, SME listings, ETFs, REITs, and other instruments are excluded.
- The initial user experience is free, has no sign-up, and has no ads or direct payments. Any future monetization is deferred until there is meaningful user adoption.
- Model normalized company financials by company and fiscal year. Each input must retain its source and reporting date. Do not hard-code assumptions that NSE offers a complete, free, redistributable 5- or 10-year dataset.
- The confirmed primary test seam is a pure function from normalized company financial history and the selected lookback/valuation assumptions to a screen result. The result includes total score, quality and valuation subscores, per-check figures and pass/fail, assumptions used, and an “insufficient data” status where applicable.
- The combined score is 50% quality and 50% valuation as a product decision. Always show the overall score and both component scores together. No separate quality gate is specified.
- The quality component represents profitability, manageable debt, earnings consistency, and cash generation. The precise measures, thresholds, and weights within this component remain implementation decisions and must be shown to users.
- The valuation component uses normalized owner earnings and presents an intrinsic-value range with explicit low/base/high assumptions and a margin-of-safety comparison. The exact owner-earnings calculation, assumptions, and valuation thresholds remain implementation decisions and must be visible in the result.
- The user selects a 5- or 10-year lookback. A screen result is insufficient if any required scored input lacks complete annual data for the selected window. Missing data is not a failing check and does not receive a numeric total score.
- Full fiscal-year statements drive the core screen result. Newer quarterly reports appear as separate context and do not silently replace the annual history in the score.
- End-of-day price is used for the valuation comparison and is shown with its date. The price-data provider and rights to display its data publicly are not yet selected or verified.
- NSE financial-results filings (including CSV/XBRL downloads) and company annual reports are candidate primary sources for normalized financial inputs. A distinct ingestion/source adapter is outside the confirmed scoring seam and will have its own tests. The project must verify historical coverage and reuse rights before public release.
- The user-facing qualitative checklist covers moat, management and capital allocation, and circle of competence. It is investor-entered, stored separately from the automatically calculated financial score, and cannot change the score.
- Watchlists and qualitative notes are stored in the browser without an account. JSON export/import applies to this user-created local state; imported data is validated before it is applied. Whether import replaces or merges current state remains an implementation decision.
- The app explains each check and displays figures, selected period, source, reporting date, assumptions, and price date. It does not issue buy/sell instructions.
- UI views and NSE ingestion are separate layers from the pure scoring function. They are outside the confirmed scoring test seam and will receive their own tests later.

## Testing Decisions

- A good test exercises observable score behavior at the pure scoring-function boundary. Given a small normalized company-history fixture, the test asserts the complete returned screen result: combined score, quality and valuation subscores, per-check figures and pass/fail, assumptions, and status. It should not assert private helper structure or implementation details.
- Use small hand-written fixtures. Do not use live or real NSE data in scoring tests.
- Cover complete 5-year and 10-year histories, selected-window behavior, strong/weak quality and valuation cases, and missing required data. Verify that a missing annual input produces “insufficient data,” not a low score or a fabricated partial score.
- The primary module under test is the pure transformation from normalized company financials plus user-selected horizon and valuation assumptions to a screen result.
- Test NSE ingestion/source adapters separately for converting source filings into normalized annual financials and retaining source/reporting-date provenance. These tests are not part of the confirmed scoring seam and must not depend on live NSE availability.
- Test the screener and company views separately for showing both component scores, per-check figures and pass/fail, source/report dates, price date, valuation assumptions, and insufficient-data status.
- Test browser storage and JSON export/import separately for persistence, round-trip preservation of watchlists and notes, and rejection of invalid/incompatible imports.
- No prior-art tests or test framework exist in the repository yet; there is currently no application code. Introduce tests around the confirmed public behavior when the implementation is added.

## Out of Scope

- Full NSE mainboard universe coverage in the initial proof of concept.
- Banks, insurers, SME listings, ETFs, REITs, and other non-operating-company instruments.
- Sign-up, server-side accounts, cloud synchronization, paid tiers, billing, and advertising in the initial version.
- Live or intraday prices.
- Automated assessment of moat, management quality, capital allocation judgment, or the user’s circle of competence. These remain separate investor prompts.
- Buy/sell recommendations, personalized investment advice, guaranteed intrinsic values, or claims that the score is Buffett’s or Munger’s formula.
- Public redistribution of NSE or third-party data before its coverage and reuse terms are verified.
- Real exchange data in the pure scoring-function fixtures.

## Further Notes

- There is no existing application, domain glossary, ADR, or test suite in the repository. This spec establishes the first product vocabulary; domain documentation can be added when the model is implemented.
- NSE exposes financial-results filings with CSV downloads and XBRL conversion, but this does not establish a clean, complete 5-/10-year dataset for the full universe or redistribution rights. NSE’s data-sharing policy separately covers end-of-day and historical market data and restricts redistribution absent an agreement. Confirm the applicable terms for both filings and price data before public release.
- The public-facing data source path is a material feasibility risk. The local proof of concept should proceed with a limited checked set while data coverage and licensing are investigated.
- The pure score seam was confirmed with the user: normalized financials per company and fiscal year, with source and reporting date, in; full screen result with scores, checks, assumptions, and data sufficiency, out. UI and NSE ingestion remain separate layers with separate tests.
