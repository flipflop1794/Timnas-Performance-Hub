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

## Tests

`npm test`: 130 pass (106 from V1.12, 24 new), including 3 database tests on Postgres 16, 5 server-function tests with a
fake AI service, 4 headless screen tests and 3 website tests with several accounts. Checked in Chrome at 1280 px and
390 px (no page-level horizontal scroll; the check table scrolls sideways on a phone).

Not tested here: the real AI on real screenshots (no key and no screenshots in the build environment), the storage
policies (the test database has no Supabase Storage), and the Edge Function running on Supabase.
