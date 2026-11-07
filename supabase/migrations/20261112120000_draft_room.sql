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
