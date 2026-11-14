# Hub V1.26 — Focus 1 (quality of practice) and Focus 2 (meta) (14 Nov 2026)

Builds on V1.17 "Suggest a focus", V1.16 "Say it once", V1.20 Weaknesses and V1.24 VOD themes / End of day.
Staff approve anything the AI writes; nothing is scored or predicted; small samples are labelled; the AI uses only
hub records or text an analyst pasted, and the hub itself drops any AI line with a number (or id) that is not in
the material. Not deployed.

## Put it live (when approved)
1. **Database:** Supabase → SQL Editor → run `supabase/RUN_ON_LIVE_V1_26.sql` (one statement pair: widens the list
   of AI actions logged in `ai_usage`; no table, policy or data change). Same as `migrations/20261125120000_ai_practice_meta.sql`.
2. **AI function:** redeploy `scrim-ai` (GitHub → Actions → Go-live, step 2). Prompt version `scrim-ai-2026-11-25.1`.
3. **Website:** merge to `main`.
Until 1 and 2 are done, the new AI buttons stay hidden (the site asks the function which actions it has);
everything else below works without them.

## Focus 1 — quality of practice
| Feature | Where | AI | What it does |
|---|---|---|---|
| **Timed drills** | Scrims & practice → Plan a session → "Timed drills" | Optional: "Suggest a focus" now also proposes 2–4 drills | Up to 4 drills per session: name, minutes (5–180), objective, success criterion. The AI starts from unfixed adjustments, flagged weaknesses and recurring VOD themes; "Use in the plan below" fills the rows; the coach edits, then "Add to plan". The planned session shows its drills and total minutes. |
| **Drill results + review** | Scrim report (when the planned session is picked) | Optional: "Say it once" also reads the note per drill | One call per drill: met / not met / not tried, saved with the report (and in the CSV). Next to it, **Compared with earlier sessions**: adjustments still "No change", weaknesses that keep coming back, drills not met twice. |
| **Weekly trend** | Trends tab | Optional: "Draft the wording (AI)" | Last 14 days against the 14 before: weaknesses no longer showing, persisting, new; which partner exposed what (2+); drill results; sample size (under 5 reports = early signs only). The AI drafts wording citing the sections; lines with a number not in the trend are left out; a coach approves before copying. |

## Focus 2 — current meta
| Feature | Where | AI | What it does |
|---|---|---|---|
| **Meta tracker** | New **Meta** tab in every title | — | Entries: patch, change, strong, weak, strategy; item, what it says, source, patch. Everything starts **to confirm**; an analyst confirms or retires (with a reason). Current patch = newest patch entry, else the Rules setting. |
| **Add from text** | Meta → Add from text | `meta_extract` | Paste patch notes, stats, a tier list or notes (≤ 12,000 characters) with a source. The AI structures it; **an entry survives only if its quote is really in the text**; the analyst ticks what to add (as to confirm). |
| **Dota 2 pro stats** | Meta (Dota 2) | — | OpenDota public pro hero stats: picks, bans, win %, small samples (< 20 picks) marked; "Add as strong" (to confirm). If OpenDota cannot be reached, paste its numbers under Add from text. |
| **Good for us / bad for us** | Meta | Optional: `meta_fit` "Draft the meta brief" | Computed: aligned (strong items we play in 3+ confirmed games or a pool "main"), exposed (strong items we have no games or pool on; weak items we rely on), TBD (strategies and changes: compare by hand). The AI drafts aligned / exposed / practise and a brief, each line citing tracker and our-record ids; lines with an unknown number or id are left out; a coach approves before copying. |

## AI cost (estimate, Sonnet 5.5 at $2 / $10 per million tokens)
| Action | Calls | Per call | Typical |
|---|---|---|---|
| plan (now with drills) | ~10 / day | ~$0.025 | ~$0.25 / day |
| debrief (now per drill) | ~14 / day | ~$0.02 | ~$0.30 / day |
| weekly | ~7 / week | ~$0.02 | ~$0.15 / week |
| meta_extract | ~10 / week | ~$0.04 | ~$0.40 / week |
| meta_fit | per title per patch | ~$0.03 | < $0.50 / month |
Within the existing caps (300 calls per person, 600 for the staff, per day).

## Tests
`tests/practice_meta.test.js`: drill validation, drills on sessions and reports (and CSV), what came back, plan
material, weekly trend and small samples, meta entries / confirm / retire / patch, quote-checked extraction,
OpenDota rows, our facts, good-for-us logic, the AI function routing for the new actions, and the pages (plan with
drills → report asks per drill → Trends → Meta add / confirm / compare).

## Check by hand (staff)
1. Plan a real session with 3 drills; after the scrim, mark each drill in the report. Is the wording of "success criterion" clear?
2. Weekly trend for a title with 2+ weeks of reports: do "persisting / new / no longer showing" match the coaches' sense?
3. Meta: paste the latest MLBB patch notes; check the extracted entries and their quotes.
4. Dota 2: load OpenDota pro stats on the pelatnas network.

## Still TBD
- Session format per title (standard blocks, length, a list of drills) — game coaches.
- Which meta sources analysts trust per title, and the WEC patch / version — analysts; IESF via you.
- Approved weekly drafts and meta briefs are copied, not stored; storing them would need a table (later, if wanted).
- Focus 3 AI (opponent brief, pre-match brief, end-of-day scouting summary) and offline reopening: Phase 3.
