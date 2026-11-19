-- V1.34 — support staff daily reports. Step 2 of 2.
--
-- support_reports: one report per staff member per day (what they did, what they found, which athletes). Health and
-- psychological data: readable by the author, the readiness owner (Coach Donny), the Head Coach and admins only;
-- written by support staff (and those three, who may correct). Each author may change only their own reports.
-- support_notices: the neutral line a support staff member chooses to send to a title's coaches ("check with the
-- physio before scrim"): no diagnosis, read like any title record.
-- support_summary(): counts without names or text for everyone signed in (leadership, coaches): reports per
-- discipline, athletes seen per title, follow-ups, responses, pain score change, athletes seen 3+ times.

create function public.can_support_read() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach') or public.has_role('readiness_owner')
$$;
create function public.can_support_write() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('support') or public.can_support_read()
$$;
grant execute on function public.can_support_read() to authenticated;
grant execute on function public.can_support_write() to authenticated;

create table public.support_reports (
  id text primary key check (length(id) between 1 and 200),
  title text references public.disciplines (id),
  data jsonb not null check (data ? 'date' and data ? 'discipline'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index on public.support_reports ((data ->> 'date'));
create index on public.support_reports (created_by);
alter table public.support_reports enable row level security;
create trigger a_stamp before insert or update on public.support_reports for each row execute function public.stamp_record('');
create trigger audit after insert or update or delete on public.support_reports for each row execute function public.audit();
create policy read on public.support_reports for select to authenticated using (created_by = auth.uid() or public.can_support_read());
create policy add on public.support_reports for insert to authenticated with check (public.can_support_write());
create policy change on public.support_reports for update to authenticated using (created_by = auth.uid() or public.can_support_read()) with check (created_by = auth.uid() or public.can_support_read());
create policy remove on public.support_reports for delete to authenticated using (public.has_role('admin'));
revoke all on public.support_reports from anon;
grant select, insert, update, delete on public.support_reports to authenticated;

create table public.support_notices (
  id text primary key check (length(id) between 1 and 200),
  title text references public.disciplines (id),
  data jsonb not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index on public.support_notices (title);
alter table public.support_notices enable row level security;
create trigger a_stamp before insert or update on public.support_notices for each row execute function public.stamp_record('');
create trigger audit after insert or update or delete on public.support_notices for each row execute function public.audit();
create policy read on public.support_notices for select to authenticated using (public.can_read_title(title) or public.can_support_write());
create policy add on public.support_notices for insert to authenticated with check (title is not null and public.can_support_write());
create policy change on public.support_notices for update to authenticated using (created_by = auth.uid() or public.can_support_read()) with check (title is not null and public.can_support_write());
create policy remove on public.support_notices for delete to authenticated using (created_by = auth.uid() or public.has_role('admin'));
revoke all on public.support_notices from anon;
grant select, insert, update, delete on public.support_notices to authenticated;

-- Counts only: no athlete names, no complaints, diagnoses or notes leave the table this way.
create function public.support_summary(d_from date, d_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with rep as (
    select (s.data ->> 'date')::date as day, s.data ->> 'discipline' as disc, s.data from public.support_reports s
    where (s.data ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' and (s.data ->> 'date')::date between d_from and d_to
  ), r as (
    select rep.day, rep.disc, x.item from rep cross join lateral jsonb_array_elements(coalesce(rep.data -> 'rows', '[]'::jsonb)) as x(item)
  )
  select case when not public.is_staff() then null else jsonb_build_object(
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'disc', disc)), '[]'::jsonb) from rep),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'disc', disc, 'title', item ->> 'title', 'response', item ->> 'response',
      'followUp', coalesce((item ->> 'followUp')::boolean, false), 'vasBefore', item -> 'vasBefore', 'vasAfter', item -> 'vasAfter')), '[]'::jsonb) from r),
    'repeat', (select count(*) from (select item ->> 'athlete' from r where coalesce(item ->> 'athlete', '') <> '' group by 1 having count(*) >= 3) z)
  ) end
$$;
grant execute on function public.support_summary(date, date) to authenticated;

-- The AI reads a pasted WhatsApp report (scrim-ai action support_parse): logged in ai_usage without a title.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm', 'match_result', 'support_parse'));
create policy add_support on public.ai_usage for insert to authenticated with check (title is null and action = 'support_parse' and public.can_support_write());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.support_reports;
    alter publication supabase_realtime add table public.support_notices;
  end if;
end $$;

-- The job of a support staff member (set by an admin in Users & access): decides which report form they get.
alter table public.profiles add column if not exists support_job text
  check (support_job in ('medic', 'physio_men', 'physio_women', 'physical', 'psych_men', 'psych_women'));
