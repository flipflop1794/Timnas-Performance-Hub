# Hub V1.31 — scrim results on competitive settings (18 Nov 2026)

Inside the existing scrim report (no separate settings page, at the staff's request). Website only; no database
change. The result of the report is computed from the rows.

## Settings in use (confirmed with the staff, 18 Nov 2026)
- **CS2 Active Duty pool:** Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke (Cache replaced Overpass in July
  2026; Anubis replaced Train in January 2026). HLTV and Liquipedia block automated reading: checked by the staff.
- **PUBG Mobile:** 10-6-5-4-3-2-1-1 placement points, 0 for 9th–16th, +1 per elimination (WEC 2026 on Liquipedia;
  same as the official PUBG Mobile rulebook v1.7.0).
- **eFootball:** Authentic, Superstar, 10 min, injuries off, extra time and penalties on, 5 subs in 3 windows.
- **MLBB:** Draft Pick. **Dota 2:** Captains Mode.
Change them in `src/core/comp_rows.js` if IESF publishes different rules.

## Step 1 "Hasil", per title
- **CS2 / CS2 Women — per map:** map from the 7-map pool, rounds won and lost, CT rounds won (optional); overtime
  marked. Maps won / lost fill themselves. A confirmed scoreboard screenshot adds its map as a row.
- **PUBG Mobile — per match:** map (optional), placement, eliminations; each row shows its points. Matches played,
  total points, average placement and chicken dinners fill themselves. Summary: "5 match: 37 poin (peringkat 22 +
  eliminasi 15) · rata-rata peringkat 3,4 · 1 chicken dinner".
- **eFootball — per match:** goals for and against, extra time or penalties (with the shoot-out score); plus
  "Dimainkan dengan setelan kompetitif?" (yes / no). A confirmed stats screenshot adds its match as a row.
- **MLBB / MLBB Women / Dota 2 — per game (optional):** side and result; plus "draft turnamen (Draft Pick /
  Captains Mode)?". The quick score and screenshots work as before.
- A half-filled or impossible row is named ("Match 2: peringkat harus bilangan bulat dari 1 sampai 16.").

## Shown afterwards
- Report card and CSV (`per_map_or_match`, `competitive_settings`).
- **Trends, CS2 — Map pool:** per map in the chosen period: maps played, won-lost, rounds for-against, last played;
  maps not practised in the last 14 days are flagged.
- **Trends, PUBG Mobile:** placement points, eliminations and average placement per match.
- **Trends, eFootball:** goals scored and conceded per match (from the rows).

## eFootball best-of-3 ties
- Matches are grouped in order into ties: a tie ends when one side has 2 wins or after 3 matches (level after 3 =
  drawn tie). Shown in the summary and on the report card ("Tie (best of 3): 1 menang, 0 kalah"); an unfinished
  last tie is mentioned, not counted.

## Tests
`tests/comp_rows.test.js`; website flow in `tests/web/match_read_web.test.js`. Full suite: 298 tests, 263 pass,
0 fail, 35 skipped (database); Donny 105 pass. A flaky brainstorm test (a random report id could contain the digit
under test) now uses a fixed id.
