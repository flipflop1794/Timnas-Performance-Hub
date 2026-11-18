# Hub V1.30 — screenshot reading for every title (18 Nov 2026)

Before: MLBB, MLBB Women and Dota 2 (end-of-game and draft screens) and PUBG Mobile (result screen).
Now also **eFootball** (match stats screen) and **CS2 / CS2 Women** (scoreboard).

## Put it live
1. **Database:** run `supabase/RUN_ON_LIVE_V1_30.sql` (adds `match_result` to the AI actions logged in `ai_usage`;
   no table, policy or data change).
2. **AI function:** redeploy `scrim-ai` (prompt version `scrim-ai-2026-11-28.2`).
3. **Website:** merge to `main`. Until 1–2 are done the upload button stays hidden ("type the score instead").

## How it works (Scrim reports → step 1 "Hasil" → Hasil dari screenshot)
- Upload one screenshot per match (eFootball) or per map (CS2); several at once is fine.
- The AI reads only what is visible; anything unreadable or out of range stays empty and is flagged.
- **eFootball:** both team names, score, penalties, and possession, shots, shots on target, passes, tackles,
  interceptions, fouls, offsides, corners, free kicks, saves. Our side is found from the name (INA / Indonesia /
  Timnas) or the coach picks it.
- **CS2:** map (snapped to the Active Duty pool, see V1.31), rounds per team, and per player K / D / A, ADR, HS%,
  MVPs and score. Our team is found from the roster names (learnt aliases count).
- The coach checks and taps **Pakai match/map ini**: it becomes a row of the result (V1.31) and is saved with the
  report as a game (`scrim_games`, game `efootball` / `cs2`). Screenshots are kept 90 days like the others.

## Analysis
- **Trends, eFootball:** possession % and shots on target per match from the screenshots.
- **Trends, CS2:** per-player K, D, A, KDA and ADR, day by day or week by week.

## Tests
`tests/match_read.test.js`, `tests/web/match_read_web.test.js`, the AI function's routing and the ping list.
