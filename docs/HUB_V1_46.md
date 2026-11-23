# Hub V1.46 — Phase 1 of the coach upgrade: short coach menu, opponent page, MLBB draft plan (23 Nov 2026)

Phase 1 of the upgrade the owner approved on 23 Nov, with **MLBB Men as the pilot**. The owner's main concern was
too many tabs for coaches, so this version adds **no new tab** and gives the pilot coach a short menu.

> Shipped together with V1.47, which turns this short menu into the five-tab category workspace (`docs/HUB_V1_47.md`).

## Short coach menu (pilot: MLBB Men's title coach)
- **Who:** a title coach assigned to MLBB only. Head Coach, assistants, Coach Donny, admins, leadership and the
  other title coaches keep the full menu for now.
- **What they see:** 3 sections and 6 tabs instead of 8 sections and 27 tabs.
  - **Today:** My day
  - **MLBB:** Scrim reports · Analysis · Team
  - **Opponents:** Opponent page · Match day
- **"More"** (top bar) brings the full menu back; **"Short menu"** returns. The choice is kept on the device.
- Any other page still opens by link, and then shows its usual tabs.
- The coach's Opponent page and Match day start on their own title.
- To add a category later: one line, `COACH_MENU_PILOT` in `src/hub/app.js`.

## Screens taken off the website's menus
Never used on the live site. The pages and their data stay, and old links still open them.
- "Is it working?" (Staff)
- Strategy sim (PUBG Mobile)
- "Ask the AI (Brainstorm)" link on the Analysis pages
- Juara Umum board: off for coaches. **Leadership, the Head Coach and admins keep it.**

## Opponent page (the existing Opponent card)
- **What stands behind the page**, under the title: counts of staff notes, public results, reviewed VODs and stand-in
  scrims; for MLBB also rival drafts.
- **"Little public data"** label when there is little to go on:
  - fewer than 2 notes and reviewed VODs, and
  - for MLBB, fewer than 5 rival drafts on record; for other titles, fewer than 2 public results.
- **Malaysia (MLBB):** roles and clubs from the 21 Nov research are filled in for Unii, Kyym, NovaXcobar and Sepat,
  each flagged "confirm" (Season 17 data).

## Draft plan (MLBB and MLBB Women; each uses its own data)
A section on the Opponent page, built from two sources that are never mixed:
- **Their drafts on record:** public games in the Draft Room where a team name is the nation ("Malaysia",
  "Team Malaysia", "Turkey" for Türkiye). Club games do not count as the national team.
- **Our confirmed scrim games:** bans against us, the heroes we play, results by first or second pick.

Lines, each with its count and a "low sample" mark under 5 games:
- **Ban candidate:** a hero they picked at least twice. If we play it too, the line says "ban it or take it first".
- **Expect a ban:** a hero they banned at least twice that we play.
- **Partners ban it against us:** from our scrim drafts.
- **Our scrims by pick order:** first pick and second pick records.

With no rival drafts on record, the section says so and shows our side only. Nothing is predicted or scored.

## Brief to WhatsApp with tick boxes
- On the Opponent page, once a plan is written: **"Send to players"** lists the key points, what they are likely to
  do, our answer, the per-player focus and (MLBB) the draft plan, each with a tick box.
- **"Copy for WhatsApp"** copies only the ticked lines, in the coach's language (Bahasa by default).
- The draft plan is unticked by default.
- A card that is not approved yet is marked **DRAF** in the message.

## "What repeats" (Scrim reports page of every title)
- Shown **only** when a weakness label came back in 2 or more reports in the last 14 days; otherwise nothing is added.
- Each line opens to the reports behind it (date, partner, what failed).
- From 3 reports, a button turns it into a training focus (the existing coaching proposal).

## Not in this version
- Rival drafts still have to be entered (Draft Room → Public games) or come from live scouting at the event. No
  public feed exists for MLBB.
- The other six categories keep the full menu until the pilot coach has used the short one.

## Tests
- `tests/v146.test.js` and `tests/web/coach_menu_web.test.js` (new).
- Run on the combined code in Jakarta and UTC time before merging.

## Put it live
Merge to `main`. No database or AI change.
