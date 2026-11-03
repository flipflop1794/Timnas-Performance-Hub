// Rival rosters and player tracker. Seeded from the wec.iesf.org team pages (read 3 Nov 2026);
// staff add roles, clubs and game accounts, and record a weekly check against the site.

const need = (c, m) => { if (!c) throw new Error(m); };
export const CHECK_EVERY_DAYS = 7;
export const ACCOUNT_KIND = { 'Dota 2': 'OpenDota account ID', MLBB: 'MLBB game ID', 'MLBB Women': 'MLBB game ID', 'PUBG Mobile': 'PUBG Mobile character ID', CS2: 'Steam / HLTV / FACEIT profile', 'CS2 Women': 'Steam / HLTV / FACEIT profile', eFootball: 'eFootball ID' };
export const ROLE_HINT = { 'Dota 2': 'pos 1–5', MLBB: 'EXP, Jungle, Mid, Gold, Roam', 'MLBB Women': 'EXP, Jungle, Mid, Gold, Roam', 'PUBG Mobile': 'IGL, fragger, support, scout', CS2: 'IGL, AWP, entry, support, lurk', 'CS2 Women': 'IGL, AWP, entry, support, lurk', eFootball: '' };
export const rosterKey = (title, nation) => `${title}|${nation}`;

export function seedRosters(data) {
  const out = {};
  for (const t of data.teams) {
    out[rosterKey(t.title, t.nation)] = { title: t.title, nation: t.nation, code: t.code, coach: t.coach, note: t.note || '',
      players: t.players.map((p) => ({ ign: p.ign, captain: !!p.captain, role: '', club: p.club || '', account: p.account || '', accountNote: p.accountNote || '', note: '', flags: [...(p.flags || [])] })),
      checks: [{ date: data.read, by: 'Hub (read from the IESF site)', result: 'seeded', added: [], removed: [] }], origin: 'operational' };
  }
  return out;
}
// Staff edits replace the seeded record for that team (stored whole, so history travels with it).
export const effective = (seed, edits, key) => edits[key] || seed[key] || null;

export function editPlayers(team, updates, by) {
  need(by && by.trim(), 'Who edited it is required.');
  const players = team.players.map((p) => {
    const u = updates[p.ign]; if (!u) return p;
    const n = { ...p };
    for (const k of ['role', 'club', 'account', 'note']) if (u[k] !== undefined) n[k] = String(u[k]).trim();
    if (u.account !== undefined && n.account !== p.account) n.accountNote = n.account ? `entered by ${by.trim()}` : '';
    if (/\d{9,}/.test(n.note)) throw new Error(`Note for ${p.ign} looks like a phone or ID number; keep personal contact details out.`);
    return n;
  });
  return { ...team, players, editedBy: by.trim(), editedAt: new Date().toISOString() };
}

// Weekly check: paste or type the names as they appear on the IESF page today.
export function recordCheck(team, { date, by, names }) {
  need(by && by.trim(), 'Who checked it is required.');
  need(date, 'Date is required.');
  const list = (names || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  need(list.length, 'Enter the names listed on the site today.');
  const cur = team.players.map((p) => p.ign);
  const added = list.filter((x) => !cur.includes(x)), removed = cur.filter((x) => !list.includes(x));
  const result = added.length || removed.length ? 'changed' : 'no change';
  const players = [...team.players.filter((p) => !removed.includes(p.ign)), ...added.map((ign) => ({ ign, captain: false, role: '', club: '', account: '', accountNote: '', note: '', flags: [`Added at the ${date} check — new to the roster.`] }))];
  return { ...team, players, checks: [...team.checks, { date, by: by.trim(), result, added, removed }] };
}
export function checkStatus(team, today) {
  const last = team.checks.at(-1);
  const days = Math.round((Date.parse(today) - Date.parse(last.date)) / 86400000);
  const changed = team.checks.filter((c) => c.result === 'changed');
  return { last, days, due: days >= CHECK_EVERY_DAYS, changed };
}

// Dota hero pools for rival players: OpenDota aggregates shipped with the hub (club tournament games since 7.41).
export function dotaPool(nation, ign, data) {
  const a = data.rivalPools?.players?.[`${nation}|${ign}`];
  const m = nation === 'Mongolia' ? data.opp?.MGL?.players?.[ign] : null;
  const src = a || m; if (!src || !src.n) return src ? { n: 0, heroes: [], note: a?.note || '' } : null;
  const lane = +Object.entries(src.lanes || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  return { n: src.n, w: src.w, lane, heroes: src.heroes.map(([hero, games, wins]) => ({ hero, games, wins })), note: a?.note || '', source: a ? data.rivalPools._source : data.opp.MGL._source };
}
