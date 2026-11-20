-- V1.35 — Camp plan. Run this whole file once in Supabase → SQL Editor. It only adds the camp_plans table;
-- no existing table or data changes. Same content as supabase/migrations/20261201120000_camp_plans.sql.

-- V1.35 Camp plan (periodisation): one row per title with the camp's weekly phases, a level for every day,
-- the daily unit template and whether each day was run as planned. Made and kept by that title's staff.
-- Same model as the Pelatnas tables: read by title, write on assigned titles, delete by admin only, audited.
create table public.camp_plans (
  id text primary key check (length(id) between 1 and 200),
  title text references public.disciplines (id),
  data jsonb not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index on public.camp_plans (title);
create index on public.camp_plans (updated_at desc);
alter table public.camp_plans enable row level security;
create trigger a_stamp before insert or update on public.camp_plans for each row execute function public.stamp_record('');
create trigger audit after insert or update or delete on public.camp_plans for each row execute function public.audit();
create policy read on public.camp_plans for select to authenticated using (public.can_read_title(title));
create policy add on public.camp_plans for insert to authenticated with check (public.can_write_title(title));
create policy change on public.camp_plans for update to authenticated using (public.can_write_title(title)) with check (public.can_write_title(title));
create policy remove on public.camp_plans for delete to authenticated using (public.has_role('admin'));
revoke all on public.camp_plans from anon;
grant select, insert, update, delete on public.camp_plans to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.camp_plans;
  end if;
end $$;
