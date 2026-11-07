# Timnas Performance Hub V1.13 — AI scrim capture (MLBB, MLBB Women, Dota 2)

Status: built and tested on branch `feature/ai-scrim-capture`. **Not deployed.** Production (`main`, the live site) is unchanged.
Design: "Scrim & Practice — AI Capture & Patterns" (Phase 1 doc, 6 Nov 2026).

## What coaches get

1. **Games from screenshots** (Scrim reports tab, under *Games*). Upload the end-of-game screenshot; the AI reads result,
   duration, side, hero and stats per player. A check screen shows every value next to its column, with highlighted cells
   where the AI was unsure or a check failed (kills that do not add up to the score, a hero not in the list, the same hero
   twice, an unusual number, an unreadable cell). Nothing is saved until the coach presses *Confirm game*.
   Our side and our players are found from the roster names (team tags ignored; names the coach matches once are learnt).
   Confirmed games fill the report's W-L. *Add game by hand* gives the same screen empty, with the roster filled in.
2. **Draft screenshot** (optional, per game): pick/ban order, first pick, matched to the hero list.
3. **Say it once** (all seven titles): one dictated or typed note; the AI moves the coach's own words into focus /
   worked / failed / adjustment / player notes / detail. The hub flags any field with words the coach did not say and
   leaves out anything about health, sleep, mood, family or contact details.
4. **Patterns tab** (MLBB, MLBB Women, Dota 2): numbers the hub computes from confirmed games only — win rate by side,
   game length, first pick, our heroes, heroes banned against us, partner level, rival stand-ins, per-player K/D/A and
   deaths in wins vs losses — with "under 5 games" labels. *Look for patterns (AI)* sends those numbers and recent report
   notes to the AI for up to five findings. The hub drops a finding that cites no computed number, uses a number not in
   the cited facts, or calls something a problem on fewer than 5 games. Coaches mark each finding useful / already known /
   wrong, or turn it into a coaching proposal (routed to the usual approver).
5. **Player trail** (Performance → Player plans): last 10 confirmed scrim games against the player's own earlier games,
   with partner level and heroes beside the numbers. A goal can be tied to a stat ("deaths per game at most 3"); its
   progress then updates itself. The coach still sets the status.
6. **Opponent card**: "our scrim record vs stand-ins for <nation>" and the heroes banned against us in those games.

Every AI step has a by-hand path. The Claude artifact build has no AI (it shows the by-hand path).

## How it is built

| Part | File | Notes |
|---|---|---|
| AI contract | `supabase/functions/_shared/scrim_spec.js` | JSON schemas, prompts, request/answer helpers; shared by server and hub |
| Server function | `supabase/functions/scrim-ai/` | Supabase Edge Function. Runs **as the signed-in coach** (no service-role key): title permission, daily cap, upload, AI call, usage row |
| Checks on AI output | `src/core/capture.js`, `debrief.js`, `patterns.js` | Hero catalogue matching, roster matching, score sums, ranges, number checks on findings |
| Screens | `src/hub/capture_ui.js` | Wired into the existing report form, player plans, opponent card |
| Database | `supabase/migrations/20261110120000_scrim_capture.sql` | `scrim_captures`, `scrim_games` (insert-only; a fix supersedes), `pattern_findings`, `player_aliases`, `ai_usage`, storage bucket `scrim-captures` |
| Hero lists | `data/mlbb/heroes.json` (133, mlbbhub.com, 6 Nov 2026), `data/dota/heroes.csv` | `npm run build` writes `_shared/catalog.gen.js` for the server |
| Accuracy test set | `tools/eval_screenshots.mjs`, `data/eval/` | Real screenshots + hand-typed answers → per-field accuracy |

Model: `claude-sonnet-5-5` by default (secret `SCRIM_AI_MODEL` to change). Answers use structured outputs (JSON schema).
Every call writes an `ai_usage` row (tokens, outcome) for cost tracking; admins can read all rows.

Access is the same as reports: a coach reads and writes only assigned titles; games are insert-only; screenshots are in
a private bucket whose first folder (`mlbb/`, `dota-2/`, …) decides who may read or upload. No wellbeing data goes to the AI.

## Release steps (when you decide to ship)

Do these on a **staging** Supabase project first, not the live one:

