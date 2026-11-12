-- Timnas Performance Hub: database update for V1.20 (coach AI), in one file. Run AFTER the V1.19 update.
-- Supabase -> SQL Editor -> New query -> paste all -> Run. Adds tables and replaces two functions; no data changes.
-- Same content as supabase/migrations/20261120120000_ai_coach.sql.
begin;

-- V1.20 — AI for coaches and analysts: weekly leadership summary, preparation packs per WEC match,
-- recurring-weakness tags. Same model as every title table: author/time/title set by the server,
-- read by title, write on assigned titles, delete by admin only, every change audited.
--   leadership_briefs  weekly summary for the Ketua BTN and Dewan Pengawas (title empty = all titles):
--                      readable by all staff incl. Leadership, written by the Head Coach or an admin
--   prep_packs         one per WEC match: AI draft, edited by the staff, approved like draft books
--   weakness_tags      one per scrim report: the weakness labels (AI or coach), correctable
-- Also: four new kinds of AI call in the usage log. Adds tables and replaces two functions; no data changes.

do $$
declare n text;
begin
  foreach n in array array['leadership_briefs', 'prep_packs', 'weakness_tags'] loop
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
    foreach n in array array['leadership_briefs', 'prep_packs', 'weakness_tags'] loop
      execute format('alter publication supabase_realtime add table public.%I', n);
    end loop;
  end if;
end $$;
-- A brief has no title: can_read_title(null) = any staff (Leadership included); can_write_title(null) = Head Coach, admin.

-- Preparation packs are approved like draft books and opponent cards: only through approve_record().
create trigger c_guard_approval before insert or update on public.prep_packs for each row execute function public.guard_approval();
create or replace function public.approve_record(p_table text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; res jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if p_table not in ('draft_books', 'opponent_cards', 'prep_packs') then raise exception 'This record type has no approval.' using errcode = '22023'; end if;
  execute format('select id, title, data, updated_by from public.%I where id = $1 for update', p_table) into r using p_id;
  if r.id is null then raise exception 'Not found. Reload and try again.' using errcode = 'P0002'; end if;
  if not public.can_approve(r.title) then
    raise exception 'Only the Head Coach or an assistant coach can approve for %.', r.title using errcode = '42501';
  end if;
  if coalesce(r.data ->> 'status', '') <> 'draft' then raise exception 'Only a draft version can be approved.' using errcode = '22023'; end if;
  if r.updated_by = auth.uid() then
    raise exception 'Ask another coach to approve: the writer of this version cannot approve it.' using errcode = '42501';
  end if;
  perform set_config('hub.approving', 'on', true);
  execute format($u$update public.%I set data = data || jsonb_build_object('status', 'approved', 'approvedBy', $2::text, 'approvedById', $3::text,
                    'approvedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) where id = $1 returning data$u$, p_table)
    into res using p_id, public.my_name(), auth.uid()::text;
  perform set_config('hub.approving', 'off', true);
  return res;
end $$;

alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check
  check (action in ('scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result'));
commit;
