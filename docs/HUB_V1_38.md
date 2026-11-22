# Hub V1.38 — MLBB and MLBB Women scrim reports the Scrim Log way (21 Nov 2026)

From the EVOS Scrim Log (one row per game: side FP / SP, map, B1–B5, P1–P5 with the player, opponent bans and
picks, result, duration, link, time slot, game and session notes). Branch `feature/mlbb-scrim-log`.

## Put it live
- **Website only:** merge to `main`. No database change: games are stored in `scrim_games.data` (JSON), and the
  new fields sit there. The `scrim-ai` function is unchanged (screenshots still fill heroes and stats; the coach
  sets FP / SP and the map).

## Scrim reports → MLBB and MLBB Women
- **Step 1 is "Session and games":** sparring partner, **time slot** (Warmup, Jam 1 … Jam 10, Tournament), then
  **+ Add game** for every game, in the order played.
- **One game:** side **FP / SP** (required), **map** (Default Map, Broken Walls, Dangerous Grass, Expanding River,
  Flying Clouds, Golden Turret, Healing Turtle, Revealing Wisps), result, duration, **our bans B1–B5**, **their
  bans B1–B5**, ten heroes with a **pick number P1–P5** per team and our player per hero, **game notes** and a
  **VOD link**. K/D/A, gold and damage are optional (screenshots still fill them).
- **The report's result is counted from the games.** The typed won/lost boxes, the quick-score chips and the
  per-game side/result rows are gone for these two titles; a report without a game is refused.
- The reflection stays required, as before: focus, what worked or failed, adjustment, plan rating (they feed
  Trends, the AI features and the daily report).
- **Saved report:** a game table with Side, Map, Result, Time, our picks P1–P5 (player, K/D/A when entered),
  bans ours / theirs, notes and the VOD link. **Fix** reopens a game with all of this.
- **Download games (Scrim Log format):** one CSV row per game with the Scrim Log export's column names
  (DATE, COACH, TEAM, Game, Side, B 1…, P 1, Name P1…, Result, VS, Team, Opp B 1…, Opp P 1…, Durasi, LINK, Map,
  SESSION KEY, TIME SLOT, MVP, GAME NOTES, SESSION NOTES, CREATED AT, KILLS P1 … DAMAGE TAKEN P5). The result has
  its own "Result" header (the Scrim Log export leaves it blank). Session notes = worked / failed / next.

## Analysis
- **Patterns:** "We picked first (FP)" / "We picked second (SP)" and one line per map.
- **Draft statistics** (bans against us, our first picks) now cover every MLBB game, not only games with a
  draft screenshot. Order is kept within each team; the order between the teams is not recorded (as in the
  Scrim Log), so it is not reconstructed.
- **Daily sessions:** time slots sort after clock times, in slot order.

## Code
- New `src/core/scrim_log.js` (titles, FP / SP, maps, time slots, checks, draft from bans and picks, export rows).
- `src/core/capture.js` (game record), `src/hub/capture_ui.js` (game screen, game table),
  `src/hub/app.js` (report form, save, export button), `src/core/reports.js` (CSV), `src/core/patterns.js`,
  `src/core/analyst.js`, `src/core/daily_sessions.js`, `src/hub/i18n.js`, `src/hub/guide.js`.
- Tests: new `tests/scrim_log.test.js`; MLBB flows in `tests/capture*.test.js` and `tests/web/*` file games;
  the typed-score form tests moved to Dota 2 (`tests/fast_entry.test.js`, `tests/hubs_reports.test.js`).

## Not covered yet
- Editing a report does not change its games (use **Fix** per game). Changing the date or partner of a report
  does not update its games.
- Game capture must be switched on (it is, on the live site since V1.13). Where it is off, MLBB falls back to
  the typed score.
- IR (individual rating) per player from the Scrim Log is not a field; MLBB's "Rating" stat is the nearest.
