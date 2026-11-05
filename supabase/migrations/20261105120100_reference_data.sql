-- Reference data: the seven WEC 2026 titles and the rosters published on wec.iesf.org / in the decision log.
insert into public.disciplines (id, short_name, sort_order) values
  ('Dota 2', 'Dota', 1), ('MLBB', 'MLBB', 2), ('MLBB Women', 'MLBB W', 3), ('PUBG Mobile', 'PUBGM', 4),
  ('eFootball', 'eFb', 5), ('CS2', 'CS2', 6), ('CS2 Women', 'CS2 W', 7)
on conflict (id) do nothing;

-- Roster rows are written by staff through the app; the seed has no author.
insert into public.roster_players (title, ign, sort_order) values
  ('Dota 2', 'Whitemon', 0), ('Dota 2', 'Fbz', 1), ('Dota 2', 'Jhocam', 2), ('Dota 2', 'jikroy', 3), ('Dota 2', 'Mikoto', 4),
  ('PUBG Mobile', 'AKxSatarrrGOLD', 0), ('PUBG Mobile', 'AKxAmetzGOLD', 1), ('PUBG Mobile', 'AKxVinzGOLD', 2), ('PUBG Mobile', 'AKxZaoo7GOLD', 3),
  ('MLBB', 'Aran', 0), ('MLBB', 'Kevin', 1), ('MLBB', 'Drichel', 2), ('MLBB', 'Lyoni', 3), ('MLBB', 'Jull.', 4),
  ('eFootball', 'ELGA', 0)
on conflict do nothing;
