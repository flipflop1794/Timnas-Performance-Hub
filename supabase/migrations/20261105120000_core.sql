-- Timnas Performance Hub — core schema, roles and Row Level Security.
-- Target: Supabase (Postgres 15+). Run once on a new project (SQL Editor, or `supabase db push`).
--
-- Model
--   * People: profiles (1:1 with auth.users), user_roles, user_titles (title assignments).
--   * Reference: disciplines (the 7 WEC titles), roster_players.
--   * Operational records: one table per record type. Each row keeps the app's record as `data` (jsonb)
--     plus server-controlled columns: title, created_by, created_at, updated_by, updated_at.
--     Triggers fill those columns from the session and the record, so the client cannot fake the author,
--     the time or the title that the access rules check.
--   * Scrim reports are insert-only. Corrections go to scrim_report_corrections (insert-only).
--   * audit_log keeps every insert / update / delete (old and new row), readable by admins only.
--   * Only staff-entered operational data is stored: rows must carry data.origin = 'operational'
--     (the app's demo sandbox never writes).

-- ---------------------------------------------------------------- types & reference
create type public.app_role as enum ('admin', 'head_coach', 'assistant_coach', 'readiness_owner', 'title_coach', 'analyst');

create table public.disciplines (
  id text primary key,                -- the title name the app uses, e.g. 'Dota 2'
  short_name text not null,
  sort_order int not null
);

-- ---------------------------------------------------------------- people
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  staff_key text check (staff_key in ('fayad', 'aufa', 'donny')),   -- links to the app's fixed staff routing
  created_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create table public.user_titles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null references public.disciplines (id),
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, title)
);

