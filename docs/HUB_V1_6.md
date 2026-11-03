# Timnas Performance Hub V1.6 — rival rosters & players, pre-match opponent card

Prepared 3 Nov 2026. Builds on V1.5. Not published: files only.

## Rival rosters & players (Competitors → Rosters & players)
- **58 rival teams pre-loaded** across six titles (Dota 2 11, MLBB 7, MLBB Women 3, PUBG Mobile 15, CS2 11, CS2 Women 11). Each has its players, captain and coach, read from each nation's wec.iesf.org team page on 3 Nov. eFootball is not included.
- **Spellings to check on the site (⚠ in the hub):**
  - Cambodia "PPPPPP" was read as six P's; decision log v6 recorded five.
  - Dominican Republic: three tags run together with real names.
  - Poland "Hanka-".
  - Egypt, Colombia and Poland names had the word "Player" or "Coach" stuck to them by the page reader; it was removed.
- **Dota 2 accounts and hero pools.**
  - 15 of 55 rival players are now matched to OpenDota.
    - Mongolia: 4 matched, from before.
    - 9 new, matched by exact name and country: Focus, Skylark, Shy, Hermit, Shakh, A9, Miyaoo, Stojkov, Fury.
    - 2 probable (name match, same club as a matched teammate): SsaSpartan- and young G.
  - Pools cover club tournament games since 7.41, pulled 3 Nov. A9 has no tournament game since 7.41.
  - Not found yet: all of Egypt and South Africa, and most of Venezuela, Argentina, Kazakhstan, Iran, North Macedonia and New Zealand.
- **What staff can add:** role, club, game account and a note for each player. Phone or ID numbers are refused.
- **Weekly check:** enter the names as listed on the site today. The hub records who checked, flags added and removed players ("roster changed"), and marks a check as due after 7 days. Roster and check status also show on the nation profile.

## Pre-match opponent card (Competitors → Opponent card)
- **One card per opponent per title.** It opens from the match card in the WEC match tracker, from the nation profile, or from the tab itself. The runbook's T-2h "opponent brief" now points to it.
- **Filled by the hub:**
  - staff threat tier and reason;
  - observed notes, plus unconfirmed (hypothesis) notes labelled as such;
  - reviewed VOD takeaways;
  - their roster with role, club and, for Dota, each player's most-played heroes;
  - Dota ban candidates by presence (each player's most-played hero, only with 15+ games; probable accounts are labelled);
  - stand-in scrims;
  - a list of gaps before the card is match-ready.
- **Written by the title coach:**
  - 1–3 key points (at least one required);
  - what they are likely to do;
  - our answer (required);
  - one focus per Indonesian player.
- **Draft until approved** by the focus owner or title coach; saving an edit returns the card to draft.
- **Print** (forms and navigation are hidden in print) or **download as .md**. The card is labelled internal.

## Validation — 58 automated tests, all pass
- **Every published rival team is present.** Flags for doubtful names are kept, and Mongolia's accounts are carried over.
- **Weekly check and edits:**
  - a check flags added and removed players, and the check becomes due after 7 days;
  - phone numbers are refused in player notes.
- **Pools:** shipped and Mongolia pools load, and "no data" is shown where there is none.
- **Opponent card:**
  - ban candidates come out by presence, with probable accounts labelled;
  - the plan rules hold (at least one key point, our answer required);
  - approval works, and the markdown export is correct.
- **Full page flow:** check → roster changed; role edit; card write → approve → download; nation profile → card.
- Desktop and phone layouts were checked with no overflow.
