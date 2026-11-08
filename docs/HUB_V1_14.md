# Timnas Performance Hub V1.14 — Draft Room and new look

Status: branch `feature/ai-scrim-capture` (V1.13 + V1.14), **not pushed, not deployed**. Live site: V1.12.
A separate fix for the live site, `fix/remove-draft-lab` (V1.12.1), removes the links to personal tools; see
`docs/HUB_V1_12_1.md`. It is merged into this branch too.

Decision (Aufa, 8 Nov 2026): the hub does not use, link to or copy from personal projects (Draft Lab, the MLBB
simulator, personal artifacts). Similar tools are built inside the hub, modelled on how they were used.

## Draft Room (MLBB, MLBB Women → *Draft Room* tab)

| Part | What it does |
|---|---|
| Mock draft | Timed draft in tournament order (10 bans: 3 each, picks 1-2-2-1, 2 bans each, picks 1-2-1; blue opens; 30 s a step by default). Board for both sides, clock that turns amber at 5 s and red when over, Enter to lock in, undo, "no ban (time ran out)". Quick picks: our players' main / can-play heroes on our turn, pro priority heroes on theirs. A running draft survives a page refresh on that device. Saved with result, note and the time each step took |
| Draft books | Per opponent (the WEC field, or any partner): ban list, protect list, flex picks, plans for each side, notes. Every save is a new version (earlier versions kept). Approved by the focus owner, Fayad or the title coach, never by the writer of that version. Shown on the opponent card |
| Hero pools | Per player, the coach's rating of each hero: main / can play / learning. Suggestions from confirmed scrim games (games and wins per hero); nothing is rated automatically |
| Draft patterns | **Ours**: heroes banned against us, our first picks, our heroes with games and wins, mock-draft timing — from national-team scrims only, "under 5 games" labels. **Public pro games**, in a separate dashed panel marked "not our team": pick-or-ban share per hero, win rate when picked (from 5 picks), blue-side win rate, and *pro priority heroes nobody on our squad rates main or can play* (a question for the coach: ban them, or learn one) |
| Drills | A draft situation (draft so far in order, our side), a question, the answers the coach accepts and a time limit. Players answer against the clock; the hub records hero, seconds, in time, accepted; summary per player |
| Pro games | CSV import (`date,event,blue,red,winner,blue_bans,red_bans,blue_picks,red_picks,source`, heroes split by `|`). Every hero checked against the list; rows with errors are listed and left out; the source link is kept (Liquipedia data is CC BY-SA 3.0) |

Database: `supabase/migrations/20261112120000_draft_room.sql` adds `draft_pools`, `draft_books`, `mock_drafts`,
`draft_drills`, `pro_games` — title-scoped like the rest (read by title, write on assigned titles, delete by
admin, audited, demo data refused), and limited to MLBB and MLBB Women.

**Public pro data is not preloaded.** The pages that hold MPL draft data (Liquipedia, and sites built on it)
could not be read reliably from Claude's workspace: one is blocked, and the others come back without
team, side or pick/ban labels. Rather than load numbers that might be wrong, the hub starts with our own
data only, and an analyst imports pro games as CSV.

## New look

PB ESI red and white on near-black, with an esports broadcast feel: angled tabs and buttons, a red accent bar
on headings, a red header rule, the Draft Room board in blue/red side colours. Display type Chakra Petch,
body Plus Jakarta Sans. Light mode follows the device. Colours are set as tokens at the top of
`src/hub/index.html`; send the official PB ESI hex codes and they replace the approximations in one place.

## Tests

`npm test` (with database): **164 pass** (new: 8 Draft Room rules, 3 Draft Room screens, 2 database access).
All 58 screens opened with every safe button pressed: no errors. Desktop 1280 px and phone 412 px: no
sideways scrolling, no console errors.

## Coach Donny's readiness system (8 Nov 2026)

Performance → Athlete readiness now opens on Coach Donny's own system (his GitHub Pages app, framed, with *Open
in a new tab*), shown to people with wellbeing access only. The *Hub view* tab keeps the hub's board; it switches
from dummy data to his data when his system gets a read API (`src/readiness/donnyProvider.js`, ready and tested).
Checked by serving his built app in place of GitHub Pages: it loads inside the hub with no errors. Details:
`docs/READINESS_INTEGRATION.md`. Brand red tuned to the PB ESI logo in his repository (#E41824; gold #FFC940).
`npm test`: **169 pass**.

