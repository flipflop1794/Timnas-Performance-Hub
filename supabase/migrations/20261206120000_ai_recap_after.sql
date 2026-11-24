-- V1.52 — two new kinds of AI call in the usage log:
--   recap  a coach's WhatsApp recap read into the whole scrim report
--   after  the note after a saved report (what repeated, one focus, one question) with its weakness labels
-- The note is kept inside the report's existing weakness_tags row (field "after"): no new table.
-- Replaces one check constraint; no data changes.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm', 'match_result', 'support_parse', 'recap', 'after'));
