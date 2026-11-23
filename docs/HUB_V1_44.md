# Hub V1.44 — rival data checked on 23 Nov, research added (23 Nov 2026)

## Rosters (Competitors → Rosters & players)
- **All 99 nation pages on wec.iesf.org were re-read on 23 Nov** (161 teams, players, captains, coaches).
- **No rival change since 21 Nov.** The read ships as a dated "no change" check on every rival team, so "last checked"
  shows 23 Nov and no weekly check is due until 30 Nov.
- Files:
  - `tools/raw_rosters_2026-11-23.txt`
  - `tools/site_check_2026-11-23.mjs`
  - `data/wec/rival_rosters.json`
- The official site has no group draw, schedule or rulebook yet (newest news item: 11 Nov).

## Research notes (nation profile, opponent card, "What we know")
New dated notes, each with its source. Liquipedia blocks automated reading, so its lines come from search summaries
and say "confirm".

| Title | Nation | Note |
|---|---|---|
| Dota 2 | Mongolia | Liquipedia lists a sixth player, "sogeking". Reported as our first match on 16 Dec. |
| Dota 2 | Kazakhstan | Kuka11 has no club; HardL at CSKA Esports; Liquipedia's five match the official five. |
| MLBB | Malaysia | Official site: Rokji. Liquipedia: Rough (gold lane). Confirm on match day. |
| PUBG Mobile | Türkiye | S2G (HamsiG, S2GKam1kaze) plays the PMGC Grand Finals in Istanbul 11–13 Dec, two days before WEC. |
| PUBG Mobile | Mongolia | Fearless plays for The MongolZ, also in PMGC 2026: the same calendar squeeze. |
| CS2 | Lithuania | Bymas benched by his club since about August. |
| CS2 | Romania | lauNX at FUT Esports (PGL Bucharest 2026 winner): tier-1 club experience. |

These notes count towards scouting coverage, as the earlier desk-research notes do. Dota 2 now has notes on 3 of 11
nations (Kazakhstan added).

## Published results (read date now 23 Nov)
- Dota 2 Mongolia: lost 0–2 to Indonesia in the IESF 2025 South & South-East Asia qualifier playoffs. Single
  source, marked "check".
- Club results, marked "club":
  - **MPL Malaysia S18:** SRG beat Team Rey 4–3.
  - **MPL Cambodia S11:** Vigor Apex beat Team Flash KH 4–2. Which WEC players are on these clubs is still to check.
  - **MSC 2026:** Myanmar's Yangon Galacticos runner-up.
  - **PMGO 2026 S2:** The MongolZ won the Eastern Europe & Central Asia region.

## Tests
Tests that count notes or roster checks were updated for the new notes and the 23 Nov check:
- `competitor_form`
- `competitors_v15`
- `rosters_oppcard`
- `v140`

## Put it live
Merge to `main`. No database or AI change.
