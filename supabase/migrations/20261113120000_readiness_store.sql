-- V1.15 Coach Donny's Athlete Readiness System inside the hub. His service (vendor/donny-monitoring) keeps
-- its records here, one row per record (check-ins, sessions, daily scores, notes, consent, audit entries, ...).
-- Health data: readable and writable only by the readiness owner (Coach Donny) and admins, like the hub's
-- wellbeing tables, until the Head Coach decides who else may see it. Every change is in the hub audit log,
-- which names the hub user who made it (his own audit log names his actor, e.g. the athlete for a staff entry).
create table public.readiness_store (
  id text primary key check (length(id) between 1 and 200),
  title text references public.disciplines (id),
  data jsonb not null check (data ? 'map' and data ? 'value'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index on public.readiness_store (updated_at desc);
alter table public.readiness_store enable row level security;
create trigger a_stamp before insert or update on public.readiness_store for each row execute function public.stamp_record('');
create trigger audit after insert or update or delete on public.readiness_store for each row execute function public.audit();
create policy read on public.readiness_store for select to authenticated using (public.can_wellbeing());
create policy add on public.readiness_store for insert to authenticated with check (public.can_wellbeing());
create policy change on public.readiness_store for update to authenticated using (public.can_wellbeing()) with check (public.can_wellbeing());
create policy remove on public.readiness_store for delete to authenticated using (public.can_wellbeing());
revoke all on public.readiness_store from anon;
grant select, insert, update, delete on public.readiness_store to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.readiness_store;
  end if;
end $$;
