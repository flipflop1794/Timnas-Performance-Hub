# Timnas Performance Hub — V1.1 assessment, framework and pilot plan

Prepared 3 Nov 2026 (Asst. Head Coach workstream). Source reviewed: the 3 Nov progress report, the Hub V1 source and tests in this package, the published V1 page's code, the project decision log (v8) and the Draft Lab progress report. Labels used: **Reported** (stated in the report), **Verified** (checked in code or by a test here), **Assumption**, **Recommendation**.

Not changed: the published V1 hub page (you asked for nothing to be published; V1.1 is delivered as files), Draft Lab, and any official commitment.

---

## 1. Product assessment

**Bottom line.** V1's engines are sound and well tested on real Dota data, but V1 was not safe to use for training decisions: synthetic PUBG data fed "Today" and the measurement page by default; "Ready" overstated what club data shows; the three-coach verdict looked like independent agreement; and no record existed of what a coach accepted, practised or decided. V1.1 fixes these and adds the coaching cycle.

### Gap table (V1 as delivered on 3 Nov)

| Reported capability | Verified behaviour in V1 | Evidence | Limitation | Priority |
|---|---|---|---|---|
| "Today" shows three practice objectives per title | Takes the rule-based verdict's top items, then fills with any recommendation not downgraded | `app.js` `topObjectives()` | Objectives looked decided though no coach had seen them; nothing recorded acceptance | **P0** |
| Three-coach verdict with consensus | Three rule sets over the *same* findings; "consensus" = not downgraded by C | `core/coaches.js` `verdict()` | Agreement presented as if independent; disagreement shown only as downgrades | **P0** |
| PUBGM demo clearly labelled | Labelled, but **demo was the default dataset** for Today, recommendations, simulator and before/after measurement | `app.js` `S.pubgm.dataset: 'demo'`; `V.today`, `V['staff-measure']` | Synthetic data entered operational summaries and metrics | **P0** |
| Club vs national distinguished | Banner + `club` tag; tracked-player count shown on matches | `dota/team.js`, `dota/match.js` | No structured context field; series review mixed club matches into "recurring problems" | **P1** |
| "Ready heroes" per player | `Ready` = 6+ club tournament games in 120 days | `dota/proficiency.js` | Label implies national-team readiness the data cannot show | **P1** |
| Match-ID import | Desktop-only browser fetch via `host:claude_browser`; paste fallback | `app.js` `browserFetchJSON()`; publish warning: interface unverified | Never exercised; `get_page_text` may truncate a large match JSON; no file import; errors not specific | **P1** |
| 26 automated tests | 23 engine tests on shipped data + 3 headless page renders without capabilities | `tests/hub.test.js`, `tests/ui.smoke.test.js` | No tests for persistence, the import path, demo isolation or any workflow; "planted pattern" test only proves the detector, not coaching value | **P1** |
| Rules, scoring, approvals, pending decisions | Scoring in a bundled JSON; draft order hard-coded; patch in a note; approvals nowhere; pending decisions only in the project log | `data/pubgm/scoring_profiles.json`, `dota/draft.js` | No versions, no change history, nothing flagged when a rule changes | **P1** |
| Measurement "Is it working?" | Free-text training log, unlinked to recommendations; before/after on demo rows | `V['staff-measure']` | Could not link a result to the objective that produced it | **P0** |

---

## 2. Operating framework

### The cycle
**Evidence → proposed objective → title-coach review → practice session → result → next decision.**
The engines only propose. A title coach (or whoever the Head Coach names, see §7) accepts, modifies or rejects. Only accepted or modified objectives can be practised. Every session ends in a decision: continue, adjust, retire or gather evidence.

### Record structures (implemented in `src/core/`)

| Record | Fields | Rules enforced |
|---|---|---|
| **Evidence** (`records.js evidence()`) | finding title, kind (observed / inferred / hypothesis), confidence, **sample n**, **source, retrieved date, origin (operational / demo), roster context (national / mixed / club / demo), time window, patch, completeness, limitations** | Origin and context required; demo origin must have demo context |
| **Recommendation** (`recommendationRecord()`) | problem, explanation, drill, success criterion, priority, confidence, linked evidence (id, title, kind, n, context, source, date), **uncertainty list**, **sufficient** flag | Must link evidence; refuses any non-operational evidence; inferred < 6 games or any hypothesis → not sufficient to propose |
| **Objective + coach review** (`cycle.js propose()/review()`) | id, title, proposedBy, status, rules snapshot; reviews[]: decision (accepted / modified / rejected), **reviewer, timestamp, reason**, before/after drill and criterion | Reviewer always required; reason required to modify or reject; modify must change drill or criterion |
| **Practice session** (`logSession()`) | owner, date, execution (as-planned / partly / not-run), result (met / partly-met / not-met / not-measured), measured value, context (scrim opponent, patch), notes, copy of the objective as practised | Only after acceptance; a measured value is required unless "not-measured" |
| **Follow-up decision** (`decide()`) | continue / adjust / retire / gather-evidence, who, reason, linked session id | Needs a logged session (except gather-evidence); adjust returns the objective to review |
| **Rules profile** (`rules.js`) | id, label, version, **status (confirmed / provisional / unverified / blocked)**, source, affected views, change history (by, when, reason) | Changes need a name and a reason; objectives proposed under an older version are flagged |

