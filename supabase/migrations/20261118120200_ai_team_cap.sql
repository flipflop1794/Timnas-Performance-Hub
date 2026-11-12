-- V1.18 — AI calls today (WIB) by the whole staff, for the scrim-ai function's team-wide daily limit.
-- Returns only a count, so it is safe for any staff member to call. Adds one function; nothing else changes.
create or replace function public.ai_calls_today_all() returns int
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then (
    select count(*)::int from public.ai_usage
    where at >= (date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')) else 0 end
$$;
revoke execute on function public.ai_calls_today_all() from public, anon;
grant execute on function public.ai_calls_today_all() to authenticated;
