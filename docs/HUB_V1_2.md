# Timnas Performance Hub V1.2 — built around the staff

Prepared 3 Nov 2026. Builds on V1.1 (see HUB_V1_1.md). Not published: delivered as files until you approve publishing.

## Staff roles (confirmed by Aufa, 3 Nov)

| Person | Role | Focus in the hub |
|---|---|---|
| **Fayad** | Head Coach | Oversees every title. Reviews PUBG Mobile, eFootball and MLBB Women; also catches any title without a named focus owner (CS2, CS2 Women) |
| **Aufa Bassam** | Assistant Coach 2 | Reviews Dota 2 and MLBB (men) |
| **Donny Ardy Kusuma** | Assistant Coach 1, sport scientist | Physical and mental preparation across all titles: wellbeing check-ins, training load, flags |

Title coaches (from the WEC roster): Dota 2 Gregorius Arvindra Prasetyo · MLBB Coach Indra · MLBB Women Coach Ilyas · PUBG Mobile Christie Onibala · eFootball not named · CS2 / CS2 Women see roster.

## Why these changes, in medal terms

A Juara Umum push is won across seven titles, not in one tool. The biggest risks the hub can reduce are: titles drifting without a practice plan, problems found but never practised, and players arriving at 15 December tired or stressed. V1.2 targets those three.

1. **Every title has an owner and a queue.** Proposals route automatically: Dota 2 and MLBB to Aufa, PUBG Mobile / eFootball / MLBB Women to Fayad, wellbeing to Donny. "I am" at the top of the page switches to that person's queue: what to review, what to practise and log, which decisions are due. The Head Coach can review anything.
2. **Juara Umum board.** One table for all seven titles: focus owner, title coach, what evidence exists, accepted and waiting objectives, sessions in the last 7 days, wellbeing check-ins today, and blockers (unpublished rules, missing roster, unnamed coach). It also lists titles where the cycle is not running. The BOD plan's v3 gold estimates are shown separately and labelled as staff planning assumptions, not hub output. The board does not compute a medal table because the overall-title scoring rule is not published.
3. **All titles can use the coaching cycle.** MLBB, MLBB Women, eFootball and CS2 have no analysis engine here. Staff observations (from Draft Lab, VOD or scrims) now enter the same cycle, but must name a source, the number of games and the roster context, and carry a measurable success criterion. Draft Lab stays the MLBB engine.
4. **Wellbeing module for Donny.** Daily check-in (sleep hours plus sleep quality, freshness, body soreness, stress, mood on 1–5) and session load (minutes × session RPE). Flags compare each player with his or her own history only: wellness 1 SD below the 28-day average (after 7 check-ins), under 6 h sleep two days running, 7-day load above 1.5× the previous 3-week average (labelled a rule of thumb, not an injury predictor). No scores, rankings or diagnoses. Thresholds are Donny's to change. Donny and Fayad see a wellbeing summary on their Today page.

## Privacy and confidentiality
- Wellbeing records are health and mental-wellbeing data. When published, the page declares database rules so only editors can read or write them (`dist/capabilities.json`). Viewers without edit access see "Editors only".
- **Needs a decision before use:** players' informed consent for recording wellbeing data, and who may see it (Donny only, or Donny + Head Coach). Owner: PB ESI / Head Coach. The hub shows this as pending on every wellbeing screen.
- No compensation, SK or other onboarding data is in the hub.

## Validation (40 automated tests, all pass)
New in V1.2:
- Routing follows the roles above; CS2 falls to the Head Coach by oversight and says so.
- A staff observation without source, games or a valid context is refused; a valid one lands in the right person's queue (MLBB → Aufa, MLBB Women → Fayad) and nowhere else.
- Wellbeing: invalid check-ins refused; "baseline building" until 7 check-ins; a normal day raises no flag; low wellness, short sleep and a load jump each raise the right flag; no score fields exist.
- The board lists all seven titles and states that Juara Umum scoring is unpublished.
- Wellbeing saves for editors; when the store refuses access, the page shows "Editors only" and the Today summary says so.

**Not run:** any check on the published page in the Claude desktop app (nothing was published), and the database access rules themselves (they take effect only when the page is published with `capabilities.json`).

## Pilot per person (event-relative, P-day = first full day of pelatnas)

| Who | Daily | After each scrim block | Weekly |
|---|---|---|---|
| **Aufa** | Check queue: review Dota 2 / MLBB proposals | Import Dota scrim matches; log session results; decide next step | Dota series review (national matches only); MLBB observations from Draft Lab into the cycle |
| **Fayad** | Check queue; wellbeing summary | Log PUBGM scrims (or analyst, TBD); review PUBGM / eFootball / MLBB W proposals | Juara Umum board with all staff: where is the cycle not running, what is blocked |
| **Donny** | Check-ins before the first session; talk to flagged players | Session RPE 30 min after each session | Load and wellbeing trends per title; adjust thresholds; feed recovery objectives into the cycle |

Evidence the workflow is worth keeping (judged by the staff after two weeks): share of proposals accepted or modified, sessions with a measured result, check-in completion rate, staff minutes per day, and each owner's 1–5 usefulness rating.

## Backlog (updated)
**Before the staff pilot**
1. Approve publishing V1.2 (it keeps the V1 link and stored data; wellbeing rules apply on publish).
2. Decide wellbeing consent and visibility (above).
3. Enter the MLBB Women, CS2 and CS2 Women rosters (Wellbeing → Daily check → Roster).
4. Run one full cycle per owner on the published page in the desktop app.

**After pilot feedback**
5. Shorter check-in (3 items) if completion is low.
6. Wellbeing objectives proposed automatically from repeated flags (Donny reviews).
7. Match-day routines per title (Donny + title coach) in the cycle.
8. Hero matchup data for Dota; scouting of the remaining finalists.

**Later**
9. Player self check-in on their phones (needs consent, accounts and access rules).
10. MLBB draft-test results from the workbook imported as observations.

## Decisions needing you
1. Publish V1.2?
2. Wellbeing consent and who may see the data.
3. Who logs PUBG Mobile scrims and session RPE day to day (analyst roles still TBD).
4. Whether CS2 and CS2 Women get a focus owner, or stay with the Head Coach.
