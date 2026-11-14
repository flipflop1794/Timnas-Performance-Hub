-- Hub V1.26–V1.27 — run once in Supabase → SQL Editor (one run). Widens the list of AI actions logged in ai_usage
-- (V1.26: weekly, meta_extract, meta_fit; V1.27: prematch, scout_day, brainstorm). No table, policy or data change.
-- Then redeploy the scrim-ai function (GitHub → Actions → Go-live, step 2 only). Until both are done the new AI
-- buttons stay hidden; everything else in V1.25–V1.27 works without them.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm'));
