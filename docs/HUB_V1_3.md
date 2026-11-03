# Timnas Performance Hub V1.3 — competitors and scrims in every game

Prepared 3 Nov 2026. Builds on V1.2 (HUB_V1_2.md). Not published: files only.

## Decisions recorded
- **Wellbeing consent: confirmed** (Aufa, 3 Nov). The wellbeing screens now say so. Still open: whether access narrows from "editors" to Donny only.

## What changed
**Every title now has the same three working areas: objectives, scrims & practice, competitors.**
- Dota 2: Team · Scrims & practice · Post-match · Competitors (field board + player-pool scouting) · Draft room · Series review
- PUBG Mobile: Team · Scrims & practice · Log & import · Competitors · Strategy sim · Match-day review
- Other titles: MLBB · MLBB Women · eFootball · CS2 · CS2 Women — each with objectives, staff observations, scrims and competitors

**Competitors (per title)**
- The full WEC finals field as published on wec.iesf.org (read 3 Nov): Dota 2 11 rivals, MLBB 7, MLBB Women 3, PUBG Mobile 15, CS2 11, CS2 Women 11, eFootball 97 nations listed (format unpublished).
- Verified notes from the decision log are pre-loaded with source and date (Myanmar's Asian Games gold, Malaysia's new roster, Cambodia and Türkiye ENC rosters, Myanmar's PUBGM player, Mongolia and Greece Dota matching).
- Staff add notes (observed or hypothesis, with a source) and set a threat tier — main threat / contender / watch — which requires a name and a reason. Nothing is computed.
- "Titles at WEC" shows multi-title nations (Egypt 5; Türkiye, Argentina, Mongolia, South Africa 3), so scouting work can be shared across title coaches.

**Scrims & practice (per title)**
- Plan a session: date, time, kind (scrim, scenario drill, review, individual practice, physical / recovery), format, sparring partner and level, owner.
- **Stand-in for a WEC rival:** mark when a sparring partner plays like a rival (e.g. an MPL MM team for Myanmar). The page counts which rivals the team has practised against.
- Attach accepted objectives. Logging the result (score or points, match IDs, notes) also logs a coaching-cycle session on each attached objective, linked to the scrim.
- Overdue scrims (date passed, no result) are flagged on the page and on Today.
- The Juara Umum board gains two columns: scrims in the last 7 days / planned, and rivals with notes.

## Validation — 44 automated tests, all pass
New: published field sizes per title; verified notes and staff tiers on the board; a note for a nation outside the field is refused; scrim rules (partner, owner, score); a scrim attached to an accepted Dota objective logs a linked session with the scrim ID and the rival it stood in for; the board, PUBGM competitors and CS2 Women pages render. Not run: anything on the published page.

## Suggested next features (not built)
| Priority | Feature | Why it helps medals | Owner |
|---|---|---|---|
| 1 | **Tournament-week runbook** per title: match-day schedule, warm-up and mental routine (Donny), draft/series prep slots, bracket tracker once IESF publishes the format | Removes avoidable mistakes on 15–20 Dec; aligns three staff across seven titles | Fayad + Donny |
| 2 | **Between-games (Bo3/Bo5) adaptation sheet**: what changed last game, ban/draft adjustments, one call per player | Most series are decided by game-2 adjustments; must respect live-coaching rules once published | Aufa (Dota, MLBB), title coaches |
| 3 | **Rival VOD library**: links per nation with tags, feeding competitor notes | Turns scouting into a shared asset; Egypt alone appears in 5 titles | Analysts (TBD) |
| 4 | **Weekly BOD/Head Coach brief**: one-page PDF generated from the board | Saves Fayad time; keeps PB ESI informed with the same numbers the staff use | Fayad |
| 5 | **Individual player plans**: per-player goals (hero pool, role, physical) linked to the cycle and wellbeing | Makes development measurable per player, not only per team | Title coaches + Donny |
| 6 | **Sparring partner bank**: clubs available per title, level, which rival they resemble, contact owner | Makes "stand-in" practice repeatable | Title coaches |
