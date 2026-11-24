-- V1.52: run once on the live database (Supabase → SQL editor), BEFORE deploying the scrim-ai function.
-- Adds two kinds of AI call to the usage log: recap (a coach's WhatsApp recap read into the scrim report) and
-- after (the note after a saved report, with its weakness labels). It replaces one check constraint.
-- No table is added and no data is changed or deleted. Safe to run twice.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm', 'match_result', 'support_parse', 'recap', 'after'));
