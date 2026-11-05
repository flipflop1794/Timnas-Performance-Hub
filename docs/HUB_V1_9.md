# Timnas Performance Hub V1.9

## What is new
1. **Every title has its own section** in the top menu: Dota 2, PUBG Mobile, MLBB, MLBB Women, eFootball, CS2, CS2 Women.
   Each has Team, Scrims & practice, Scrim reports, Competitors (MLBB and MLBB Women also Draft Lab).
2. **Scrim reports** (all 7 titles): coaches file one report per sparring partner, the same day.
   Fields: date, time, written by, partner, level, format, who played, result, what was practised,
   how closely the plan was followed (1-5), what worked, what failed, game detail, player notes, next adjustment, VOD.
   - Result: won/lost/drawn (games, matches or maps by title); PUBG Mobile uses matches played + points + average placement.
   - Game-specific prompt: heroes and draft (Dota 2, MLBB), maps and drops (PUBGM), formation and goals (eFootball), maps and round scores (CS2).
   - Reports cannot be edited. Mistakes are fixed with a dated correction note.
   - Choosing a planned session closes it, so the result is typed once.
   - Day-by-day roll-up, 7-day totals, trend, days since last report, "start the next session from here".
   - CSV download per title or all titles.
3. **Today > Scrim reports**: all titles by day for 7 days, who has not filed today, each title's next adjustment.
4. **Weekly brief** has a scrim report table and flags titles with no report this week.
5. Bahasa Indonesia covers all new screens.

## Assumptions to confirm
- The 7 titles are the full WEC list for Indonesia (from the hub's title list). Tell us if another title must be added.
- Draft Lab stays a separate page (linked), not copied into the hub.
- Who may read player notes in reports: currently everyone with access to the page. Decision needed (Head Coach).
- Who files PUBGM and eFootball reports: TBD (Fayad to assign).

## Data
New collection `scrim_reports` (same database as before). Nothing else changed.
