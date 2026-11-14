# Hub V1.24 — Help for coaches and analysts (14 Nov 2026)

Four helpers built from the hub's own records (confirmed games, scrim reports, weakness labels, partner bank,
sessions) plus a feasibility check for benchmarks. No new AI call, no database change: they work on the
current live database and do not need the AI function redeployed. Nothing is predicted; every line says what it is
compared with, and small samples are left out rather than guessed. All new text is in Bahasa Indonesia.

| # | Where | What it does |
|---|---|---|
| 5 | **Patterns → Game breakdowns** (MLBB, MLBB Women, Dota 2) | A first draft per confirmed game: the draft (our picks and bans, theirs), the time against our usual, and each player against **their own** usual level (median of at least 3 earlier confirmed games; 30%+ away = stand-out, marked better or worse). The analyst edits it and adds it to the scrim report as a follow-up note (the report itself never changes). |
| 6 | **Weaknesses → VOD review — our games** (every title) | Analysts add a video of our own scrim or match and mark moments: time, player (or Team), a label from the Weaknesses list, one line. The same label for the same player marked 3+ times in 2+ games within 28 days becomes a **recurring theme**, with links that open the video at each moment, and one tap turns it into a coaching proposal for the title coach. Stored in the VOD library as our own VODs; the rival VOD pages do not show them. |
| 7 | **Scrims & practice → Sparring partner plan** (every title) | Per partner: sessions, record, plan followed, last session, which weakness labels showed up against them. Up to five suggestions, each with its reason: re-test a recurring weakness against the partner where it showed up; book a stand-in for every rival the staff rate main threat or contender (none in 14 days), or add one to the bank; book Tier 1 when fewer than 30% of 14-day sessions were Tier 1; Tier 1 contacts not played for 21+ days. Partners seen in reports but missing from the bank are listed. |
| 8 | **Today → End of day** | For the titles the person follows, only today's records: reports, result, plan followed, sessions not logged, "Did we fix it?" answers, what failed; up to three priorities for tomorrow (log the missing result, an adjustment still not fixed, a label flagged as recurring, the adjustment to start from). **Copy for the staff group** gives a WhatsApp-ready message in the page language. |

## 9. Benchmarks against international level: feasibility
- **Dota 2: feasible.** OpenDota's public API has full professional match data (GPM, XPM, last hits, KDA, hero damage
  per position and patch); the hub already reads OpenDota for rival pools. A per-position band from recent pro
  matches on the current patch, next to our confirmed scrim numbers, can be built as a shipped dataset refreshed by
  an analyst (like the rival pools). Caveat: scrim and tournament games are not like for like.
- **MLBB / MLBB Women: not reliable yet.** No public per-player statistics API; MPL/MSC stats sites publish KDA and
  some gold figures per tournament, without a stable feed or licence. Possible as a manual table per tournament if an
  analyst copies it with the source.
- **PUBG Mobile: partial.** Tournament standings and team kill/placement points are public (PMGC/PMWC pages); per-player
  numbers are not consistently published. Team-level bands (points per match, kills per match) are feasible.
- **eFootball, CS2:** out of scope here (eFootball has no team stats; CS2 has rich public data via HLTV but is not one
  of the focus titles).
- Recommendation: build Dota 2 bands first, then PUBG Mobile team bands; keep MLBB as a manual, sourced table.

Tests: `tests/analyst.test.js` (breakdowns, VOD themes, partner plan, end of day, page). Not deployed.
