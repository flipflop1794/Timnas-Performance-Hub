# Hub V1.21 — Competitor analysis: recent results on record (13 Nov 2026)

Improvement to an existing feature (no new page). Every title's **Competitors** tab (MLBB, MLBB Women, Dota 2 →
Scouting, PUBG Mobile → Rivals, eFootball) now opens with the rivals' published national-team results, gathered
by desk research on 13 Nov 2026.

| Where | What changed |
|---|---|
| Competitors tab, top | **Recent results on record**: podiums of WEC24, WEC25, Asian Games 2026, SEA Games 2025, FIFAe World Cup 25 per title; nations in our WEC field in bold; which field nations have no public result yet (the scouting gaps). |
| Competitors table | New **Recent results** column per nation. Staff notes beyond three, and results beyond two, fold under "N more" instead of being cut off. eFootball's long entry list now also shows nations that have a result on record. |
| Competitor analysis → Nation | Each title section has a **Recent results** block. |
| Opponent card | Up to four recent results, also in the downloaded markdown ("Recent results (public)"). |

Rules kept: results are context, not scouting. They are stored apart from staff notes (`EVENTS` / `FORM` in
`src/core/competitors.js`) and do **not** count towards scouting coverage, "Scout next" or stale-note checks.
Nothing is scored or predicted. Lines marked **to confirm** come from search summaries (Liquipedia blocks
automated reading): open the source before relying on them. Lines marked **club** are club results.

## Highlights for the coaches
- **MLBB:** Malaysia won WEC24 and WEC25 (3–0 over Cambodia); Türkiye beat Indonesia for WEC25 bronze;
  Myanmar won Asian Games 2026 gold (Indonesia silver, Malaysia bronze).
- **MLBB Women:** Egypt took bronze at both WEC24 and WEC25. Türkiye lost 0–2 to Indonesia in the WEC25 groups.
  No public result found for Argentina.
- **Dota 2:** Greece is the defending WEC champion (WEC24, 2–0 over Sweden; no WEC25 Dota event). Kazakhstan
  projected #2 in the Esports Nations Cup Dota ranking (to confirm).
- **PUBG Mobile:** Türkiye won WEC24 (Brazil bronze); a Turkish club (S2G) won the 2026 PUBG Mobile World Cup.
  Türkiye, Mongolia and Brazil topped the Esports Nations Cup ranking (to confirm). Sources conflict on whether the
  Nations Cup main event ran in November 2026 or was postponed to November 2027.
- **eFootball:** Iran won Asian Games 2026 gold over Malaysia (Japan, Uzbekistan bronze); Poland (console) and
  Thailand (mobile) won the FIFAe World Cup 25.

## Iteration 2 (13 Nov 2026): rival gaps filled, WEC rosters re-read
- **Rosters re-read from wec.iesf.org** for every MLBB, MLBB Women, Dota 2 and PUBG Mobile rival. Changes ship as a
  dated site check in `data/wec/rival_rosters.json` (`checks`), applied by `seedRosters`: the Rosters page and nation
  profile show **roster changed** with who joined, who left and the coach change, instead of silently replacing the
  3 Nov read.
  - **MLBB Myanmar:** all five replaced (now J3X (C), Coin, Dear, Niko, Shyco; coach Thet Lynn Htut).
  - **MLBB Türkiye:** all five replaced (now Sunshine (C), Harikasın Samet, intangible, Saviom, Zeichnen; coach Jeff).
  - **MLBB Cambodia:** Ayzen, Darkside, Runnn in; SryimFelix, PPPPPP, Saa out; Linnn captain.
  - **PUBG Mobile Colombia:** coach now Hades.
  - Spelling fixes: Dominican Republic tags (Junn, INSTNCT, Ricky.) and New Zealand's Zaviernz.
  - Everything else matches the 3 Nov read. Fields match the site (99 nations, 161 teams).
- **Staff notes added (observed, 13 Nov):** Myanmar, Türkiye and Cambodia roster changes; Türkiye PUBG Mobile four
  includes S2G's HamsiG and S2GKam1kaze (2026 PUBG Mobile World Cup winners).
- **More public results:** Myanmar MLBB AG final 4–0 over Indonesia; Nepal AG qualifier; Dota 2 Greece, Iran,
  Belarus and North Macedonia qualifier results; PUBG Mobile Asian Games placings for Malaysia (10th),
  Uzbekistan (11th), Myanmar (12th).
- **Still no public result found:** MLBB Women Argentina; Dota 2 Egypt; PUBG Mobile Morocco, Kyrgyzstan,
  Bangladesh, Belarus, Montenegro, Romania, Serbia.
- **Esports Nations Cup:** sources conflict (main event in Riyadh in Nov 2026 vs postponed to Nov 2027); lines say so.
- If a title coach already edited a rival roster in the hub, their saved copy wins over the shipped re-read
  (by design): record a weekly check on the Rosters page for those teams.
