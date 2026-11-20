-- V1.36 — Edit history for support and scrim reports. Run this whole file once in Supabase → SQL Editor, AFTER RUN_ON_LIVE_V1_35.sql.
-- Same content as supabase/migrations/20261202120000_edit_history.sql.

-- V1.36 — reports can be edited, and every edit is recorded by the database.
--
-- record_history: one row per change of a support staff report or a scrim report: who (signed-in user and their
-- name), when, and the record before and after. Written only by the trigger below (no one can add, change or delete
-- a history row); readable by whoever can read the record itself.
-- scrim_reports: no longer locked. The author, the Head Coach, admins and assistant coaches may edit a report of a
-- title they can read; corrections stay readable for the reports that have them.
-- support_summary(): support staff get their own numbers only; Coach Donny, the Head Coach, admins and leadership
-- get everyone's counts; other accounts get nothing. Follow-up is now a text ("Tindak lanjut"); any text counts.

create table public.record_history (
  id bigint generated always as identity primary key,
  tbl text not null check (tbl in ('support_reports', 'scrim_reports')),
  record_id text not null,
  editor uuid references public.profiles (id),
  editor_name text not null default '',
  at timestamptz not null default now(),
  before jsonb not null,
  after jsonb not null
);
create index on public.record_history (tbl, record_id);
create index on public.record_history (at desc);
alter table public.record_history enable row level security;
create policy read on public.record_history for select to authenticated using (
  (tbl = 'support_reports' and exists (select 1 from public.support_reports r where r.id = record_id))
  or (tbl = 'scrim_reports' and exists (select 1 from public.scrim_reports r where r.id = record_id)));
revoke all on public.record_history from anon;
grant select on public.record_history to authenticated;

create function public.log_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data is distinct from old.data then
    insert into public.record_history (tbl, record_id, editor, editor_name, before, after)
    values (tg_table_name, new.id, auth.uid(), coalesce((select display_name from public.profiles where id = auth.uid()), ''), old.data, new.data);
  end if;
  return new;
end $$;
create trigger z_history after update on public.support_reports for each row execute function public.log_edit();

drop trigger if exists no_update on public.scrim_reports;
create trigger z_history after update on public.scrim_reports for each row execute function public.log_edit();
create policy change on public.scrim_reports for update to authenticated
  using (public.can_read_title(title) and (created_by = auth.uid() or public.has_role('admin') or public.has_role('head_coach') or public.has_role('assistant_coach')))
  with check (public.can_read_title(title) and (created_by = auth.uid() or public.has_role('admin') or public.has_role('head_coach') or public.has_role('assistant_coach')));
grant update on public.scrim_reports to authenticated;

create or replace function public.support_summary(d_from date, d_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select (public.can_support_read() or public.has_role('leadership')) as all_rows, public.has_role('support') as own
  ), rep as (
    select (s.data ->> 'date')::date as day, s.data ->> 'discipline' as disc, s.data from public.support_reports s, me
    where (s.data ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' and (s.data ->> 'date')::date between d_from and d_to
      and (me.all_rows or (me.own and s.created_by = auth.uid()))
  ), r as (
    select rep.day, rep.disc, x.item from rep cross join lateral jsonb_array_elements(coalesce(rep.data -> 'rows', '[]'::jsonb)) as x(item)
  )
  select case when not (select all_rows or own from me) then null else jsonb_build_object(
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'disc', disc)), '[]'::jsonb) from rep),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'disc', disc, 'title', item ->> 'title', 'response', item ->> 'response',
      'followUp', coalesce(nullif(nullif(item ->> 'followUp', ''), 'false'), '') <> '', 'session', item ->> 'session',
      'vasBefore', item -> 'vasBefore', 'vasAfter', item -> 'vasAfter')), '[]'::jsonb) from r),
    'repeat', (select count(*) from (select item ->> 'athlete' from r where coalesce(item ->> 'athlete', '') <> '' group by 1 having count(*) >= 3) z)
  ) end
$$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.record_history;
  end if;
end $$;