**What the A/B/C reviews are.** Three rule sets reading the same evidence: strategic, execution, and a challenger that looks for small samples, club context and alternative explanations. The page now says plainly that their agreement is not independent confirmation, shows what is disputed and what evidence is missing, and leaves the decision to the title coach. Engines stay separate per game; only the records are shared.

---

## 3. Changes implemented (V1.1, branch `v1.1`)

| | Change | Files |
|---|---|---|
| A | **Live / demo separation.** The hub opens on live (operational) data. Demo is a sandbox switch with a dashed frame and banner. Demo rows are tagged `origin: demo` at load; `assertOperational()` blocks them from recommendations, objectives, Today, measurement and export; CSV import rejects rows marked SYNTHETIC; the shared store only reads operational records. | `core/records.js`, `hub/pipeline.js`, `hub/app.js` |
| B | **Evidence context and honest empty states.** Every finding shows roster context; every evidence view shows source, date, window, patch, completeness and limits. PUBGM shows nothing team-level below 6 logged matches; the simulator, match-day review and before/after comparison have their own minimums. "Ready" renamed "Established (club)", with the note that it describes club experience, not readiness. Series review counts national-team matches only. | `dota/*`, `hub/pipeline.js`, `hub/app.js` |
| C | **Coaching cycle.** "Send to coach review" on every sufficient proposal → Staff → Coaching cycle (review, session, decision forms with reasons and names) → Today lists accepted objectives first and labels the rest "Proposed — awaiting coach review" or "Engine proposal — not reviewed". JSON export of operational records. | `core/cycle.js`, `hub/app.js` |
| D | **Rules profiles.** Staff → Rules & decisions lists patch, draft order, PUBGM scoring and live-coaching rules with status and source; affected views carry a provisional-rules banner; updating a rule (name + reason required, PUBGM table editable) flags affected views and every objective proposed under the old version. | `core/rules.js`, `hub/app.js` |
| E | **Supported import path.** Dota: load the OpenDota JSON as a **file** (works everywhere) or paste it; step-by-step instructions on the page; specific messages for HTML instead of JSON, truncated files, OpenDota errors, wrong match, unparsed replay, players on both sides. The desktop fetch remains, labelled unverified. PUBGM CSV: missing-column and row-level errors, nothing saved on any error. | `dota/importer.js`, `hub/app.js` |

Unchanged: all game engines' analysis, Draft Lab, the published V1 page.

---

## 4. Validation (3 Nov, 35 automated tests, all pass)

| # | Acceptance check | Result | How |
|---|---|---|---|
| 1 | Synthetic data never enters operational summaries or recommendations | **Passed** | Pipeline, record and propose functions refuse demo input; Today in live mode shows no demo team; demo sandbox shows no proposals; SYNTHETIC CSV rejected with nothing saved (AC1) |
| 2 | An unreviewed objective is visibly proposed | **Passed** | Proposal saved as `proposed`; Today and Coaching cycle show "awaiting coach review" (AC2) |
| 3 | A coach can modify or reject and the reason is kept | **Passed** | Modify without reason refused; reason, reviewer, time, before/after stored; reject reason shown as next step (AC3) |
| 4 | Session links back to its objective and forward to a decision | **Passed** | Session stores the objective as practised; decision stores the session id; trail shows S1 → continue (AC4) |
| 5 | Sparse or incomplete data gives a limitation | **Passed** | 3 PUBGM matches → "at least 6 needed", no recommendations; unparsed Dota match carries the limitation (AC5) |
| 6 | Club evidence is not presented as national-team performance | **Passed** | All V1 Dota evidence labelled club; both shipped matches are club context; series review excludes them (AC6) |
| 7 | A rule-profile change flags affected analysis | **Passed** | Patch change flags 1 objective and the Dota views (AC7) |
| 8 | Failed or incomplete imports give actionable feedback | **Passed** | Five failure types each return an instruction; the page shows it and keeps working (AC8, AC8b) |
| 9 | Supported end-to-end workflow in the intended environment | **Not run** | Passed only in a headless browser with an in-memory stand-in for the shared store (AC9). Not run on a published page inside the Claude desktop app, because nothing was published. |

Demo fixtures were used only to test software behaviour. No test here says anything about whether the workflow improves coaching.

### Remaining limitations
- The desktop "Fetch via browser pane" path is still unverified; the file route is the supported one.
- Access control is the artifact's sharing: anyone with edit access can review or change rules. Reviewer names are typed, not verified identities.
- All Dota evidence is still club data until pelatnas scrims are imported.
- Counterpick/synergy still not scored; only Mongolia scouted.
- PUBGM has no operational data yet; every PUBGM view is empty in live mode until scrims are logged.
- Measurement shows workflow counts and indicator changes, never effectiveness.

