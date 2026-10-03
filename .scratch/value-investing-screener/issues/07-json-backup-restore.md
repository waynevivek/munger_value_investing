# 07: Export and import local research as JSON

**What to build:** An investor can back up browser-local watchlists and qualitative reviews as JSON and restore them later, avoiding loss of research when browser data is cleared or moved.

**Blocked by:** 06 — Save watchlist and qualitative company reviews locally.

**Label:** AFK

**Status:** ready-for-agent

- [ ] Export watchlist membership, qualitative checklist responses, and notes as a downloadable JSON file.
- [ ] Import a previously exported JSON backup and restore the saved research to the browser.
- [ ] Validate imported content before applying it; reject invalid or incompatible files with a clear explanation and leave existing saved research intact.
- [ ] Verify export/import round-trip behavior and invalid-file handling with hand-written fixtures.
- [ ] Keep the import replace/merge interaction explicit in the UI and document whichever behavior is selected during implementation.
