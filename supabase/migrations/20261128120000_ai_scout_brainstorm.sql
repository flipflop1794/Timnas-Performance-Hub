-- V1.27: three more AI actions logged in ai_usage: prematch (one-page brief before a WEC match), scout_day (the
-- day's scouting summary per opponent) and brainstorm (coach / analyst sessions per title). Only the list of allowed
-- actions changes. Feedback on AI output, approved day summaries and briefs are kept in scouting_notes (kinds
-- ai_feedback / scout_day / brief): no table, policy or data change.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm'));