- `tools/build_rosters.mjs` regenerates the JSON from the 3 Nov raw read: do not re-run it, or the 13 Nov checks and
  spelling fixes are lost.

## Iteration 3 (13 Nov 2026): scrim report polish
| Area | What changed |
|---|---|
| **CSV export** (Scrim reports → Download CSV) | Safe to open in Excel / Google Sheets: text starting with `=`, `+`, `-` or `@` gets a leading apostrophe so it is never run as a formula (scores and points stay numbers). The file starts with a UTF-8 mark, so "Türkiye" and dashes are not garbled in Excel; Windows line ends. The confirmation says how many reports were saved. |
| **Correction dates** | In the CSV and on the report card, a correction shows the team's day (WIB), not the UTC day (a note written at 06:30 WIB was dated the day before). |
| **PUBG Mobile reports** | Match wins can no longer exceed matches played; if every match was a win, the average placement must be 1. The wins field is highlighted when wrong. |
| **Save report** | A second tap while a save is still on its way is ignored (no duplicate reports on a slow connection); "Saving…" shows meanwhile. |

Checked by running `src/core/reports.js` in a browser (15 checks pass) and parsing `app.js`; the
full `npm test` (including the page tests) has not been run on this PC.

## Iteration 4 (13 Nov 2026): Bahasa Indonesia by default; Competitors tab
| Area | What changed |
|---|---|
| **Language** | The hub and the website's sign-in screens open in **Bahasa Indonesia**. English only when a viewer picks EN (remembered on that device). The page is marked `lang="id"`. Strings not yet in the dictionary still show in English, and validation messages stay English (as before). |
| **Competitors tab** (every title) | New **Last change** column (staff note, tier, roster change or public result, whichever is newest) and a **roster changed** tag on the nation. Toggle **By threat tier** (default) / **Latest change first**. |
| **Public result → note** | **Use as note** next to each public result fills the "Add a note" form (nation, source, text; "to confirm" results come in as a hypothesis). The coach checks it and presses Save: nothing is saved for them. |
| **Today** | New panel **Rival roster changes (last 14 days)** for the titles the person follows: who came in, who left, coach changes, with a link to the nation profile. |

Tests: existing page tests now set English explicitly (`hub-lang = en`) so they keep checking the same text;
`tests/i18n.test.js` checks that a fresh device opens in Bahasa Indonesia; a new page test covers the
Competitors tab and the Today panel (in `tests/competitor_form.test.js`). Parsed and the translations checked in a
browser; `npm test` and the build have not been run on this PC.

## Iteration 5 (13 Nov 2026): Today page
- **Needs attention now**, first on Today, ranks what to do for the person chosen at the top (their titles only):
  - **now** (already late): scrims with no result logged; decisions due after a logged session.
  - **today**: proposals waiting for review; titles with no scrim report for 2+ days; sessions today without
    attendance; wellbeing flags (readiness owner / Head Coach only); rival rosters changed in the last 14 days.
  - **this week**: players who have not answered about availability; weekly rival roster checks due.
  - Each line has a count, the titles or nations concerned, and a button to the screen that fixes it. When nothing
    is due: "Nothing urgent. Plan the next session."
- The detailed panels (queue, Pelatnas, wellbeing, scrims, reports, rival changes, per-title objectives) follow
  as before. All new text is in Bahasa Indonesia.
- New page test in `tests/competitor_form.test.js` (order of urgency, links, panel above the queue).

## Verified (13 Nov 2026, Windows, portable Node 22.23.5)
- `npm ci`, `npm run typecheck`, `npm run build` (dist/hub.html 1117 KB), `npm run build:web` with placeholder
  values: all pass.
- `npm test`: **216 passed, 0 failed, 35 skipped** (the database access-rule tests: no local Postgres; CI runs them),
  plus Coach Donny's suite **105 passed**.
- Fixed during the run: a comment in iteration 4 had cut off part of the hub's start-up state (rival rosters,
  readiness, opponent cards), which broke 26 page tests; a missing space in correction lines; one new test used a
  nation that has since gained a public result; one capture test waited a fixed 250 ms and now waits up to 3 s.
- `dist-web/` now holds the placeholder-key build: rebuild with the real values before any manual deploy
  (Vercel builds its own).

## Put it live
Website only: merge to `main` (no database change). Run `npm test` first: `tests/competitor_form.test.js` is new.

## Not covered yet
- WEC25 group-stage scores for most rivals, WEC26 regional qualifier results, and Dota/PUBGM results for Iran,
  Belarus, North Macedonia, Kyrgyzstan, Uzbekistan, Bangladesh, Montenegro, Romania, Serbia: not found in
  public sources reachable from here. Staff add these as notes.
- The research is dated 13 Nov 2026; update `FORM_READ`, `EVENTS` and `FORM` when you re-check.
