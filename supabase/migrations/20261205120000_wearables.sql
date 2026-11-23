-- TEST BRANCH (test/wearables) — WHOOP and Garmin connections for Coach Donny's readiness system.
--
-- An athlete gets a personal link from Coach Donny, gives consent, and approves access on WHOOP's or Garmin's own
-- page (OAuth): the hub never sees the athlete's password. The server function `wearables` keeps the access keys
-- and writes one row per athlete, provider and day. The hub then hands those rows to Coach Donny's system, whose
-- own consent check decides whether they are used.
--
-- Who can read: Coach Donny (readiness owner) and admins, as for all wellbeing data. Access keys and the
-- short-lived login state are readable by nobody signed in (server function only).

-- 1. Personal connect links (one per athlete and provider), made by Coach Donny or an admin.
create table public.wearable_invites (
  token text primary key check (length(token) between 24 and 80),
  athlete_id text not null check (length(athlete_id) between 1 and 120),
  athlete_name text not null default '' check (length(athlete_name) <= 120),
  provider text not null check (provider in ('whoop', 'garmin')),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz
);
alter table public.wearable_invites enable row level security;
create policy read on public.wearable_invites for select to authenticated using (public.can_wellbeing());
create policy add on public.wearable_invites for insert to authenticated with check (public.can_wellbeing() and created_by = auth.uid());
revoke all on public.wearable_invites from anon;
grant select, insert on public.wearable_invites to authenticated;

-- 2. Connections (no keys here): who is connected to what, and when data last arrived.
create table public.wearable_links (
  athlete_id text not null,
  provider text not null check (provider in ('whoop', 'garmin')),
  athlete_name text not null default '',
  provider_user_id text not null default '',
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  connected_at timestamptz not null default now(),
  last_data_at timestamptz,
  note text not null default '',
  primary key (athlete_id, provider)
);
create index on public.wearable_links (provider, provider_user_id);
alter table public.wearable_links enable row level security;
create policy read on public.wearable_links for select to authenticated using (public.can_wellbeing());
revoke all on public.wearable_links from anon;
grant select on public.wearable_links to authenticated;

-- 3. Access keys: server function only (no policy, no grant to signed-in users).
create table public.wearable_tokens (
  athlete_id text not null,
  provider text not null check (provider in ('whoop', 'garmin')),
  access_token text not null,
  refresh_token text not null default '',
  expires_at timestamptz,
  scope text not null default '',
  updated_at timestamptz not null default now(),
  primary key (athlete_id, provider)
);
alter table public.wearable_tokens enable row level security;
revoke all on public.wearable_tokens from anon, authenticated;

-- 4. Login in progress (OAuth state and PKCE verifier), kept for 15 minutes: server function only.
create table public.wearable_oauth_state (
  state text primary key,
  invite_token text not null references public.wearable_invites (token) on delete cascade,
  provider text not null,
  verifier text not null default '',
  created_at timestamptz not null default now()
);
alter table public.wearable_oauth_state enable row level security;
revoke all on public.wearable_oauth_state from anon, authenticated;

-- 5. One row per athlete, provider and day, in Coach Donny's wearable format (data) plus provider extras.
create table public.wearable_daily (
  athlete_id text not null,
  provider text not null check (provider in ('whoop', 'garmin')),
  day date not null,
  data jsonb not null default '{}'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (athlete_id, provider, day)
);
create index on public.wearable_daily (updated_at desc);
alter table public.wearable_daily enable row level security;
create policy read on public.wearable_daily for select to authenticated using (public.can_wellbeing());
revoke all on public.wearable_daily from anon;
grant select on public.wearable_daily to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wearable_links;
    alter publication supabase_realtime add table public.wearable_daily;
  end if;
end $$;