1. Supabase → New project `timnas-hub-staging` (Free, Singapore). Run the three migrations in order (SQL Editor), then
   `bootstrap_admin.sql` with your email. Invite one test coach.
2. Get a Claude API key (console.anthropic.com → API keys) and set a **monthly spend limit** there.
3. Deploy the function (Supabase CLI on your laptop, in the repo folder):
   `supabase link --project-ref <staging-ref>` →
   `supabase secrets set ANTHROPIC_API_KEY=<key> ALLOWED_ORIGINS=<the Vercel preview URL> DAILY_CALL_CAP=300` →
   `supabase functions deploy scrim-ai`.
4. Vercel → Settings → Environment Variables → **Preview** only: point `SUPABASE_URL` / `SUPABASE_ANON_KEY` at staging.
   Push the branch → Vercel builds a preview URL. Production keeps using the live project.
5. On the preview, with real pelatnas screenshots: capture 10+ MLBB and 10+ Dota games, confirm them, save reports,
   run *Look for patterns*. Put 20+ screenshots with typed answers in `data/eval/` and run `tools/eval_screenshots.mjs`.
6. If good: run the same migration on the live project (it only adds tables; V1.12 keeps working), deploy the function
   there with `ALLOWED_ORIGINS=https://timnas-performance-hub-kappa.vercel.app`, then merge the branch into `main`.

Rollback: revert the merge on `main` (Vercel redeploys V1.12). The new tables can stay; nothing in V1.12 reads them.

## Testing (6–7 Nov 2026)

`npm test`: **139 pass**. On top of the unit tests:

- **Real MLBB result screens.** Six random screenshots from a public dataset of 2,600 labelled MLBB result screens
  (`r-n/ml_yolo_dataset`, MIT) were read by eye, blind, then scored against the dataset's hero labels
  (`tests/fixtures/mlbb_real_screens.json`). Heroes read as "sure": 12 of 13 right. Unsure: 47, of which the best
  guess was right in 8. This is why only sure heroes are filled and the rest are offered as suggestions.
- **Local stack** (`tools/local-stack/`): real Postgres rules, real Supabase Storage schema, PostgREST, the real
  function under Deno, the real website build in Chrome with production security headers. Function: 9/9 steps.
  Website: 16/16 checks (capture, second screenshot, debrief, save, fix, patterns, findings, other accounts), no
  console errors.
- **Fuzz**: about 7,000 random or broken AI answers through every check; nothing crashes, nothing unreadable is filled.

### Changed by the tests

