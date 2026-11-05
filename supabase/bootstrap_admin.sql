-- Run ONCE in the Supabase SQL Editor after you have signed in to the hub (or been invited) with your own email.
-- Replace the email below with yours. It makes that account the first admin and links it to Aufa's staff routing.
-- After this, manage every other person from the hub: Staff → Users & access.

do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower('REPLACE_WITH_YOUR_EMAIL');
  if uid is null then raise exception 'No account with that email yet: invite or sign in first (Authentication → Users).'; end if;
  insert into public.profiles (id, email, display_name) select uid, email, 'Aufa Bassam' from auth.users where id = uid on conflict (id) do nothing;
  update public.profiles set staff_key = 'aufa', display_name = 'Aufa Bassam' where id = uid;
  insert into public.user_roles (user_id, role) values (uid, 'admin'), (uid, 'assistant_coach') on conflict do nothing;
  insert into public.user_titles (user_id, title) values (uid, 'Dota 2'), (uid, 'MLBB') on conflict do nothing;
end $$;
