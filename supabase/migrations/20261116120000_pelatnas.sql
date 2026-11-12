-- V1.16 Pelatnas board: each player's availability for the training camp, and attendance per planned session.
-- The schedule itself is the scrim & practice planner (scrim_sessions); camp dates live in app_config key 'pelatnas'
-- (admin and Head Coach write, all staff read), "TBD" until PB ESI decides.
--   pelatnas_availability  one row per title + player: status, available dates, dates not possible (reason category only)
--   pelatnas_attendance    one row per planned session: present / late / absent / excused per player
-- Same model as the other title tables: read by title, write on assigned titles, delete by admin only, audited.

do $$
declare n text;
begin
  foreach n in array array['pelatnas_availability', 'pelatnas_attendance'] loop
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
    foreach n in array array['pelatnas_availability', 'pelatnas_attendance'] loop
      execute format('alter publication supabase_realtime add table public.%I', n);
    end loop;
  end if;
end $$;

-- Camp dates: a third app_config key, written by admin and Head Coach (the existing policies).
alter table public.app_config drop constraint if exists app_config_key_check;
alter table public.app_config add constraint app_config_key_check check (key in ('runbooks', 'rules', 'pelatnas'));