| What the test showed | Change |
|---|---|
| MLBB's result screen puts the screenshot owner's team on the LEFT, not "blue"; VICTORY/DEFEAT is from that team's view; the map side is not on screen | Teams are left/right; result from the printed outcome; map side set by the coach (optional); blue/red splits only where set |
| Right team's columns are mirrored (gold first) | Said in the prompt; a misread is caught by the range and kill-score checks |
| Heroes are portraits, often skins (13 sure, 47 unsure in 60 rows) | Only sure heroes filled; tap-to-pick suggestions (AI guesses, earlier corrections, the player's usual heroes); a draft screenshot fills them |
| Dota spreads one game over two screens, in different orders, tags shown on one only | "Add another screenshot": merged by name, then hero, then position (flagged); disagreements highlighted |
| INVALID games exist | Refused with a plain sentence |
| No way to fix a saved game | Fix button under each saved report: new version supersedes, the report gets a correction note, draft kept |
| Same screenshot added twice | Duplicate warning (same kill score, duration within 5 s) |
| Screenshot "confirmed" status needed a second write that failed silently when live updates lagged | Confirmation now = listed by a saved game; unconfirmed screenshots shown on the reports page |
| New games and findings did not appear until the page refocused when live updates lagged | Own saves shown at once |
| Every new game re-downloaded every game to every open browser (~3 KB each, ~1,000 by WEC) | Games, screenshots and findings load only rows changed since the last load (full reload on focus) |
| **Live-site bug (V1.9+)**: "no phone numbers" refused stat notes such as "gold 10485 10105 9820" | New rule for real Indonesian phone / NIK / account numbers (`src/core/pii.js`), used by reports and debriefs |
| One health remark removed a whole debrief field | Only that sentence or player note is left out |
| A malformed AI list crashed the findings check; an object in a debrief field showed "[object Object]" | Guarded |
| Models tend to add numbers of their own ("at 8 minutes", "top 1") | Such findings are dropped (5/5 faithful kept, 4/4 with added numbers dropped); the prompt now forbids any other digit |
| "Read cleanly" shown while heroes still needed picking; team box cut off on phones | Fixed |

Still not tested: the real AI model on real screenshots (needs an API key), Dota screenshots (no real images
found that could be downloaded; the two-screen merge is tested with a constructed pair), live updates on Supabase.

## Balance review of the existing modules (7 Nov 2026)

Every rule and threshold in the V1.0–V1.12 engines was re-read for small-sample and edge-case behaviour, and all
58 screens of the artifact build were opened with every non-destructive button pressed once (no errors, no
"NaN"/"undefined" on screen). `tests/balance.test.js` pins each change. `npm test`: **144 pass**.

| Rule | Problem | Change |
|---|---|---|
| Measurement: win-rate change between two windows | Plain (Wald) interval: zero width at 0/8 vs 8/8, too narrow on scrim-size samples, so "better" came too easily | Agresti–Caffo interval (adds one win and one loss per window) |
| Measurement: change in an average (net worth at 10:00, points per match…) | 1.96 used at any sample size (too narrow under ~30 games); two constant windows claimed a certain change | Welch t value for the real sample size; constant windows give "no clear change" |
| Wellbeing: lower than own baseline | A player who reported the same score every day (spread 0) could never be flagged, however big the drop; a very steady player was flagged on a 1-point dip | Spread floored at 1.5 points: a 2+ point drop on a steady baseline flags, a 1-point dip does not |
| Scrim reports: "improving / slipping" tag | Shown from one report this week against one last week | Needs 3+ reports in each week; otherwise no tag |
| PUBGM: early exits and zone 3–4 eliminations | Could become a "problem" finding from 1–2 matches | Needs 5+ matches (same bar as scrim patterns) |

## AI and competitor improvements (7 Nov 2026)

`npm test`: **151 pass**; function on the local stack 9/9; all 58 screens swept again with no errors.

**AI**

| Change | Why |
|---|---|
| Instructions and hero list sent as one cacheable block (prompt caching) | Every screenshot repeats them. A second screenshot within 5 minutes reads them at $0.10 instead of $2 per million tokens (Sonnet 5.5 list price) |
| Busy (429/529) and passing server or network errors retried twice (1 s, then 3 s; the service's retry-after up to 8 s) | A coach at the pelatnas should not have to press again; a bad request is never retried |
| `ai_usage` also stores cache-read and cache-write tokens and the number of attempts | Real cost per call, and how often the service was busy |
| *Look for patterns* sends the staff's marks on earlier findings (useful / known / wrong / promoted) to the AI, and the hub drops a finding the staff marked known or wrong on the same facts until 5 more games back it | Stops the AI telling the coach the same thing every week, or repeating a reading the coach rejected |
| Screenshots shrunk to a 1568 px long edge (was 1600 px wide), WebP quality 0.92 (was 0.85) | 1568 px is the size above which the AI shrinks images anyway; tall screenshots were not shrunk before; higher quality keeps small digits sharp |
| Admin page: *AI use this month*, calls, failures and estimated cost per kind of call, cost per game screenshot and share read from cache | To set the monthly spend limit in the Claude Console from real use. An estimate from list prices read 7 Nov 2026; the Console bill is the real figure |

**Competitor analysis**

| Change | Why |
|---|---|
| Opponent card (Dota 2): *Heroes both sides play*, each rival player's top heroes with 4+ club games that one of ours also plays 4+ times | A first-phase ban-or-take-first decision, shown as such (not "who plays it better") |
| Notes older than 21 days marked *re-check* on the card; a gap line when the newest note is older than that, or when the staff hold only hypotheses | Rosters, patches and form move faster than a month; the 29 Oct notes on MLBB rivals turn "re-check" on 19 Nov |
| Scouting coverage: *Scout next* puts the staff's threat tier before multi-title count, and brings back nations whose notes are over 21 days old after the unscouted ones; a column counts them | An unscouted main threat was ranked below a three-title "watch" nation |

Not done: re-reading the 58 rival rosters on wec.iesf.org. The site cannot be reached from this workspace this time,
and news found by search (esports.id, 28 Oct) adds nothing newer than the 3 Nov record. The weekly roster check
in the hub stays the way to catch changes.
