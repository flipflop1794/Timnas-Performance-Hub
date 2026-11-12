-- Timnas Performance Hub: database update for V1.19 (Leadership role for the Ketua BTN and Dewan Pengawas).
-- Run AFTER the V1.18 update. Run the two parts below SEPARATELY (two runs in the SQL Editor):
-- the new role value must be saved before part 2 uses it. Neither part changes any data.
-- Same content as supabase/migrations/20261119120000_leadership_role.sql and 20261119120100_leadership_read.sql.

-- ---- part 1 of 2 --------------------------------------------------------------
alter type public.app_role add value if not exists 'leadership';

-- ---- part 2 of 2 (run after part 1) ----------------------------------------------
create or replace function public.can_read_title(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach') or public.has_role('assistant_coach') or public.has_role('leadership')
      or (t is null and public.is_staff())
      or (t is not null and public.is_assigned(t) and public.is_staff())
$$;
