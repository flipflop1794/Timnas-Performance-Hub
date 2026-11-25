-- V1.59 — daily check-in ("daily login") for the streaks and milestones of the support staff and coaches.
--
-- hub_checkins: one row per person per day (Jakarta date): the first time that day the person opens the hub signed in.
-- Nothing else is stored (no time of each visit, no device, no page). Each person writes only their own row, only for
-- today (or yesterday, for a clock near midnight); rows are never changed or deleted by the website.
-- Read: your own rows; the Head Coach team (admins, Head Coach, readiness owner) reads everyone's, for the streaks next
-- to each name.

create table public.hub_checkins (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index on public.hub_checkins (day);
alter table public.hub_checkins enable row level security;
create policy read on public.hub_checkins for select to authenticated using (user_id = auth.uid() or public.can_support_read());
create policy add on public.hub_checkins for insert to authenticated with check (
  user_id = auth.uid() and public.is_staff()
  and day between (now() at time zone 'Asia/Jakarta')::date - 1 and (now() at time zone 'Asia/Jakarta')::date);
revoke all on public.hub_checkins from anon, authenticated;
grant select on public.hub_checkins to authenticated;
-- Only the day is sent; who and when are set by the database.
grant insert (day) on public.hub_checkins to authenticated;
