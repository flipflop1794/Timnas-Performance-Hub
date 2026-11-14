# Hub V1.28 — tidier PUBG Mobile log, Trends period, Match-day review removed (14 Nov 2026)

Website only: no database or AI function change. Going live = merge to `main`.

## Removed
- PUBG Mobile **Match-day review** tab ("Review hari pertandingan"). The match log, Team, Trends and Strategy sim are unchanged.

## PUBG Mobile → Log & import ("Catat scrim dan fight")
- What the log is for, in one line, and two counters: match rows and fight rows logged.
- **How to log** in four numbered steps (copy the template → fill in a spreadsheet → paste or load the CSV → Check and save).
- Two clear boxes: **1. Match results (needed)** and **2. Fights (optional)**, each with its own Copy template button.
- **What to write in each column**: a table per template with the column, what to write in plain words, an example
  from the template and ✓ for the columns that are needed. 0/1 columns and "leave empty, never guess" explained.
- All of it in Bahasa Indonesia by default.

## Trends
- Period buttons: **Last 1 week**, **Last 2 weeks**, **Last 4 weeks** (default 4).
- 1 and 2 weeks are shown day by day; 4 weeks week by week. The dates of the period and of the period it is
  compared with are shown.
- "Better" / "Worse" now compares the whole chosen period with the equally long period just before it (same 95%
  interval and at least 6 games or reports on each side). The leadership dashboard's results trend is unchanged
  (last 2 weeks vs the 2 before).

## Tests
- `tests/trends.test.js`: periods (days / weeks, compare windows, fallback) and a verdict against the week before.
- `tests/web/web_ui.test.js`: default 4 weeks, switching to 2 weeks shows 14 days.
- Full suite: 280 tests, 245 pass, 0 fail, 35 skipped (database).
