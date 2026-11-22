# Hub V1.40 — the two-minute scrim report (21 Nov 2026)

Improvement 2 of 5 in the pre-WEC plan. No new screens: the existing scrim report gets shorter, ends with a WhatsApp
copy, and My day shows which teams have not reported today. It ships with V1.38 and V1.39, which are not live yet.

**Why:** the live site has 11 scrim reports in total, and **0 from Dota 2 and PUBG Mobile** since the camp started
on 16 Nov. The support staff report, which ends in "Copy for WhatsApp", got 7 reports in 2 days.

## Put it live
Nothing extra. Merge to `main`, together with V1.38–V1.39 (see `docs/HUB_V1_39.md`). No database change.

## Fewer required boxes (6 → 3)
- **Needed:**
  - sparring partner
  - result
  - **the one change for the next session**
- **Now optional:** focus, what worked, what failed, plan rating (1–5). The boxes stay on the form, marked
  "(optional)".
- "The one change" is now the first box in step 2, right under the voice note. Screenshots (step 1) and the voice
  note still fill the boxes as before.
- The save bar counts the 3 needed items ("1 of 3 done — still needed: …").
- **A report without a plan rating is left out of averages, not counted as 0.** This applies to:
  - Plan followed (Scrim reports)
  - Practice quality
  - Analysis trend
  - Partner plan
  - Analyst day message
- **On the website,** the report is still that day's session record. When no focus is written, its objective reads
  "No focus noted", just as an empty "what failed" already read "No main issue noted".
- Older reports are unchanged.

## Copy for WhatsApp
- After a report is saved, **"Copy for WhatsApp"** appears next to Save ("Salin untuk WhatsApp" in Bahasa). It copies
  the report as a short message for the team's group:
  - title, date, partner and coach
  - result
  - focus
  - last change check
  - what worked and failed
  - plan rating
  - **Sesi berikutnya**
- The message is in the language the coach is using; Bahasa is the default.
- Only what the coach wrote is in the message. Player notes are not included.

## My day: scrim reports today, near the top
- A new place for the existing "Scrim reports" panel: right under "Needs your attention".
- New heading: **"Scrim reports today: X of N filed"**.
- **Order:** titles with no report today come first, the longest gap first, and "never" before any gap. Today, that
  puts Dota 2 and PUBG Mobile on top, without hard-coding them.
- The "No report yet today" list on Scrim reports (all titles) uses the same order.

## Tests
- `tests/web/report_fast_web.test.js` (new): a Dota coach saves with 3 items, copies for WhatsApp, and My day shows
  the order, in English and Bahasa.
- `tests/reports.test.js`, `tests/web/web_ui.test.js`, `tests/fast_entry.test.js`, `tests/hubs_reports.test.js` and
  `tests/i18n.test.js` were updated for the 3 needed items and the new wording.
- 325 tests: 290 pass, 0 fail, 35 skipped (database tests that need a local Postgres, as before). Typecheck is clean.
