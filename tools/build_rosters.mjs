// Turns the wec.iesf.org team-page reads (tools/raw_rosters.txt, 3 Nov 2026) into data/wec/rival_rosters.json.
// Pages were read through an automated page reader; spellings marked for checking must be verified on the site.
import { readFileSync, writeFileSync } from 'node:fs';
const TITLE = { 'Counter-Strike 2': 'CS2', 'Counter-Strike Women': 'CS2 Women', 'Dota 2': 'Dota 2', 'Mobile Legends: Bang Bang': 'MLBB', 'Mobile Legends: Bang Bang Women': 'MLBB Women', 'PUBG MOBILE': 'PUBG Mobile' };
const GLUED = new Set(['EGY', 'COL', 'POL']); // the page text joined the "Player"/"Coach" label to the name
const teams = {}; let code, nation;
for (const line of readFileSync(new URL('./raw_rosters.txt', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  if (line.startsWith('#')) { [code, nation] = line.slice(1).split('|'); continue; }
  const [t, role, raw, cap] = line.split(' | ').map((x) => x.trim());
  const title = TITLE[t]; const key = `${title}|${nation}`;
  const tm = (teams[key] ||= { title, nation, code, coach: null, players: [], checks: [] });
  let name = raw; const flags = [];
  if (GLUED.has(code)) { const s = name.replace(role === 'coach' ? /Coach$/ : /Player$/, ''); if (s !== name) { name = s; tm.note = 'The page reader joined the word "Player"/"Coach" to each name; removed. Check spellings on the site.'; } }
  if (name === 'Hanka-') flags.push('Trailing "-" may be part of the tag or left over from the label; check on the site.');
  if (['JunnJose Ortiz', 'INSTNCTElio Olivero', 'Ricky.Ricky Consuegra'].includes(name)) flags.push('Tag and real name run together on the site (decision log v6); tag uncertain.');
  if (code === 'CAM' && name === 'PPPPPP') flags.push('Read as six P\'s on 3 Nov; decision log v6 recorded five ("PPPPP"). Check on the site.');
  if (role === 'coach') tm.coach = name;
  else tm.players.push({ ign: name, captain: cap === 'yes', flags });
}
const mgl = JSON.parse(readFileSync(new URL('../data/dota/opp_MGL.json', import.meta.url), 'utf8'));
for (const p of teams['Dota 2|Mongolia'].players) { const r = mgl.roster.find((x) => x.ign === p.ign); if (r?.club) p.club = r.club; if (r?.account) { p.account = String(r.account); p.accountNote = r.match_status || 'OpenDota proPlayers, name + country'; } else if (r) p.flags.push(`OpenDota account: ${r.match_status}`); }
// Team names as listed on each OpenDota pro profile (3 Nov 2026).
const CLUB = { 'Greece|Focus': 'JustBetter', 'Greece|Skylark': 'JustBetter', 'Greece|SsaSpartan-': 'JustBetter (probable)', 'Venezuela|Shy': 'BIZ GAMING', 'Argentina|Hermit': 'Working Hard Team', 'Kazakhstan|Shakh': 'Tengri eSports', 'Belarus|Miyaoo': 'VP.Prodigy', 'Belarus|young G': 'Nemiga Gaming (probable)', 'North Macedonia|Stojkov': 'Inner Circle x Insanity', 'New Zealand|Fury': 'Team Essence' };
const pools = JSON.parse(readFileSync(new URL('../data/wec/rival_dota_pools.json', import.meta.url), 'utf8'));
for (const [k, v] of Object.entries(pools.players)) { const [nat, ign] = k.split('|'); const p = teams[`Dota 2|${nat}`].players.find((x) => x.ign === ign); p.account = String(v.account); p.accountNote = v.note; if (CLUB[k]) p.club = CLUB[k]; else if (/club ([^—]+?) —/.test(v.note)) p.club = v.note.match(/club ([^—]+?) —/)[1]; if (/^probable/.test(v.note)) p.flags.push('OpenDota account is a probable match; verify before relying on the hero pool.'); }
const out = { source: 'wec.iesf.org/editions/wec-2026/teams/{code}', read: '2026-11-03', method: 'Each team page read with an automated page reader; eFootball not included.', teams: Object.values(teams) };
writeFileSync(new URL('../data/wec/rival_rosters.json', import.meta.url), JSON.stringify(out, null, 1));
const by = {}; for (const t of out.teams) by[t.title] = (by[t.title] || 0) + 1;
console.log(out.teams.length, by, out.teams.flatMap((t) => t.players.filter((p) => p.flags.length).map((p) => `${t.nation}:${p.ign}`)).join(', '));
