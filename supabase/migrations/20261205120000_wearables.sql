-- V1.51 — Whoop in the hub (Coach Donny's device integration, MLBB Women first).
--
-- An athlete opens a link from Coach Donny, signs in to Whoop (Whoop's own login: no password reaches the hub) and
-- the "whoop" server function pulls recovery, sleep, strain and HRV every few hours.
--
-- Every table here is CLOSED to the website: row level security on, no policy, no grant to anon or authenticated.
-- Only the "whoop" server function (service role) reads and writes them, and it checks who is asking:
--   * Coach Donny, the Head Coach, admins (can_support_read): every number, invite links, sync, disconnect;
--   * a coach of that title (can_read_title): recovery % and sleep hours only.
-- Tokens are encrypted by the function before they are stored.

create table public.wearable_config (
  id int primary key default 1 check (id = 1),
  client_id text,
  client_secret_enc text,           -- encrypted by the function
  cron_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.wearable_config (id) values (1) on conflict do nothing;

create table public.wearable_invites (
  nonce text primary key check (length(nonce) between 16 and 80),
  title text not null references public.disciplines (id),
  athlete text not null check (length(athlete) between 1 and 120),
  state text unique check (state is null or length(state) = 8),   -- Whoop wants an 8-character state
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);

create table public.wearable_links (
  title text not null references public.disciplines (id),
  athlete text not null check (length(athlete) between 1 and 120),
  vendor text not null default 'whoop' check (vendor in ('whoop')),
  vendor_user text,
  tokens_enc text not null,
  access_expires_at timestamptz,
  needs_reconnect boolean not null default false,
  connected_at timestamptz not null default now(),
  last_sync timestamptz,
  last_error text,
  primary key (title, athlete, vendor)
);

create table public.wearable_days (
  title text not null references public.disciplines (id),
  athlete text not null,
  vendor text not null default 'whoop',
  day date not null,
  data jsonb not null,               -- recovery, hrv, rhr, spo2, sleepMin, inBedMin, sleepPerf, strain, mid, calibrating
  updated_at timestamptz not null default now(),
  primary key (title, athlete, vendor, day)
);
create index on public.wearable_days (day);

alter table public.wearable_config enable row level security;
alter table public.wearable_invites enable row level security;
alter table public.wearable_links enable row level security;
alter table public.wearable_days enable row level security;
revoke all on public.wearable_config, public.wearable_invites, public.wearable_links, public.wearable_days from public, anon, authenticated;

-- Every 3 hours the database asks the function to pull new Whoop data for every connected athlete.
-- pg_cron and pg_net are Supabase extensions; the function URL is this project's.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('whoop-sync', '17 */3 * * *', $cron$
  select net.http_post(
    url := 'https://cwedqaupevboyzuxvdto.supabase.co/functions/v1/whoop',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', (select cron_secret from public.wearable_config where id = 1)),
    body := '{"action":"sync_all"}'::jsonb,
    timeout_milliseconds := 60000)
$cron$);
