# Screenshot test set (AI capture)

Put real end-of-game screenshots from pelatnas scrims here, one folder per game:

- `mlbb/` — MLBB end screen (and, separately, the Data tab)
- `dota/` — Dota 2 post-game scoreboard

Next to each image (`g1.png`) put the correct answer as `g1.json`, typed by hand from the screenshot:

```json
{ "ourSide": "blue", "result": "win", "durationS": 1122,
  "players": [ { "side": "blue", "slot": 1, "player": "Aran", "hero": "Fredrinn", "kills": 3, "deaths": 1, "assists": 9, "gold": 9000 } ] }
```

Then run `ANTHROPIC_API_KEY=... node tools/eval_screenshots.mjs mlbb`. Aim for 20+ screenshots per game, taken the way
coaches will take them (phone photo of a monitor, PC screenshot, both client languages). Re-run after any prompt,
model or game-client change. Screenshots of scrims are internal: keep this folder out of public repositories.
