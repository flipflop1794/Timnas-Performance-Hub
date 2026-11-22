# Hub V1.38 — current WEC facts: rosters, formats, patch, schedule (21 Nov 2026)

From the desk research of 21 Nov (`research_notes/WEC26_deep_research_2026-11-21.md`) and a full re-read of the
official team pages on wec.iesf.org. IESF has still published no rulebook ("Official documents will be available
soon"), so every rule below is **provisional**: the Head Coach confirms each one in Staff → Rules & decisions when
IESF publishes it.

## Put it live
1. **Database:** nothing to run.
2. **AI function:** redeploy `scrim-ai` (prompt version `scrim-ai-2026-12-03.1`), via GitHub → Actions → Go-live,
   step 2 only. Until then the AI still works. It just gets the RULES block without the instruction on how to use it.
3. **Website:** merge to `main`.

## Rival rosters (Competitors → Rosters & players)
- **Every rival team was re-read on 21 Nov** (all 99 nation pages, structured read). The re-read ships as a dated
  check on each team, as the 13 Nov one did. Nothing is overwritten, and "last checked" now shows 21 Nov everywhere.
- **Changes found since the last check:**
  - **CS2 Mongolia:** Aapestt and AccuracyTG in, hoolig4n and RATE out.
  - **CS2 Australia:** sliimey in, dexter out.
  - **CS2 Women Kyrgyzstan:** rumethis in, amy out.
  - **PUBG Mobile Morocco:** lazyboy now a player, md now the coach; MARSHALL is captain.
  - These show under "Rival rosters changed in the last 14 days" on Today.
- **Corrections that are not changes:**
  - France CS2 Women "Si" was a 3 Nov misread of **SiA** (fixed, flagged on the player).
  - Iraq CS2's coach (TAHA AL DULAIMI) was not caught on 3 Nov and is now filled in.
- **eFootball is in the roster screen**: the 96 rival players, one per nation, first read on 21 Nov (for example
  Thailand Jeans, Brazil HenrykinhO, Japan Oshushi, Malaysia HARIZ, Iran Yousef, Spain Javilota).
- The MLBB changes of Türkiye, Myanmar and Cambodia were already caught on 13 Nov; 21 Nov confirms the same rosters.
- Teams a staff member edited keep their saved record (as before). The 21 Nov check shows on the seeded record only,
  so record a weekly check on an edited team to bring it up to date.
- Tool: `tools/site_check_2026-11-21.mjs` with the raw read in `tools/raw_rosters_2026-11-21.txt`.

## Rule profiles (Staff → Rules & decisions)
| Rule | Version shipped | Status |
|---|---|---|
| Dota 2 · Game patch | **7.42 (live 18 Nov 2026)** | provisional |
| Dota 2 · Event format | 2 groups of 6, Bo1 round robin (top 4) · playoffs Bo3 · 16–20 Dec | provisional |
| CS2 · Event format (Open and Women) | 2 groups of 6, Bo1 round robin (top 4) · playoffs Bo3 | provisional |
| CS2 · Map pool | Active Duty: Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke | provisional |
| MLBB · Event format | GSL groups of 4, Bo3 · playoffs Bo3 · final Bo5 · 5 bans per team | provisional |
| MLBB Women · Event format | 4 teams, double elimination | provisional |
| PUBG Mobile · Event format | 18 matches over 3 days · Erangel, Miramar, Rondo · tie-break chicken dinners | provisional |
| eFootball · Event format | 1v1 · 16 groups (home and away) · knockout Bo3 · final Bo5 | **unverified** (platform not confirmed) |

- **How they reach the live site:** the live hub keeps its rules in the database, so new defaults would never
  appear. Now, on load:
  - A missing profile is added.
  - A profile the staff never changed that still has the old default (Dota "7.41") moves to the new one, with a history
    line "Hub V1.38 (default update)".
  - A profile the staff changed is never touched.
- **Effect of the Dota patch change:** objectives proposed under 7.41 are flagged "rules changed, re-check", as with
  any rule change. That is intended: 7.42 changes a lot.

## The AI works from these facts
- Preparation packs, pre-match briefs and Brainstorm now receive a **RULES** block for the title (format, patch, map
  pool), each with an id the AI can cite.
- The AI is told that "provisional" means not confirmed by IESF. It should use the rules as context (a Bo1 group stage,
  a new patch) and never as facts about the opponent.
- Numbers in the rules (Bo1, 7.42, 18 matches) can now appear in AI lines without being removed by the number check.

## Reported Dota schedule (Tournament → Match-day runbook, Dota 2)
- New panel **"Reported schedule — not official"**: Indonesia's five Group A Bo1s as reported by cybersport.ru
  (single source):
  - **16 Dec: Mongolia, then Kazakhstan**
  - 17 Dec: North Macedonia, Venezuela
  - Egypt: probably 18 Dec
- The source line says what is uncertain (no time zone; another site lists a different Day-1 match).
- **"Add to match tracker"** turns a row into a normal match card (stage marked "reported, confirm"). Nothing is added
  without a staff tap.

## Not changed
- The Dota hero pools are still club games since 7.41 (OpenDota, read 3 Nov), and the page still says so. A 7.42
  refresh needs new pro games first; there are only a few days of them.
- No threat score was added. Tiers stay the staff's evidence-based judgement (decision pending with the owner).

## Tests
`tests/v138.test.js` (new). `tests/rosters_oppcard.test.js` and `tests/competitor_form.test.js` were updated for the
third roster check. 318 tests: 283 pass, 35 skipped (database tests without a local Postgres, as before), 0 fail.
