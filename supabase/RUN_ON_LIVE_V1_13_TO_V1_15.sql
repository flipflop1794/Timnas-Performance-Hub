-- Timnas Performance Hub: database update for V1.13, V1.14 and V1.15, in one file.
-- Run ONCE on the live project: Supabase → SQL Editor → New query → paste all of this → Run.
-- It only ADDS tables, functions, policies and a private storage bucket; nothing existing is changed or deleted.
-- Same content as supabase/migrations/20261110120000_scrim_capture.sql, 20261112120000_draft_room.sql,
-- 20261113120000_readiness_store.sql (in that order). Generated 8 Nov 2026.
begin;
-- V1.13 — AI scrim capture: screenshots read by AI, confirmed games, pattern findings, learnt player
-- names and AI usage. Same model as the core schema: one row per record, the app's record in `data`,
-- author / time / title set by the server, title-scoped Row Level Security, every change audited.
--
--   scrim_captures    one uploaded screenshot (or the AI's reading of it); status extracted -> confirmed / discarded
--   scrim_games       one confirmed game inside a scrim report; INSERT-ONLY. A fix is a new row with
--                     data.supersedes = the old game's id (the hub shows the latest version)
--   pattern_findings  AI-written findings from hub-computed facts; coaches mark them useful / known / wrong / promoted
--   player_aliases    on-screen names a coach matched to a roster player (one row per title + player)
--   ai_usage          one row per AI call (tokens, outcome) for cost tracking and the daily cap

do $$
declare n text;
begin
  foreach n in array array['scrim_captures', 'scrim_games', 'pattern_findings', 'player_aliases'] loop
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
      create trigger a_stamp before insert or update on public.%1$I for each row execute function public.stamp_record('');
      create trigger audit after insert or update or delete on public.%1$I for each row execute function public.audit();
    $f$, n);
  end loop;
end $$;

-- Captures, findings and aliases: read by title, write on assigned titles, delete by admin only.
do $$
declare n text;
begin
  foreach n in array array['scrim_captures', 'pattern_findings', 'player_aliases'] loop
    execute format($f$
      create policy read on public.%1$I for select to authenticated using (public.can_read_title(title));
      create policy add on public.%1$I for insert to authenticated with check (public.can_write_title(title));
      create policy change on public.%1$I for update to authenticated using (public.can_write_title(title)) with check (public.can_write_title(title));
      create policy remove on public.%1$I for delete to authenticated using (public.has_role('admin'));
    $f$, n);
  end loop;
end $$;

-- Confirmed games: insert-only, like the reports they belong to.
create policy read on public.scrim_games for select to authenticated using (public.can_read_title(title));
create policy add on public.scrim_games for insert to authenticated with check (public.can_write_title(title));
create policy remove on public.scrim_games for delete to authenticated using (public.has_role('admin'));
create trigger no_update before update on public.scrim_games for each row execute function public.block_update();
create index on public.scrim_games ((data ->> 'reportId'));

-- A game must belong to a report of the same title (the report is saved first, in the same action).
create function public.check_game_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare rep_title text;
begin
  if coalesce(new.data ->> 'reportId', '') = '' then raise exception 'A scrim game must belong to a scrim report.' using errcode = '23502'; end if;
  select title into rep_title from public.scrim_reports where id = new.data ->> 'reportId';
  if rep_title is null then raise exception 'The scrim report for this game was not found. Save the report first.' using errcode = '23503'; end if;
  if rep_title is distinct from new.data ->> 'title' then raise exception 'A game and its report must have the same title.' using errcode = '22023'; end if;
  return new;
end $$;
create trigger b_check_report before insert on public.scrim_games for each row execute function public.check_game_report();

-- ---------------------------------------------------------------- AI usage
create table public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  title text references public.disciplines (id),
  action text not null check (action in ('scoreboard', 'draft', 'debrief', 'digest')),
  model text not null default '',
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cache_read_tokens int not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens int not null default 0 check (cache_write_tokens >= 0),
  attempts int not null default 1 check (attempts between 1 and 5),
  ok boolean not null,
  error text not null default ''
);
create index on public.ai_usage (user_id, at desc);
create index on public.ai_usage (at desc);
alter table public.ai_usage enable row level security;
create function public.stamp_usage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  new.user_id := auth.uid(); new.at := now(); return new;
end $$;
create trigger stamp before insert on public.ai_usage for each row execute function public.stamp_usage();
create trigger no_update before update on public.ai_usage for each row execute function public.block_update();
create policy read on public.ai_usage for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
create policy add on public.ai_usage for insert to authenticated with check (public.can_write_title(title));

