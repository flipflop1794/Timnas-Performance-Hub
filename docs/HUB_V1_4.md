# Timnas Performance Hub V1.4 — tournament week, scouting library, player plans, weekly brief

Prepared 3 Nov 2026. Builds on V1.3 (HUB_V1_3.md). Not published: files only.

## What was added (the six suggested features)
| Feature | Where | What it does | Owner (proposed) |
|---|---|---|---|
| Match-day runbook + WEC match tracker | Tournament → Match-day runbook | One editable runbook per title (D-1 to start: sleep, meal, arrival, opponent brief, draft/drop plan, warm-ups, rule check). Each WEC match gets a card; items are ticked with the name of whoever did them; result recorded. Dates are limited to 15–20 Dec. | Fayad + Donny agree the runbook; title coaches tick |
| Between-games sheet | Tournament → Between games | Per game: side or map, outcome, what worked, what failed, **one required adjustment** for the next game, and an optional one-line call per player. Afterwards staff mark whether the adjustment was actually used in the next game. Shows the "coaching-contact rules: blocked" banner until Fayad confirms the IESF rule. | Aufa (Dota, MLBB), title coaches |
| Rival VOD library | Each title → Competitors | Links (not video) per rival nation, tagged (draft, rotation, map veto…). A reviewed VOD can become a competitor note with the link as its source. Nations outside the published field are refused. | Title coaches / analysts (TBD) |
| Sparring partner bank | Each title → Scrims & practice | Partner, level, region, which WEC rival they play like and why, availability, which staff member holds the contact. Scrim counts come from logged scrims. Partners appear as suggestions in the scrim planner. Phone numbers are refused. | Title coaches |
| Individual player plans | Players → Player plans | Goals per player in three areas (game, physical, mental), each with a measure, owner, due date and status history. A per-title overview shows open, at-risk and done goals. The page warns not to write health details here. | Title coaches (game), Donny (physical, mental) |
| Weekly brief | Today → Weekly brief | One page generated from the hub: per-title objectives, sessions, scrims, rivals covered and check-in **rate**; gaps; main threats; player goals at risk; unconfirmed rules; pending decisions. Copy or download as Markdown. No individual wellbeing values, no compensation, no win probabilities; nothing is sent. | Fayad |

Navigation: new **Tournament** section; "Wellbeing" is now **Players** (player plans + wellbeing check + log).

## What the hub does not do (on purpose)
- No WEC schedule is invented: the bracket, times and format are not published; matches are entered when IESF announces them.
- The runbook is a starting template, marked "not yet agreed" until the staff edit it.
- The brief lists pending decisions (Juara Umum scoring, coaching-contact rules, pelatnas dates, SK, compensation — no figures, wellbeing access, PUBGM logger, CS2 owner). Edit the list in `PENDING` (app.js) as they are settled.

## New shared-store collections
`wec_matches`, `config/runbooks`, `vods`, `partners`, `player_plans` (default access: signed-in viewers read, contributors write). Wellbeing collections stay editors-only.

## Validation — 49 automated tests, all pass
New (tests/v14.test.js): runbook labels and template; match date limited to WEC; tick/untick with name; result values; between-games requires an adjustment and keeps per-player calls; VOD field and link checks; partner contact-owner and field checks; partner scrim counts; goal measure required; brief counts, gaps, at-risk goals and **no individual check-in values**; and a full page flow through the shared store (runbook edit, refused out-of-event date, match, tick, game note, VOD → review → competitor note, phone number refused, partner in planner suggestions, player goal and status, brief download). Layout checked at 1280 px and 390 px: no horizontal overflow, no script errors.
Not run: anything on the published page (not republished since V1).
