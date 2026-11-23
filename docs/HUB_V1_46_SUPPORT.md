# Hub V1.46 (support staff) — follow-ups that carry over, who has not reported, check before WEC (23 Nov 2026)

These are items 2, 5 and 6 of the Support staff audit the owner approved on 23 Nov. They ship alongside the V1.46
coach-menu work (see `HUB_V1_46.md`).

**What the audit found on live data (17–21 Nov, counts only):**
- Only the physios (9 reports) and the psychologists (12) filed reports.
- The doctor and the physical coach filed none.
- 28 athlete rows had a follow-up written, but there was no way to close one.

**What changes for the database and existing data:**
- **Website only.** No database change.
- "Done" is stored inside the report row. The existing rules already let the author, Coach Donny, the Head Coach and
  admins update a report.
- Nothing is deleted, and old reports read as before.

## Follow-ups that carry over (each support staff member)
- At the top of the daily report, **"Still open from earlier"** lists your own follow-ups from the last 14 days.
- **Done** closes a follow-up. The report it came from records who closed it and when, the edit history keeps the
  change, and the saved report shows "done <date>".
- **Add to today** puts that athlete in today's report. A name typed by hand goes back in the "Not in the list?" box.
- **Rule:** a follow-up stays open until Done, or until **the same role** writes a newer report on that athlete.
- **Change from before:** a visit from another role (for example the psychologist after the doctor) no longer closes
  it.
- The "Open follow-ups" counts in My summary and Support team progress use the same rule.

## Reports today (Coach Donny, the Head Coach, admins)
- At the top of the page:
  - who has reported today, with the number of athletes
  - who has not reported yet
  - who missed yesterday
- The staff list comes from the support accounts in Users & access (their "Support staff job").
- Anyone else who filed that day counts as reported.
- **"Copy reminder for WhatsApp"** copies a reminder naming who has not reported. It contains no athlete names and
  no findings.
- This replaces the "Today" column and the "No report in the last 14 days from" line in Support team progress.

## Check before WEC (Coach Donny, the Head Coach, admins)
- **"Check before WEC — N days to go"** (to 15 Dec) covers the last 14 days. An athlete is listed for any of:
  - pain 7/10 or more at the **latest** treatment (pain that came down is not listed)
  - worse after the latest treatment
  - seen 3 or more times
  - a follow-up still open
- Each athlete shows reason tags, the open follow-ups, visits by role and the last date seen.
- Highest concern comes first.
- This replaces the "To watch" list in Support team progress. "Visits per team" is now one line.

## Files
- `src/core/support.js`:
  - new: `openFollowUps`, `closeFollowUp`, `reportedOn`, `reminderText`, `readinessList`
  - changed: `watchList` follows the new rule
  - changed: `supportReport` keeps `fuDone` on edit
- `src/hub/support_ui.js`: the page
- `src/web/main.ts`: staff jobs in the staff directory
- `src/hub/i18n.js`: Bahasa labels
- `src/hub/index.html`: the `.carry` style
- `tests/support.test.js`: 3 new tests, plus the updated follow-up rule

## Put it live
Merge to `main`. No database or AI change.