-- Calls today (WIB) by the signed-in person: the server function refuses past its daily cap.
create function public.ai_calls_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ai_usage
  where user_id = auth.uid() and at >= (date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')
$$;

revoke all on public.scrim_captures, public.scrim_games, public.pattern_findings, public.player_aliases, public.ai_usage from anon;
grant select, insert, update, delete on public.scrim_captures, public.scrim_games, public.pattern_findings, public.player_aliases to authenticated;
grant select, insert on public.ai_usage to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function public.ai_calls_today() from public, anon;
grant execute on function public.ai_calls_today() to authenticated;
revoke execute on function public.check_game_report(), public.stamp_usage() from public, anon;

do $$
declare n text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach n in array array['scrim_captures', 'scrim_games', 'pattern_findings', 'player_aliases'] loop
      execute format('alter publication supabase_realtime add table public.%I', n);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------- screenshot storage
-- Private bucket "scrim-captures". Path: <title-slug>/<YYYY-MM-DD>/<id>.<ext>, e.g. mlbb/2026-11-16/....webp.
-- The first folder decides the title the access rules check. Skipped where Supabase Storage is absent
-- (plain Postgres in the tests).
create function public.title_from_slug(s text) returns text
language sql stable security definer set search_path = public as $$
  select id from public.disciplines where trim(both '-' from regexp_replace(lower(id), '[^a-z0-9]+', '-', 'g')) = s
$$;
grant execute on function public.title_from_slug(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('scrim-captures', 'scrim-captures', false, 2500000, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
    execute $p$create policy "scrim captures read" on storage.objects for select to authenticated
      using (bucket_id = 'scrim-captures' and public.can_read_title(public.title_from_slug((storage.foldername(name))[1])))$p$;
    execute $p$create policy "scrim captures add" on storage.objects for insert to authenticated
      with check (bucket_id = 'scrim-captures' and public.can_write_title(public.title_from_slug((storage.foldername(name))[1])))$p$;
    execute $p$create policy "scrim captures remove" on storage.objects for delete to authenticated
      using (bucket_id = 'scrim-captures' and public.has_role('admin'))$p$;
  end if;
end $$;
-- V1.14 Draft Room (MLBB, MLBB Women): the hub's own draft tools. Same pattern as the other title-scoped
-- tables: read by title, write on assigned titles, delete by admin only, every change in the audit log.
--   draft_pools   per player: the coach's rating of each hero (main / can play / learning)
--   draft_books   per opponent: bans, protect, flex picks, side plans; versioned, approved
--   mock_drafts   timed mock drafts in tournament order
--   draft_drills  draft situations with accepted answers and players' attempts
--   pro_games     public pro games imported by staff (kept apart from our own numbers)

do $$
declare n text;
begin
  foreach n in array array['draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games'] loop
    execute format($f$
      create table public.%1$I (
        id text primary key check (length(id) between 1 and 200),
        title text references public.disciplines (id) check (title in ('MLBB', 'MLBB Women')),
        data jsonb not null,
        created_by uuid not null references public.profiles (id),
        created_at timestamptz not null default now(),
        updated_by uuid references public.profiles (id),
        updated_at timestamptz not null default now()
      );
      create index on public.%1$I (title);
      create index on public.%1$I (updated_at desc);
      alter table public.%1$I enable row level security;
      create trigger a_stamp before insert or update on public.%1$I for each row execute function public.stamp_record('');
      create trigger audit after insert or update or delete on public.%1$I for each row execute function public.audit();
      create policy read on public.%1$I for select to authenticated using (public.can_read_title(title));
      create policy add on public.%1$I for insert to authenticated with check (public.can_write_title(title));
      create policy change on public.%1$I for update to authenticated using (public.can_write_title(title)) with check (public.can_write_title(title));
      create policy remove on public.%1$I for delete to authenticated using (public.has_role('admin'));
      revoke all on public.%1$I from anon;
      grant select, insert, update, delete on public.%1$I to authenticated;
    $f$, n);
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach n in array array['draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games'] loop
      execute format('alter publication supabase_realtime add table public.%I', n);
    end loop;
  end if;
end $$;

-- Approval of a draft book (another coach than the writer, from the title's approvers) is checked by the hub,
-- as for opponent cards; the database limits writing to people assigned to the title.
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
commit;
