-- V1.30: one more AI action logged in ai_usage: match_result (eFootball match stats and CS2 scoreboard screenshots).
-- The screenshots use the existing scrim-captures bucket and scrim_captures table; the confirmed games are kept in
-- scrim_games (game "efootball" / "cs2"). Only the list of allowed actions changes: no table, policy or data change.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm', 'match_result'));
