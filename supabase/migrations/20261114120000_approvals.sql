-- V1.16 — approvals and attribution enforced by the database (audit H1, H2).
-- Only ADDS or REPLACES functions, triggers and one policy; no table, column or row is changed or deleted.
--
--   * Who approves: the Head Coach, admins and every assistant coach, for every title (decided 12 Nov 2026).
--   * Draft books and opponent cards: "approved" can only be set through approve_record(), which records the
--     signed-in approver (never a typed name) and refuses the writer of the version.
--   * Coaching objectives: reviews, sessions and decisions are history (append-only). A new review or decision
--     is stamped with the signed-in person's name and id. Changing the drill / success criterion, or the
--     status without a decision, is for approvers only.
--   * Display names: only an admin may change them (they are what the screens show as "who").

-- ---------------------------------------------------------------- who approves
create or replace function public.can_approve(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('head_coach') or public.has_role('assistant_coach')
$$;

-- Assistant coaches review objectives of every title, including titles they are not assigned to for writing.
create policy review on public.coaching_objectives for update to authenticated
  using (public.can_approve(title)) with check (public.can_approve(title));

-- The signed-in person's name as staff see it.
create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(display_name), ''), email) from public.profiles where id = auth.uid()
$$;

-- true when array a is the start of array b (null counts as empty).
create or replace function public.jsonb_prefix(a jsonb, b jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(coalesce(a, '[]')) <> 'array' or jsonb_typeof(coalesce(b, '[]')) <> 'array' then false
    when jsonb_array_length(coalesce(b, '[]')) < jsonb_array_length(coalesce(a, '[]')) then false
    else coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(coalesce(b, '[]')) with ordinality as x(e, i)
                   where i <= jsonb_array_length(coalesce(a, '[]'))), '[]'::jsonb) = coalesce(a, '[]'::jsonb)
  end
$$;

-- Stamp entries n.. of a jsonb array with the signed-in person.
create or replace function public.stamp_entries(arr jsonb, n int, name_key text, id_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i int; who text := public.my_name();
begin
  for i in n .. coalesce(jsonb_array_length(arr), 0) - 1 loop
    arr := jsonb_set(arr, array[i::text], (arr -> i) || jsonb_build_object(name_key, who, id_key, auth.uid()::text));
  end loop;
  return arr;
end $$;

-- ---------------------------------------------------------------- coaching objectives
-- Replaces the V1.11 guard (same trigger, same function name).
create or replace function public.guard_objective_decision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  decided text[] := array['accepted', 'modified', 'rejected'];
  old_data jsonb := case when tg_op = 'UPDATE' then old.data end;
  approver boolean;
  k text; n int;
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;  -- SQL Editor / importer
  -- INSERT ... ON CONFLICT DO UPDATE fires this BEFORE INSERT first: compare with the stored row, if any.
  if tg_op = 'INSERT' then select data into old_data from public.coaching_objectives where id = new.id; end if;
  approver := public.can_approve(new.title);

  foreach k in array array['reviews', 'sessions', 'decisions'] loop
    if not public.jsonb_prefix(old_data -> k, new.data -> k) then
      raise exception 'Reviews, sessions and decisions are history: they cannot be changed or removed, only added.' using errcode = '42501';
    end if;
  end loop;

  if (new.data ->> 'status') = any (decided) and (new.data ->> 'status') is distinct from (old_data ->> 'status') and not approver then
    raise exception 'Only the Head Coach or an assistant coach can approve or reject a proposal for %.', new.title using errcode = '42501';
  end if;

  n := coalesce(jsonb_array_length(old_data -> 'reviews'), 0);
  if coalesce(jsonb_array_length(new.data -> 'reviews'), 0) > n then
    if not approver then
      raise exception 'Only the Head Coach or an assistant coach can review a proposal for %.', new.title using errcode = '42501';
    end if;
    new.data := jsonb_set(new.data, '{reviews}', public.stamp_entries(new.data -> 'reviews', n, 'reviewer', 'reviewerId'));
  end if;

  n := coalesce(jsonb_array_length(old_data -> 'decisions'), 0);
  if coalesce(jsonb_array_length(new.data -> 'decisions'), 0) > n then
    new.data := jsonb_set(new.data, '{decisions}', public.stamp_entries(new.data -> 'decisions', n, 'by', 'byId'));
  end if;

  if old_data is not null and not approver then
    if (new.data -> 'objective') is distinct from (old_data -> 'objective') then
      raise exception 'Only the Head Coach or an assistant coach can change the drill or success criterion of an objective.' using errcode = '42501';
    end if;
    -- Outside a review, the status moves only with a recorded decision (continue / adjust / retire / gather evidence).
    if (new.data ->> 'status') is distinct from (old_data ->> 'status')
       and coalesce(jsonb_array_length(new.data -> 'decisions'), 0) = coalesce(jsonb_array_length(old_data -> 'decisions'), 0) then
      raise exception 'Only the Head Coach or an assistant coach can change the status without a recorded decision.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- draft books and opponent cards
-- An approved version can only come from approve_record(). Saving a changed version keeps it a draft.
create or replace function public.guard_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare old_data jsonb := case when tg_op = 'UPDATE' then old.data end;
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;
  if current_setting('hub.approving', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then execute format('select data from public.%I where id = $1', tg_table_name) into old_data using new.id; end if;
  if coalesce(new.data ->> 'status', '') = 'approved' and old_data is distinct from new.data then
    raise exception 'Approval is recorded with the Approve button by the Head Coach or an assistant coach; a changed version is saved as a draft.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger c_guard_approval before insert or update on public.draft_books for each row execute function public.guard_approval();
create trigger c_guard_approval before insert or update on public.opponent_cards for each row execute function public.guard_approval();

create or replace function public.approve_record(p_table text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; res jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if p_table not in ('draft_books', 'opponent_cards') then raise exception 'This record type has no approval.' using errcode = '22023'; end if;
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

-- ---------------------------------------------------------------- display names
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;  -- SQL Editor / bootstrap
  if not public.has_role('admin') and (new.staff_key is distinct from old.staff_key or new.email is distinct from old.email
                                       or new.display_name is distinct from old.display_name) then
    raise exception 'Only an admin can change the name, staff link or email.' using errcode = '42501';
  end if;
  new.id := old.id; new.created_at := old.created_at; return new;
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.approve_record(text, text), public.my_name(), public.jsonb_prefix(jsonb, jsonb),
  public.stamp_entries(jsonb, int, text, text), public.guard_approval() from public, anon;
grant execute on function public.approve_record(text, text), public.my_name() to authenticated;
