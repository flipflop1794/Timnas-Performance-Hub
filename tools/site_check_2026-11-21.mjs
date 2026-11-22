// V1.38: ships the 21 Nov 2026 re-read of the wec.iesf.org team pages (tools/raw_rosters_2026-11-21.txt) as a dated check on
// every rival team in data/wec/rival_rosters.json (who joined, who left, captain, coach), and adds the eFootball players
// (one per nation), which the 3 Nov read left out. Earlier reads and checks are kept: nothing is overwritten.
// Run once: node tools/site_check_2026-11-21.mjs   (running it again does not add a second 21 Nov check).
import { readFileSync, writeFileSync } from 'node:fs';

const DATE = '2026-11-21';
const BY = 'Hub (re-read from the IESF site)';
const TITLE = { 'Counter-Strike 2': 'CS2', 'Counter-Strike Women': 'CS2 Women', 'Dota 2': 'Dota 2', 'eFootball™': 'eFootball', 'Mobile Legends: Bang Bang': 'MLBB', 'Mobile Legends: Bang Bang Women': 'MLBB Women', 'PUBG MOBILE': 'PUBG Mobile' };

export function parseRead(text) {
  const out = []; let code, nation;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('# ')) continue;
    if (line.startsWith('#')) { [code, nation] = line.slice(1).trim().split('|'); continue; }
    const [t, players, coachPart] = line.split(' :: ');
    const title = TITLE[t.trim()]; if (!title) throw new Error(`Unknown title in read: ${t}`);
    out.push({ code, nation, title, names: players.split(' ; ').map((x) => x.trim()).filter(Boolean), coach: coachPart ? coachPart.replace(/^coach=/, '').trim() : null });
  }
  return out;
}

const file = new URL('../data/wec/rival_rosters.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const read = parseRead(readFileSync(new URL('./raw_rosters_2026-11-21.txt', import.meta.url), 'utf8'));
const current = (t) => { const last = [...(t.checks || [])].reverse().find((c) => Array.isArray(c.names)); return last ? last.names.map((n) => n.replace(/^\*/, '')) : t.players.map((p) => p.ign); };
const report = [];
for (const r of read) {
  if (r.nation === 'Indonesia') continue; // rivals only; our own squads live in src/core/people.js
  let team = data.teams.find((t) => t.title === r.title && t.nation === r.nation);
  if (!team) {
    if (r.title !== 'eFootball') { report.push(`NEW TEAM (not in the 3 Nov read): ${r.title} ${r.nation}`); }
    team = { title: r.title, nation: r.nation, code: r.code, coach: r.coach, read: DATE, players: r.names.map((n) => ({ ign: n.replace(/^\*/, ''), captain: n.startsWith('*'), flags: [] })), checks: [] };
    data.teams.push(team); continue;
  }
  if ((team.checks || []).some((c) => c.date === DATE)) continue;
  const before = current(team); const now = r.names.map((n) => n.replace(/^\*/, ''));
  const added = now.filter((n) => !before.includes(n)), removed = before.filter((n) => !now.includes(n));
  const lastCoach = [...(team.checks || [])].reverse().find((c) => c.coach)?.coach || team.coach;
  const check = { date: DATE, by: BY, names: r.names };
  // A coach the 3 Nov read did not catch is filled in, not reported as a change.
  if (r.coach && !lastCoach) team.coach = r.coach;
  else if (r.coach && r.coach !== lastCoach) check.coach = r.coach;
  team.checks = [...(team.checks || []), check];
  if (added.length || removed.length || check.coach) report.push(`${r.title} ${r.nation}: +[${added.join(', ')}] -[${removed.join(', ')}]${check.coach ? ` coach ${lastCoach} → ${check.coach}` : ''}`);
}
data.method = 'Team pages read 3 Nov with an automated page reader (eFootball not included then); re-read 13 Nov and 21 Nov (structured read of every page, eFootball added).';
data.reads = ['2026-11-03', '2026-11-13', DATE];
writeFileSync(file, JSON.stringify(data, null, 1));
const by = {}; for (const t of data.teams) by[t.title] = (by[t.title] || 0) + 1;
console.log(by); console.log(report.join('\n') || 'no changes');
