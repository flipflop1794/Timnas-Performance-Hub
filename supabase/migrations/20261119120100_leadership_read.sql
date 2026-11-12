-- V1.19 — step 2 of 2: Leadership reads every title, and nothing else changes.
--   * Read: like the Head Coach, every title (team records, reports, plans, scouting, Pelatnas board).
--   * Write: nothing. can_write_title() and can_approve() do not include the role, so every insert, update,
--     delete and approval is refused by the database, whatever the screen shows.
--   * Wellbeing and Coach Donny's readiness data: not readable (can_wellbeing() does not include the role).
-- Replaces one function; no table, policy or row is changed.
create or replace function public.can_read_title(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach') or public.has_role('assistant_coach') or public.has_role('leadership')
      or (t is null and public.is_staff())
      or (t is not null and public.is_assigned(t) and public.is_staff())
$$;
