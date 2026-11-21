-- V1.39: the MLBB Women roster (IESF WEC 2026 national team, as in src/core/people.js), so the player
-- choices on the scrim game screen are filled for that division too. Rows staff already entered stay.
insert into public.roster_players (title, ign, sort_order) values
  ('MLBB Women', 'Cinnyyy', 0), ('MLBB Women', 'Chel', 1), ('MLBB Women', 'Fumi Eko', 2), ('MLBB Women', 'Vival', 3), ('MLBB Women', 'Vivian', 4)
on conflict do nothing;