-- New sign-ins get a profile with no role: they see nothing until an admin grants a role.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- permission helpers
-- security definer so policies can read role tables without recursive RLS.
create function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;
create function public.is_assigned(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_titles where user_id = auth.uid() and title = t)
$$;
-- Read: admin, Head Coach and assistant coaches see every title; title coaches and analysts see their assigned titles.
create function public.can_read_title(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach') or public.has_role('assistant_coach')
      or (t is null and public.is_staff())
      or (t is not null and public.is_assigned(t) and public.is_staff())
$$;
-- Write: admin and Head Coach on every title; everyone else only on assigned titles.
create function public.can_write_title(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach')
      or (t is not null and public.is_assigned(t) and public.is_staff())
$$;
-- Approve / reject coaching proposals: admin, Head Coach, or an assistant coach assigned to the title.
create function public.can_approve(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach')
      or (public.has_role('assistant_coach') and public.is_assigned(t))
$$;
-- Wellbeing: admin and the readiness owner only, until visibility is decided (decision log v10).
create function public.can_wellbeing() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('readiness_owner')
$$;

-- ---------------------------------------------------------------- operational record tables
create function public.stamp_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare fixed_title text := nullif(tg_argv[0], '');
begin
  if coalesce(new.data ->> 'origin', '') <> 'operational' then
    raise exception 'Only operational records can be stored (origin must be "operational").' using errcode = '22023';
  end if;
  new.title := coalesce(fixed_title, new.data ->> 'title');
  if auth.uid() is null then
    -- Only a privileged session (SQL Editor, migration, importer) has no signed-in user. It must name the author.
    if current_user in ('anon', 'authenticated') then raise exception 'Not signed in.' using errcode = '42501'; end if;
    if new.created_by is null then raise exception 'Imports must set created_by.' using errcode = '23502'; end if;
    new.updated_by := coalesce(new.updated_by, new.created_by);
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now();
  else
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('scrim_sessions', ''), ('scrim_reports', ''), ('coaching_objectives', ''), ('scouting_notes', ''),
    ('rival_tiers', ''), ('rival_rosters', ''), ('rival_vods', ''), ('opponent_cards', ''), ('sparring_partners', ''),
    ('wec_matches', ''), ('player_plans', ''), ('pubgm_logs', 'PUBG Mobile'), ('dota_matches', 'Dota 2'),
    ('dota_pools', 'Dota 2'), ('wellbeing_checkins', ''), ('wellbeing_loads', '')
  ) as v(name, fixed) loop
    execute format($f$
      create table public.%1$I (
        id text primary key check (length(id) between 1 and 200),
        title text references public.disciplines (id),
        data jsonb not null,
        created_by uuid not null references public.profiles (id),
        created_at timestamptz not null default now(),
        updated_by uuid references public.profiles (id),
        updated_at timestamptz not null default now()
      );
      create index on public.%1$I (title);
      create index on public.%1$I (created_at desc);
      alter table public.%1$I enable row level security;
      create trigger a_stamp before insert or update on public.%1$I for each row execute function public.stamp_record(%2$L);
    $f$, t.name, t.fixed);
  end loop;
end $$;

-- Title-scoped tables: read by title, write on assigned titles, delete by admin only.
do $$
declare n text;
begin
  foreach n in array array['scrim_sessions', 'coaching_objectives', 'scouting_notes', 'rival_tiers', 'rival_rosters', 'rival_vods',
                           'opponent_cards', 'sparring_partners', 'wec_matches', 'player_plans', 'pubgm_logs', 'dota_matches', 'dota_pools'] loop
    execute format($f$
      create policy read on public.%1$I for select to authenticated using (public.can_read_title(title));
      create policy add on public.%1$I for insert to authenticated with check (public.can_write_title(title));
      create policy change on public.%1$I for update to authenticated using (public.can_write_title(title)) with check (public.can_write_title(title));
      create policy remove on public.%1$I for delete to authenticated using (public.has_role('admin'));
    $f$, n);
  end loop;
end $$;

-- Scrim reports: insert-only. A submitted report is never changed; corrections are separate rows.
create policy read on public.scrim_reports for select to authenticated using (public.can_read_title(title));
create policy add on public.scrim_reports for insert to authenticated with check (public.can_write_title(title));
create policy remove on public.scrim_reports for delete to authenticated using (public.has_role('admin'));
create function public.block_update() returns trigger language plpgsql as $$
begin raise exception 'Submitted records cannot be changed. Add a correction instead.' using errcode = '42501'; end $$;
create trigger no_update before update on public.scrim_reports for each row execute function public.block_update();

create table public.scrim_report_corrections (
  id bigint generated always as identity primary key,
  report_id text not null references public.scrim_reports (id) on delete cascade,
  text text not null check (length(trim(text)) between 1 and 2000),
  by_name text not null check (length(trim(by_name)) between 1 and 200),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.scrim_report_corrections (report_id, created_at);
alter table public.scrim_report_corrections enable row level security;
create function public.stamp_correction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    if current_user in ('anon', 'authenticated') or new.created_by is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
    return new;
  end if;
  new.created_by := auth.uid(); new.created_at := now();
  return new;
end $$;
create trigger stamp before insert on public.scrim_report_corrections for each row execute function public.stamp_correction();
create trigger no_update before update on public.scrim_report_corrections for each row execute function public.block_update();
create policy read on public.scrim_report_corrections for select to authenticated
  using (exists (select 1 from public.scrim_reports r where r.id = report_id and public.can_read_title(r.title)));
create policy add on public.scrim_report_corrections for insert to authenticated
  with check (exists (select 1 from public.scrim_reports r where r.id = report_id and public.can_write_title(r.title)));

-- Coaching proposals: anyone who can write the title may propose and log sessions; only an approver may
-- accept, modify or reject (enforced here, not only in the screen).
create function public.guard_objective_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  decided text[] := array['accepted', 'modified', 'rejected'];
  new_status text := new.data ->> 'status';
  old_status text := case when tg_op = 'UPDATE' then old.data ->> 'status' end;
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;  -- SQL Editor / importer
  -- INSERT ... ON CONFLICT DO UPDATE fires this BEFORE INSERT first: compare with the stored row, if any.
  if tg_op = 'INSERT' then select data ->> 'status' into old_status from public.coaching_objectives where id = new.id; end if;
  if new_status = any (decided) and new_status is distinct from old_status and not public.can_approve(new.title) then
    raise exception 'Only the Head Coach or the assigned assistant coach can approve or reject a proposal for %.', new.title using errcode = '42501';
  end if;
  return new;
end $$;
create trigger b_guard_decision before insert or update on public.coaching_objectives for each row execute function public.guard_objective_decision();

-- Wellbeing: admin and readiness owner only, for every operation.
do $$
declare n text;
begin
  foreach n in array array['wellbeing_checkins', 'wellbeing_loads'] loop
    execute format($f$
      create policy read on public.%1$I for select to authenticated using (public.can_wellbeing());
      create policy add on public.%1$I for insert to authenticated with check (public.can_wellbeing());
      create policy change on public.%1$I for update to authenticated using (public.can_wellbeing()) with check (public.can_wellbeing());
      create policy remove on public.%1$I for delete to authenticated using (public.can_wellbeing());
    $f$, n);
  end loop;
end $$;

-- ---------------------------------------------------------------- configuration & rosters
create table public.app_config (
  key text primary key check (key in ('runbooks', 'rules')),
  data jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create function public.stamp_config() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null and current_user in ('anon', 'authenticated') then raise exception 'Not signed in.' using errcode = '42501'; end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by); new.updated_at := now(); return new;
end $$;
create trigger stamp before insert or update on public.app_config for each row execute function public.stamp_config();
create policy read on public.app_config for select to authenticated using (public.is_staff());
-- Runbooks: Head Coach, admin and assistant coaches. Rules profiles: Head Coach and admin.
create policy add on public.app_config for insert to authenticated
  with check (public.has_role('admin') or public.has_role('head_coach') or (key = 'runbooks' and public.has_role('assistant_coach')));
create policy change on public.app_config for update to authenticated
  using (public.has_role('admin') or public.has_role('head_coach') or (key = 'runbooks' and public.has_role('assistant_coach')))
  with check (public.has_role('admin') or public.has_role('head_coach') or (key = 'runbooks' and public.has_role('assistant_coach')));

create table public.roster_players (
  title text not null references public.disciplines (id),
  ign text not null check (length(trim(ign)) between 1 and 60),
  sort_order int not null default 0,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (title, ign)
);
alter table public.roster_players enable row level security;
create policy read on public.roster_players for select to authenticated using (public.is_staff());
create policy add on public.roster_players for insert to authenticated
  with check (public.has_role('admin') or public.has_role('head_coach') or public.has_role('readiness_owner'));
create policy remove on public.roster_players for delete to authenticated
  using (public.has_role('admin') or public.has_role('head_coach') or public.has_role('readiness_owner'));
-- Replace the roster of each title present in p (format: {"Dota 2": ["a","b"], ...}) in one transaction.
create function public.set_roster(p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare k text; i int; v jsonb;
begin
  for k, v in select * from jsonb_each(p) loop
    delete from public.roster_players where title = k;
    for i in 0 .. jsonb_array_length(v) - 1 loop
      insert into public.roster_players (title, ign, sort_order, updated_by) values (k, v ->> i, i, auth.uid()) on conflict do nothing;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------- people policies
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_titles enable row level security;
create policy read on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy change on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role('admin')) with check (id = auth.uid() or public.has_role('admin'));
create function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;  -- SQL Editor / bootstrap
  if not public.has_role('admin') and (new.staff_key is distinct from old.staff_key or new.email is distinct from old.email) then
    raise exception 'Only an admin can change the staff link or email.' using errcode = '42501';
  end if;
  new.id := old.id; new.created_at := old.created_at; return new;
end $$;
create trigger guard before update on public.profiles for each row execute function public.guard_profile();

create policy read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy add on public.user_roles for insert to authenticated with check (public.has_role('admin'));
create policy remove on public.user_roles for delete to authenticated using (public.has_role('admin'));
create policy read on public.user_titles for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy add on public.user_titles for insert to authenticated with check (public.has_role('admin'));
create policy remove on public.user_titles for delete to authenticated using (public.has_role('admin'));
create function public.stamp_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.granted_by := auth.uid(); new.granted_at := now(); return new; end $$;
create trigger stamp before insert on public.user_roles for each row execute function public.stamp_grant();
create trigger stamp before insert on public.user_titles for each row execute function public.stamp_grant();
-- Never remove the last admin.
create function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and not exists (select 1 from public.user_roles where role = 'admin' and user_id <> old.user_id) then
    raise exception 'At least one admin must remain.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger keep_one_admin before delete on public.user_roles for each row execute function public.keep_one_admin();

alter table public.disciplines enable row level security;
create policy read on public.disciplines for select to authenticated using (true);

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index on public.audit_log (table_name, row_id);
create index on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy read on public.audit_log for select to authenticated using (public.has_role('admin'));
create function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into public.audit_log (actor, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), tg_table_name, coalesce(n ->> 'id', o ->> 'id', n ->> 'key', o ->> 'key', n ->> 'user_id', o ->> 'user_id', n ->> 'title', o ->> 'title'), lower(tg_op), o, n);
  return null;
end $$;
do $$
declare n text;
begin
  foreach n in array array['scrim_sessions', 'scrim_reports', 'scrim_report_corrections', 'coaching_objectives', 'scouting_notes', 'rival_tiers',
                           'rival_rosters', 'rival_vods', 'opponent_cards', 'sparring_partners', 'wec_matches', 'player_plans', 'pubgm_logs',
                           'dota_matches', 'dota_pools', 'wellbeing_checkins', 'wellbeing_loads', 'app_config', 'roster_players',
                           'profiles', 'user_roles', 'user_titles'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()', n);
  end loop;
end $$;

-- ---------------------------------------------------------------- grants & realtime
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.disciplines from authenticated;

do $$
declare n text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach n in array array['scrim_sessions', 'scrim_reports', 'scrim_report_corrections', 'coaching_objectives', 'scouting_notes', 'rival_tiers',
                             'rival_rosters', 'rival_vods', 'opponent_cards', 'sparring_partners', 'wec_matches', 'player_plans', 'pubgm_logs',
                             'dota_matches', 'dota_pools', 'wellbeing_checkins', 'wellbeing_loads', 'app_config', 'roster_players'] loop
      execute format('alter publication supabase_realtime add table public.%I', n);
    end loop;
  end if;
end $$;
