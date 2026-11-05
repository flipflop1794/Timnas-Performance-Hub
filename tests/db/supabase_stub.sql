-- Minimal stand-in for the parts of Supabase the migrations rely on, so RLS can be tested on plain Postgres.
-- Mirrors Supabase: roles anon / authenticated / service_role, auth.users, auth.uid() read from the JWT claims.
-- Roles are cluster-wide and test files run in parallel: tolerate another file creating them first.
do $$ begin create role anon nologin noinherit; exception when duplicate_object or unique_violation then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object or unique_violation then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object or unique_violation then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
