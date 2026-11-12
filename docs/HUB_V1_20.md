# Hub V1.20 — AI that helps coaches and analysts run better practice (19 Nov 2026)

Five AI features, all on the existing `scrim-ai` function and AI key (no new paid service), all following the
same rules: the AI writes only from the hub's own records, every number it writes must be in that material
(otherwise the line is marked and left out), and a person checks or approves before anything is published,
planned or saved.

| Feature | Where | For whom | What it does |
|---|---|---|---|
| **Weekly summary for leadership** | Main dashboard | Ketua BTN, Dewan Pengawas; written by the Head Coach | AI drafts a half page in Bahasa Indonesia from the dashboard's figures (practice quality, records, trends, overdue follow-ups, recurring weaknesses, next matches). Lines with an unchecked number are marked; the Head Coach edits and approves; leadership sees the published text. "Figures the AI was given" shows the exact input. |
| **Preparation pack per WEC match** | Tournament → Preparation packs | Title coaches, analysts | AI drafts one page per upcoming WEC match from the opponent card, our scrims against stand-ins, recurring weaknesses, the approved draft book and the partner bank: their tendencies (each citing its source), our focus with drill and measure, suggested scrims (only bank partners, only before the match), risks. Another Head Coach / assistant coach approves (database-enforced, like draft books); then one tap puts the sessions into Scrims & practice. |
| **Recurring weaknesses** | New "Weaknesses" tab in every title | Title coaches, analysts | Each scrim report gets up to 3 labels from a fixed list per game type (AI right after saving, or by hand; always correctable by tapping). The tab counts labels over 14 days against the 14 before; a label seen 3+ times is flagged and becomes a coaching proposal in one tap. Feeds the summary and the preparation packs. |
| **PUBG Mobile results from screenshots** | PUBG Mobile → Log & import | PUBGM staff | Upload the end-of-match result screen (and lobby standings): the AI reads map, placement, kills, survival; the coach checks and saves; rows go into the match log (so PUBGM analysis and Trends fill) with no CSV. |
| **More reliable hero reading** | Scrim report → Games | MLBB, MLBB Women, Dota 2 | When the AI is unsure and exactly one of its candidates is in that player's Draft Room pool (Dota: heroes used in scrims), the hero is filled and stays marked "filled from the hero pool: check". Hero suggestions list the player's pool first. |

## Put it live
1. **Database:** Supabase → SQL Editor → paste `supabase/RUN_ON_LIVE_V1_20.sql` → Run (adds three tables, one trigger, replaces `approve_record`, widens the AI usage kinds; no data changes).
2. **AI function:** redeploy `scrim-ai` (GitHub → Actions → Go-live, step 2 only). Until then the new AI buttons stay hidden; the Weaknesses tab works by hand.
3. **Website:** merge to `main`.

## Cost
About one small AI call per scrim report (labels), one per PUBGM screenshot, one per preparation pack, one per weekly summary. The per-person (300) and staff-wide (600) daily limits apply.

## Not covered yet
- Packs and summaries are re-drafted rather than edited line by line (the summary can be edited before publishing).
- Hero accuracy on real screenshots still needs measuring: run `tools/eval_screenshots.mjs` on 20+ pelatnas screenshots.
- PUBGM rotation/position reading from the minimap is not attempted.
