# Hub V1.25 — WEC scouting, Phase 1: live log and briefs, no AI (14 Nov 2026)

Phase 1 of the plan "AI support for coaches & analysts" (Focus 3 foundation). No AI call, no database change:
live entries and approved briefs are kept with the scouting notes (kinds `live` and `brief`), so they never count
as scouting notes, coverage or "Scout next". Not deployed.

## New: Tournament → Live scouting (mobile first)
| Part | What it does |
|---|---|
| **Log** | Pick title, opponent, optionally the WEC match, and type which match you are watching. One tap for what you saw (pick, ban, strategy, player, tendency, note), then a hero / map / item (MOBA hero list offered), player (opponent roster offered), phase, time and one line. Save. Phone numbers are refused; performance only. |
| **Weak internet** | On the website each entry is saved on the phone first (this browser), shown as "N waiting to sync" / "not synced yet", and sent when the connection allows: right away, on **Sync now**, when the phone comes back online, and when the hub reconnects. The id is made on the phone, so a retry never creates a duplicate. Works with no connection **once the page is open**; reopening the hub with no connection is Phase 3 (B). |
| **Opponent brief** | Per nation: **Known** (staff tier, current roster and coach, observed notes, public results, reviewed VODs, our results against stand-ins with small samples labelled, approved draft book), **To confirm (TBD)** (opponent-card gaps, "to confirm" results, no live observation yet), **Watch for** (roster changed in 14 days, hypotheses, Dota ban candidates, picks / bans / tendencies logged 2+ times). Every line names its source. |
| **Pre-match brief** | One page for our next opponent: likely picks / bans and tendencies with how often they were seen (and whether today), threats (players logged), and **3 key points** that start as suggestions from the records. The coach edits and **approves**; only then **Copy for the players** is enabled (page language). Re-approving replaces the previous version for that match. |

All text is in Bahasa Indonesia by default.

## Tests
- `tests/scouting.test.js`: entry validation (WIB day, phone numbers, lengths), counts, brief sources / TBD /
  watch-for (repeats need 2+), small samples labelled, approval rules, share text, no effect on coverage, page flow.
- `tests/web/scouting_web.test.js`: website with writes failing → kept on the phone, shown as waiting; connection
  back → synced once; a second sync sends nothing. (The test database fake gained a `failWrite` switch.)

## Check by hand (staff)
1. On a phone, open Tournament → Live scouting, log 5 entries while watching a stream; check typing speed.
2. Turn on airplane mode with the page open, log 2 entries, see "2 waiting to sync"; turn it off, see "All synced".
3. Open the opponent brief for Myanmar (MLBB): roster change and sources look right.
4. Approve a pre-match brief and paste it in a test WhatsApp group: wording and length.

## Still TBD
- Who scouts at the venue, on which devices, and access to other matches (head coaches).
- How briefs reach players and who approves at the event (head coaches).
- Venue internet (you). Reopening offline is Phase 3 (B), tested on staff phones before the 6 Dec freeze.
- AI versions of the briefs and the end-of-day summary are Phase 3.