---

## 5. Pilot workflows (event-relative; pelatnas dates unconfirmed)

Timing uses **P-day** = first day of pelatnas with the full title roster present. No dates or assignments are set here.

### Dota 2 pilot — one cycle

| Step | What | Who (proposed) | When |
|---|---|---|---|
| Inputs | 3 or more scrim match IDs with all five national players, replays parsed on OpenDota; the five players' scrim accounts confirmed | Analyst (TBD); players | P-day to P+2 |
| Import | Save each match JSON, load in Dota 2 → Post-match; resolve any import messages | Analyst (TBD) | Same day as each scrim |
| Proposal | From Post-match or Team: send 1–2 proposals with "national" context to review | Analyst (TBD) | Same day |
| Coach review | Accept / modify / reject with reason | Dota 2 title coach or Head Coach — **TBD who** | Before next scrim block |
| Practice | Run the accepted drill in the next scrim block | Title coach | Next scrim block |
| Logging | Owner, date, execution, result vs criterion, measured value, scrim opponent, patch | Analyst (TBD) | Same day |
| Decision | Continue / adjust / retire / gather evidence, with reason | Title coach | After the session |

Example objective, only if the evidence repeats in national scrims: *Post-Roshan defence* — success criterion "no building lost within 3 minutes of an enemy Roshan in 3 of 4 reps across two sessions" (from the V1 drill library).

**Post-session questions.** Was the problem real in this scrim? Did the drill run as planned? Was the success criterion measurable without extra effort? What would you change in the proposal? How many minutes did logging take?

### PUBG Mobile pilot — one cycle

| Step | What | Who (proposed) | When |
|---|---|---|---|
| Inputs | Full-lobby results for 6+ scrim matches (all teams' placement and eliminations), Indonesia's drop, zone-entry and died-phase tags; fight tags optional for the first cycle | Analyst (TBD) | P-day to P+2 |
| Rules | Confirm which scoring table the scrims use; set it in Rules & decisions | Title coach (Christie Onibala) or analyst — **TBD** | Before first import |
| Import | Paste/load CSV; fix any listed errors | Analyst (TBD) | Same day |
| Proposal → review → practice → logging → decision | As for Dota | Title coach / analyst | Same rhythm |

Example objective, only if the data shows it: *Survival after zone 3* — "alive at zone 5 in 4 of 6 scenario reps; rotation started ≤ 20 s after announce in every rep".

**Minimum logging fields (both titles):** objective id, owner, date, executed (as-planned / partly / not-run), result vs criterion, measured value, scrim opponent, patch/version.

### Evidence needed to judge whether the workflow is useful
Collected over the pilot, judged by the title coaches, not by the hub:
1. Share of proposals accepted or modified (vs rejected) and the stated reasons.
2. Coach rating of each proposal's usefulness (1–5) and whether it told them something new.
3. Share of sessions with a measurable result logged.
4. Staff minutes per cycle (import + review + logging).
5. Whether the same problem recurs or eases across comparable scrims, reported as an indicator, not a cause.
A rough threshold for "worth continuing" is a staff decision (§7).

---

## 6. Backlog

**Before the staff pilot**
1. Decide whether to publish V1.1 over the V1 page (it keeps the URL and the shared store) — **needs your go-ahead**.
2. Run AC9 for real: open V1.1 in the Claude desktop app, import one match file, run one full cycle, check the shared store.
3. Share the page with the people who will review (edit access) and record who reviews per title.
4. Add the players' scrim account IDs if they differ from their tournament accounts.
5. Confirm with each title coach the PUBGM scrim scoring table and the Dota patch to set in Rules.

**After pilot feedback**
6. Trim the review/session forms to what coaches actually fill in.
7. Per-reviewer identity from the platform instead of typed names.
8. Recurring-problem view across national scrims (Dota) and across days (PUBGM) feeding proposals.
9. Hero matchup data for counterpick terms, gated by sample size.
10. Scout remaining Dota finalists (Greece first) and PUBGM rivals.

**Later**
11. VOD timestamps/clips attached to sessions and fights.
12. MLBB records into the same cycle (Draft Lab stays the engine).
13. Spreadsheet export matching the planning workbook's Action Tracker.

---

## 7. Decisions needing human input

1. **Publish V1.1** to replace the V1 page? (Not done.)
2. **Who reviews proposals** per title: title coach, Head Coach, or both?
3. **Who logs** scrims per title (analyst role is TBD in the support-staff headcount).
4. **Scrim scoring table** for PUBG Mobile pilots, and the patch to record for Dota.
5. **What counts as "useful enough"** to keep the workflow after the pilot.
6. **Pilot start** relative to pelatnas (P-day), once BOD confirms dates.
