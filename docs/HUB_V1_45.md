# Hub V1.45 — tidy scrim reports in Excel, Main dashboard CSV, support staff weekly dashboard (23 Nov 2026)

Owner's request (23 Nov):
- Keep coaches' and analysts' screens free of noise: nothing they are unlikely to use.
- Make scrim reporting tidy and downloadable to Excel.
- Add a CSV download of the Main dashboard.
- Add a weekly dashboard for the support staff.

No new screen was added for coaches; the changes are buttons on existing pages and a panel on the Support staff page.

## Scrim reports: Excel download
- **"Download Excel"** on each title's Scrim reports page, and **"Download all (Excel)"** on Scrim reports (all
  titles). The CSV download stays as a small "CSV" button.
- **The workbook:**
  - Sheet **Summary**: one row per title, with:
    - reports in total
    - sessions in the last 7 days
    - result
    - plan followed
    - last report
    - where the next session starts from
  - **One sheet per title**, newest report on top. The columns follow how a coach reads a report:
    - date, partner, result
    - focus, what worked, what failed
    - **the one change for next time**
    - then the details (game detail, per-map rows, player notes, VOD, written by, corrections, report ID)
  - Each sheet has one kind of result: win–loss titles get Won / Lost (eFootball also Drawn), and PUBG Mobile gets
    Matches / Points / Avg place / Match wins. No half-empty columns.
  - Bold, shaded header that stays on screen when scrolling; filter buttons on every column; set column widths;
    long text wraps.
  - Text is stored as text: a cell starting with "=" is never run as a formula.
  - Reports without a plan rating or focus (optional since V1.42) show a blank, not 0.
- **The Excel writer:** `src/core/xlsx.js` (no library, about 100 lines).
- **How it was checked:** the file was opened in Microsoft Excel on this computer: 8 sheets, filters on, header frozen,
  "Türkiye" and other accents correct, no repair prompt.
- **Tidier report cards:**
  - "Practised: …" and the "Plan n/5" tag only appear when filled in (no more "Practised: ·" or "plan null/5").
  - "Next session" is marked with a gold bar.

## Main dashboard: CSV download
- **"Download CSV"** under the Titles table: one row per title with the date, practice quality and its change,
  sessions and result (last 7 days), plan followed, results trend, next WEC match, overdue follow-ups, last report and
  where the next session starts from.
- The same numbers as on screen, and only the titles the person can see.

## Support staff: weekly dashboard (Performance → Support staff)
- **Weeks:** Monday to Sunday. "This week", "‹ Week before" and "Next week ›" move between weeks.
- **Coach Donny, the Head Coach and admins** see everyone:
  - numbers: reports, athlete visits, follow-ups, staff reporting, each with the week before
  - a grid of each staff member × each day (athletes seen that day, "—" for no report, "not yet" for today)
  - totals per role: pain drop and "better" for physio, formal / informal sessions for psychologists
  - visits per team
- **A support staff member** sees "My week": the same, for their own reports only.
- **"Copy for WhatsApp":** the week in a few lines (in Bahasa by default). **Counts only**: no athlete names, no
  findings, no staff names.
- **Deliberately no file download:** support reports hold health information, so they stay in the Hub.
- The rolling 7-day panels ("Support team progress", "My summary") stay as they were.

## Tests
- `tests/v145.test.js` (7 tests):
  - the workbook is a valid zip with correct checksums
  - frozen header, filters, text never a formula, odd characters safe
  - sheet layout and order
  - dashboard CSV safety
  - the calendar week, grid and counts-only WhatsApp text (no names)
  - the pages: Excel on a title and on all titles, the dashboard CSV, the weekly panel and week picker
  - the Bahasa labels
- 344 tests: 309 pass, 0 fail, 35 skipped (database tests), in Jakarta and UTC time. Typecheck is clean.

## Put it live
Merge to `main`. No database or AI change.
