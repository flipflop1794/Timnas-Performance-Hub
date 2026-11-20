# Hub V1.35 — camp plan on a monthly timeline (20 Nov 2026)

From the deck "Periodesasi Latihan Esport" (hybrid periodisation) and its daily-unit template for week 2.
Every title's coach plans the pelatnas in the hub and tracks how it is run.

## Put it live
1. **Database:** `supabase/RUN_ON_LIVE_V1_35.sql` (one new table, `camp_plans`; nothing else changes).
2. **Website:** merge to `main`.

## Pelatnas → Camp plan
- **Overview** for every title the user can see: phase now, days run as planned, days not marked, sessions logged,
  plan warnings. Titles without a plan say so.
- **Make the plan** (that title's staff, admin, Head Coach): start and end dates, taken from the Pelatnas board (or
  the deck's 16 Nov – 12 Dec when no dates are recorded). It starts from the deck's model:
  - weeks: accumulation (≈74 % load) → peak volume (100 %) → transmutation (≈89 %) → taper (≈54 %);
    longer camps add peak-volume weeks, shorter ones drop the middle phases;
  - days: Mon high, Tue medium, Wed high, Thu low, Fri high, Sat simulation, Sun off (±6/5/2/4/0 h);
  - daily unit template: physical, mental, session 1–3, recovery per weekday (the MOBA example, editable).
- **Monthly timeline:** November and December as calendars (Mon-first), each day coloured by level, the week's phase
  on its first day, ✓ / ½ / ✗ once marked, past days not marked shown dashed, WEC 15–20 Dec marked.
- **Tap a day:** change its level, add a note, mark it **as planned / partly / not run** (only once it has happened),
  read that weekday's units.
- **Weeks: planned and actual:** phase and target load per week (editable), planned hours, days marked, % as planned,
  sessions logged (from Scrims & practice) and, for staff who can see session-RPE records, actual load on the plan's
  own scale (100 % = the load that matches the finished weeks on average), with planned/actual bars.
- **Warnings from the deck:** high days back to back, a week without a day off, a taper above 70 %.
- **Today:** "Camp plan days not marked yet" with a link.

## Performance → Support staff: one session, many athletes
- New section in the daily report: **One session, many athletes** (Satu sesi, banyak atlet).
- Tick athletes, or a whole team with one click, and type others "Name (team)". Write what you did and found once,
  then tick follow-up if needed. **Add to the report** makes one row per athlete, and each row can still be changed
  (pain score, response, line for the coach) before saving.
- The saved report has the same shape as before: visits, repeats and follow-ups still count per athlete.
  No database change. At most 40 athletes per report.

## Rules
- Same access as the other Pelatnas tables: read by title, written by that title's staff, deleted by admin only,
  every change audited. Leadership reads.
- Notes: under 200 characters, no phone or ID numbers. No health details belong here (wellbeing stays with Coach Donny).
- The hub does not decide anything: warnings point at the plan, the coach changes it.

## Tests
`tests/camp_plan.test.js` (plan model, warnings, progress, calendar, and the screen end to end);
`tests/db/pelatnas_rls.test.js` now covers `camp_plans`. `tests/support.test.js`: the group session (rows per athlete,
typed names get their team, checks) and the screen (whole team ticked, written once, saved as one report).
