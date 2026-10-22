# 06: Save watchlist and qualitative company reviews locally

**What to build:** An investor can save covered companies to a watchlist and record a separate qualitative review of moat, management and capital allocation, and circle of competence, without signing up or changing the financial score.

**Blocked by:** 04 — Show company analysis and the screener table.

**Label:** AFK

**Status:** done

- [x] Let an investor add and remove companies from a browser-local watchlist.
- [x] Provide separate prompts for moat, management and capital allocation, and circle of competence, with space for investor notes.
- [x] Persist watchlist membership, checklist responses, and notes in the same browser between visits without creating an account.
- [x] Keep investor-entered reviews out of the automated financial score.
- [x] Make the watchlist and company reviews available from the screener/company views.
- [x] Verify persistence and visible behavior through external behavior tests.

## Result (22 October 2026)

- `public/research.mjs` owns a versioned `{ watchlist, reviews }` record under `munger-screener:research:v1`. It normalizes unknown or corrupt data, drops unsafe keys, caps notes at 4,000 characters, and reports unreadable or unsupported saved data instead of silently overwriting it.
- The company view has a Watchlist checkbox and a qualitative review form with three sections (moat, management and capital allocation, circle of competence), a reviewed checkbox per section, and notes. The screener shows a star, a “review saved” marker, and a watchlist-only filter with an explicit empty state.
- Reviews are stored entirely in browser storage and are never passed to the scoring modules or the HTTP API. The financial score is unchanged after saving a review.
- Verified by `test/research.test.js` (normalization, add/remove, save, round-trip, corrupt storage, failed writes) and the DOM-level integration test (watchlist toggle, filter, save, reload state in storage, review persistence, score unchanged). Full suite: 73 passing.

Issue 07 (JSON export/import) now builds on this record; see that issue for the backup format and validation behavior.

