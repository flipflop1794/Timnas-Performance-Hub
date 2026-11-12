-- V1.18 — screenshot storage: how full it is, and which screenshots are past the 90-day retention (audit H3).
-- Adds two admin-only read functions. Nothing is deleted here: the admin page lists old files with these
-- functions, asks the admin to confirm, and removes them through the Storage API (the bucket's delete
-- policy already allows admins only). The confirmed games and their numbers stay; only the images go.
-- plpgsql, so this also loads on plain Postgres without the storage schema (the tests); calls need Storage.

create or replace function public.capture_storage() returns table (files int, bytes bigint, oldest timestamptz)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.has_role('admin') then raise exception 'Admins only.' using errcode = '42501'; end if;
  return query select count(*)::int, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, min(o.created_at)
    from storage.objects o where o.bucket_id = 'scrim-captures';
end $$;

create or replace function public.old_capture_files(days int default 90) returns setof text
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.has_role('admin') then raise exception 'Admins only.' using errcode = '42501'; end if;
  if days < 30 then raise exception 'Keep at least 30 days of screenshots.' using errcode = '22023'; end if;
  return query select o.name from storage.objects o
    where o.bucket_id = 'scrim-captures' and o.created_at < now() - days * interval '1 day'
    order by o.created_at limit 1000;
end $$;

revoke execute on function public.capture_storage(), public.old_capture_files(int) from public, anon;
grant execute on function public.capture_storage(), public.old_capture_files(int) to authenticated;
