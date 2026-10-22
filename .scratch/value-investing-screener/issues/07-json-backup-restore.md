# 07: Export and import local research as JSON

**What to build:** An investor can back up browser-local watchlists and qualitative reviews as JSON and restore them later, avoiding loss of research when browser data is cleared or moved.

**Blocked by:** 06 — Save watchlist and qualitative company reviews locally.

**Label:** AFK

**Status:** done

- [x] Export watchlist membership, qualitative checklist responses, and notes as a downloadable JSON file.
- [x] Import a previously exported JSON backup and restore the saved research to the browser.
- [x] Validate imported content before applying it; reject invalid or incompatible files with a clear explanation and leave existing saved research intact.
- [x] Verify export/import round-trip behavior and invalid-file handling with hand-written fixtures.
- [x] Keep the import replace/merge interaction explicit in the UI and document whichever behavior is selected during implementation.

## Result (22 October 2026)

- Backup format: `{ format: "munger-screener-research", version: 1, exportedAt, watchlist, reviews }`, pretty-printed and downloaded as `munger-screener-research-YYYY-MM-DD.json`.
- Import **replaces** the browser-local watchlist and reviews; it does not merge. The UI states this next to the file input, and the README repeats it.
- Validation runs before any state change. Wrong format/version, malformed watchlists or reviews, unknown sections, non-boolean reviewed flags, non-text or over-long notes, unsafe company keys, and invalid JSON are rejected with a specific message. Existing research is left untouched, and a failed browser write rolls the in-memory state back to the previous record.
- The backup deliberately excludes financial data, manual prices, and the editable screen preset, and the UI says so.
- Verified by `test/research.test.js` (serialize/parse round-trip, strict rejection cases) and the DOM integration test (download contents, rejected import leaves storage intact, successful import replaces the review and watchlist). Full suite: 76 passing.
