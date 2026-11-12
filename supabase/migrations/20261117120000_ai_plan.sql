-- V1.17 next-session plan: a fifth kind of AI call in the usage log.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan'));
