# Hub V1.33 — real version in the header, leaner Dota 2 (18 Nov 2026)

Website only; no database or AI change.

## Version in the header
The header said "IESF WEC 2026 · V1.20" since V1.20: the label was typed into the page by hand. The build now takes
it from `package.json` (1.33.0 → "V1.33"), so it changes with every release.

## Dota 2, leaner
- **Team:** the national five's club hero pools and **Proposals for the title coach**. The source box, the
  findings list and the rule-based review fold into "How to read this" and "More detail" (were three extra panels).
- **Competitors:** player-pool scouting of the chosen opponent and **Countermeasures to consider** first. Findings
  and the rule-based review fold into "More detail"; notes, tiers and VODs fold into "Notes, tiers and VODs" (they
  are also under Competitors → Notes per title).
- (Superseded by the second pass below.) Tabs on the website after the first pass: Team · Scrims & practice · Scrim reports · Analysis · Competitors · Meta ·
  Brainstorm. Post-match, Draft room and Series review stay hidden until "Show all tools".

## Dota 2, less noise (second pass, approved 18 Nov 2026)
- **Tabs (website):** Team · Scrims & practice · Scrim reports · Analysis · Meta. The Dota Competitors tab leaves the
  bar; **Brainstorm** opens from Analysis ("Ask the AI") for every title instead of its own tab.
- **One line instead of the green notice:** "Club data (OpenDota, patch 7.41), not national-team performance";
  the full text opens from that line. The provisional-rules box stays where a rule affects the page.
- **Team page = our five's hero pools.** The data-driven proposals, findings and rule-based review moved to
  **Staff → Coaching cycle** ("Suggestions from the Dota 2 club data"), where proposals are reviewed.
- **Opponent scouting in one place:** Competitors → Notes per title → Dota 2 shows the opponent's player pools and
  ban candidates (OpenDota), our notes, tiers and VODs, and a button to the opponent card.
- Old links (#dota-scout, #…-brain) still open their pages.
