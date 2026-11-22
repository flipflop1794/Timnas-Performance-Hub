-- V1.41 — Close five database functions to visitors who are not signed in. Run this whole file once in Supabase → SQL Editor.
-- Same content as supabase/migrations/20261204120000_function_access.sql. Safe to run twice.
begin;
-- V1.39 — close database functions to visitors who are not signed in.
--
-- Supabase grants the anon role (anyone with the public site key, not signed in) EXECUTE on every new function and
-- full rights on every new table by default. Each migration since V1.11 revoked tables from anon by hand, but five
-- functions added in V1.30–V1.36 kept the default: can_support_read, can_support_write, log_edit, support_summary,
-- title_from_slug. None returned data to a visitor (each checks the signed-in user), but none should be callable.
--
-- 1. Revoke EXECUTE on those five from public and anon; signed-in users keep it (RLS policies call them).
-- 2. Change the default for objects the postgres role creates from now on: no rights for anon on new functions,
--    tables or sequences. Signed-in users keep their defaults.
-- 3. Pin search_path on block_update and jsonb_prefix (Supabase advisor "function search path mutable").
revoke execute on function public.can_support_read(), public.can_support_write(), public.log_edit(),
  public.support_summary(date, date), public.title_from_slug(text) from public, anon;
grant execute on function public.can_support_read(), public.can_support_write(), public.log_edit(),
  public.support_summary(date, date), public.title_from_slug(text) to authenticated;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

alter function public.block_update() set search_path = public;
alter function public.jsonb_prefix(jsonb, jsonb) set search_path = public;
commit;
