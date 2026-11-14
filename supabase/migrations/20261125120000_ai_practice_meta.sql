-- V1.26 (Focus 1 and 2): three new AI actions are logged in ai_usage: weekly (practice trend draft per title),
-- meta_extract (structure pasted patch notes / stats / tier lists), meta_fit (meta against our own records).
-- Only the list of allowed actions changes; no table, policy or data changes. Live entries, briefs and meta
-- entries are kept in scouting_notes (kinds live / brief / meta) and need no change.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit'));
