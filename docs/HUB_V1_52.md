# Hub V1.52 — AI inside the scrim report: paste a recap, a note after saving, before today's session (24 Nov 2026)

Owner's request (24 Nov): more help from AI for coaches and analysts, for all 7 categories.

**What the usage showed (about 73 AI calls so far):**
- Coaches use the AI when it saves typing: screenshot reading and the WhatsApp paste of the support staff.
- They skip it when it is an extra button: debrief, plan, weekly and prep pack together had about 8 uses.
- Dota 2 and PUBG Mobile had filed no scrim report.

So this version adds **no new tab and no new button to find**. The AI sits in three steps coaches already take.

## 1. Paste your WhatsApp recap: the AI fills the report (all 7 categories)
- **Where:** the first thing on every scrim report form. It replaces "Say it once" and takes the same box.
- **How:** paste the recap you send to the group (or dictate it), then press "Fill the report".
- **What it fills:** the sparring partner, the date when the recap names it, the result lines, and the coach's own
  words into focus, what worked, what failed, the change for next time, player notes and game detail.
- **Result lines per category:**

| Category | One line per | Filled from the recap |
|---|---|---|
| CS2, CS2 Women | map | map, rounds won and lost, CT rounds |
| PUBG Mobile | match | map, placement, eliminations |
| eFootball | match | goals for and against, extra time or penalties |
| Dota 2 | game | win or loss, side (radiant / dire) |
| MLBB, MLBB Women | game | text fields and partner only; the games still come from the Scrim Log screenshots |

- **Checks in the hub:**
  - A score, placement or kill count that is **not written in the recap** is never filled in. The line is left out
    and the coach is told how many were left out.
  - A partner name that is not in the recap is not filled.
  - A date in the future is not filled.
  - Sentences about health or personal matters are left out, as before.
- Nothing is saved until the coach presses Save.

## 2. The note after saving (all 7 categories)
- When a report is saved, the saved report shows **"For the next session"**:
  - **Repeats:** a problem that also appears in earlier reports, with the dates of those reports
  - **Focus:** one thing to practise next, from what the coach wrote
  - **Ask the players:** one open question
- The coach taps **Use as next focus** or **Ignore**.
  - An ignored note disappears.
  - A used focus becomes the first quick pick for "What was this session meant to practise?" in the next report, and
    appears in "Before today's session".
- **Analysts** see the same lines, with the reports behind "Repeats", so they can check the evidence.
- **Checks in the hub:**
  - A line with a number that is not in the reports is dropped.
  - "Repeats" needs an earlier report to rest on.
  - No focus means no note.
- **Cost:** this is the same single AI call that already ran after a save to label weaknesses. The labels and the
  note now come back together. One extra call happens only for a report with a change written but nothing under
  "What failed" (those got no call before).

## 3. Before today's session (no AI)
- A card with up to five lines from records already in the hub:
  - today's planned session
  - the change from the last session
  - the focus the coach chose
  - the weakness that came back 3 or more times in 14 days
  - the question for the players
- **"Copy for WhatsApp"** copies it in the coach's language.
- **Where:**
  - on each title's Scrim reports page, in the place of "Start the next session from here"
  - on My day, for a coach or analyst with one or two titles
- A focus chosen more than a week ago is not shown.

## Tidy-ups after looking at it in a browser (24 Nov)
- The note after saving also appears **right above the form**, and the page moves to it when it arrives (unless the
  coach is already typing again). It was only at the bottom of the page, inside the saved report.
- A focus that is the same sentence as the coach's own change is **shown once** (in the note and on the card).
- Messages in plain words: "Filled 4 boxes and 2 result lines", "1 result line was left out"; no internal label.
- The card's button is **"Copy this brief"** ("Copy for WhatsApp" already copies the saved report on the same page).
- The text under the paste box is one line.
- Built on top of V1.51 (Whoop); the header reads V1.52.

## Put it live (3 steps, in this order)
1. **Database:** run `supabase/RUN_ON_LIVE_V1_52.sql`. It adds the two new call types to the AI usage log. No table
   is added and no data changes.
2. **AI function:** deploy `scrim-ai` (new actions `recap` and `after`).
3. **Website:** merge to `main`.

Until step 2 is done the website behaves as before ("Say it once", labels only): the hub asks the function which
actions it has.

## Not in this version
- MLBB and MLBB Women games are still entered from screenshots. The recap fills the rest of the report.
- No chat assistant and no draft predictions.

## Files
- **Logic:** `src/core/recap.js` (new)
- **AI rules:** `supabase/functions/_shared/scrim_spec.js`, `scrim_ai_handler.js`
- **Page:** `src/hub/capture_ui.js`, `src/hub/coach_ai_ui.js`, `src/hub/app.js`
- **Feature check:** `src/web/main.ts`
- **Translations and guide:** `src/hub/i18n.js`, `src/hub/guide.js`
- **Tests:** `tests/v152.test.js`, `tests/web/recap_web.test.js` (new)
