// V1.20 coach AI: number checks, weakness tracker, weekly summary, preparation packs, PUBGM screenshots, hero pools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedNumbers, checkLine, numbersIn } from '../src/core/ai_check.js';
import { cleanTags, tagRecord, untagged, weaknessCounts, tagsOf } from '../src/core/weakness.js';
import { summaryMaterial, briefFromAi, publishBrief, briefFlagged, prepMaterial, packFromAi, packSessions } from '../src/core/coach_ai.js';
import { proposeBr, brRows } from '../src/pubgm/screenshot.js';
import { proposeGame, heroIndex } from '../src/core/capture.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

const rep = (id, title, date, failed, extra = {}) => ({ id, title, date, failed, adjust: 'a', progress: 3, partner: 'Team Q', result: { mode: 'wl', won: 1, lost: 2, drawn: 0 }, createdAt: `${date}T10:00:00Z`, origin: 'operational', ...extra });

test('numbers: only numbers that are in the material pass', () => {
  const ok = allowedNumbers({ a: 63, b: '2-1 vs X', c: [{ d: 4.5 }] });
  assert.deepEqual(numbersIn('63 and 2-1, 4.5'), ['63', '2', '1', '4.5']);
  assert.ok(checkLine('Kualitas latihan 63, rekor 2-1', ok).ok);
  const bad = checkLine('naik 12 poin', ok); assert.equal(bad.ok, false); assert.deepEqual(bad.bad, ['12']);
});

test('weaknesses: only listed labels; counts, flag at 3, rising against the window before', () => {
  assert.deepEqual(cleanTags('MLBB', ['vision', 'made up', 'vision', 'draft', 'rotation', 'teamfight']), ['vision', 'draft', 'rotation']);
  assert.ok(tagsOf('PUBG Mobile').includes('zone timing')); assert.deepEqual(tagsOf('Unknown'), []);
  const reports = ['2026-11-18', '2026-11-17', '2026-11-12', '2026-11-01'].map((d, i) => rep(`R${i}`, 'MLBB', d, 'late vision'));
  const rows = reports.map((r) => tagRecord(r, ['vision'], { by: 'AI', source: 'ai' }));
  const [v] = weaknessCounts(rows, 'MLBB', '2026-11-19', 14);
  assert.deepEqual([v.tag, v.n, v.prev, v.flagged, v.rising], ['vision', 3, 1, true, true]);
  assert.deepEqual(untagged([...reports, rep('R9', 'MLBB', '2026-11-19', 'x'), rep('R8', 'MLBB', '2026-11-19', '')], rows, 'MLBB').map((r) => r.id), ['R9']);
});

test('weekly summary: figures in, unchecked numbers marked and left out when published', () => {
  const state = { titles: ['MLBB', 'eFootball'], scrims: [], cycle: [], wecMatches: [{ title: 'MLBB', date: '2026-12-16', opponent: 'Malaysia' }], tags: [],
    reports: [rep('R1', 'MLBB', '2026-11-18', 'x', { result: { mode: 'wl', won: 2, lost: 1, drawn: 0 } })] };
  const m = summaryMaterial(state, '2026-11-19', { start: '2026-12-15', end: '2026-12-20' });
  assert.equal(m.days_to_wec, 26); assert.equal(m.titles[0].record_7d, '2-1'); assert.equal(m.titles[1].record_7d, 'no report');
  const b = briefFromAi({ headline: '26 hari menuju WEC.', titles: [{ title: 'MLBB', line: 'Rekor 2-1.' }, { title: 'Fake', line: 'x' }], attention: ['MLBB naik 40 persen.'], next_week: [] }, m, 'Fayad');
  assert.equal(b.titles.length, 1, 'unknown titles dropped'); assert.equal(briefFlagged(b), 1); assert.equal(b.attention[0].ok, false);
  const pub = publishBrief(b, { by: 'Fayad' });
  assert.equal(pub.status, 'published'); assert.equal(pub.attention.length, 0); assert.equal(pub.titles.length, 1);
});

test('preparation pack: sources must exist, scrims only with bank partners within the days left; sessions from an approved pack', () => {
  const match = { id: 'WM-1', title: 'MLBB', opponent: 'Malaysia', date: '2026-11-25', stage: 'Group' };
  const material = prepMaterial({ match, asOf: '2026-11-19', card: { tier: 'A', observed: [{ note: 'Fast lord at 8' }] }, standIn: { n: 6, won: 2, lost: 4, partners: ['Team Q'], lowSample: false, bansAgainst: [] },
    weaknesses: [{ tag: 'vision', n: 4, rising: true }], reports: [rep('RP-1', 'MLBB', '2026-11-18', 'late vision')], partners: [{ name: 'Team Q', level: 'Tier 2', resembles: 'Malaysia' }] });
  assert.equal(material.MATCH.days_left, 6); assert.equal(material.CARD[1].id, 'CO1'); assert.equal(material.WEAKNESSES[0].id, 'W1');
  const pack = packFromAi({ summary: 'They take lord early (8).', their_tendencies: [{ text: 'Fast lord', sources: ['CO1'] }, { text: 'Invented', sources: ['ZZ'] }],
    our_focus: [{ focus: 'Vision before lord', drill: 'Ward 30 s before', measure: 'Lord fights with vision', sources: ['W1', 'RP-1'] }],
    scrims: [{ day: 2, partner: 'Team Q', focus: 'Vision before lord' }, { day: 9, partner: 'Team Q', focus: 'x' }, { day: 3, partner: 'Unknown team', focus: 'x' }, { day: 4, partner: 'internal', focus: 'Vision before lord' }], watch_out: [] }, material, match, 'Coach Indra');
  assert.equal(pack.summary.ok, true); assert.equal(pack.tendencies.length, 1); assert.equal(pack.scrims.length, 2);
  assert.throws(() => packSessions(pack, { asOf: '2026-11-19', owner: 'x' }), /Approve the pack first/);
  const s = packSessions({ ...pack, status: 'approved' }, { asOf: '2026-11-19', owner: 'Coach Indra' });
  assert.deepEqual(s.map((x) => [x.date, x.kind, x.partner, x.mirrors, x.drill]), [['2026-11-21', 'scrim', 'Team Q', 'Malaysia', 'Ward 30 s before'], ['2026-11-23', 'team practice', '', '', 'Ward 30 s before']]);
});

test('PUBG Mobile screenshot: values checked, then match-log rows that pass the log validator', () => {
  const p = proposeBr({ screen_kind: 'team_result', readable: true, map: 'erangel', placement: 3, team_kills: -1, players: [{ name_seen: 'A', kills: 4, damage: 520, survived_seconds: 1500, uncertain: false }, { name_seen: 'B', kills: 2, damage: 300, survived_seconds: 1400, uncertain: true }], lobby: [], notes: '' });
  assert.deepEqual([p.map, p.placement, p.kills, p.survivalS], ['Erangel', 3, 6, 1500]);
  assert.ok(p.issues.some((i) => /unsure/.test(i.text)));
  assert.equal(proposeBr({ screen_kind: 'other', readable: false }).issues[0].level, 'block');
  const rows = brRows({ matchId: 'S-1', date: '2026-11-19', map: 'Erangel', ours: { placement: 3, kills: 6, survivalS: 1500 }, lobby: [{ rank: 1, team: 'RRQ', kills: 9 }, { rank: 3, team: 'dup', kills: 1 }] });
  assert.deepEqual(rows.map((r) => [r.team, r.placement, r.elims]), [['INA', 3, 6], ['RRQ', 1, 9]]);
  assert.throws(() => brRows({ matchId: 'S', date: 'd', map: '', ours: { placement: 3, kills: 1 } }), /Pick the map/);
  assert.throws(() => brRows({ matchId: 'S', date: 'd', map: 'Erangel', ours: { placement: 0, kills: 1 } }), /Placement/);
});

test('hero reading: an unsure hero is filled from the player\'s pool when exactly one candidate is in it, and stays flagged', () => {
  const heroes = heroIndex(HEROES.mlbb.map((name) => ({ name })));
  const pl = (name, hero, cands) => ({ side: 'left', slot: 1, name_seen: name, hero, hero_sure: false, hero_candidates: cands, kills: 1, deaths: 1, assists: 1, gold: 1000, rating: 7, hero_damage: -1, damage_taken: -1, tower_damage: -1, last_hits: -1, denies: -1, gpm: -1, xpm: -1, mvp: false, uncertain_fields: [] });
  const raw = { screen_kind: 'result', readable: true, outcome: 'victory', duration_seconds: 900, score: { left: 10, right: 5 }, team_names: { left: '', right: '' }, notes: '',
    players: [pl('Aran', 'Ling', ['Ling', 'Fanny']), pl('Kevin', 'Ling', ['Ling', 'Fanny'])] };
  const g = proposeGame({ title: 'MLBB', raw, roster: ['Aran', 'Kevin'], heroes, pools: { Aran: ['Fanny', 'Lancelot'] } });
  const [a, k] = g.players;
  assert.equal(a.hero, 'Fanny'); assert.match(a.flags.find((f) => f.field === 'hero').reason, /hero pool/);
  assert.equal(k.hero, '', 'no pool: left for the coach');
});

test('scrim-ai: summary only for those who write every title (usage title empty); tags use the title list; br_result is PUBG Mobile only', async () => {
  const calls = []; const inserts = [];
  const mk = (canWrite) => ({ env: { ANTHROPIC_API_KEY: 'k' }, uuid: () => 'u', now: () => new Date('2026-11-19T05:00:00Z'), heroes: HEROES, sleep: async () => {},
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: '{"reports":[]}' }], stop_reason: 'end_turn', usage: {} }) }; },
    clientFor: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x' } }, error: null }) }, rpc: async (fn, a) => ({ data: fn === 'can_write_title' ? canWrite(a.t) : 0, error: null }), from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) }) });
  const call = (deps, body) => handle({ method: 'POST', headers: { authorization: 'Bearer t' }, json: async () => body }, deps);
  assert.equal((await call(mk((t) => t !== null), { action: 'summary', title: '', material: { titles: [{ title: 'MLBB' }] } })).status, 403, 'a title coach cannot');
  assert.equal((await call(mk(() => true), { action: 'summary', title: '', material: { titles: [{ title: 'MLBB' }] } })).status, 200);
  assert.equal(inserts.at(-1).title, null);
  await call(mk(() => true), { action: 'tags', title: 'PUBG Mobile', reports: [{ id: 'R1', failed: 'late rotation' }] });
  assert.deepEqual(calls.at(-1).output_config.format.schema.properties.reports.items.properties.tags.items.enum, tagsOf('PUBG Mobile'));
  assert.match((await call(mk(() => true), { action: 'br_result', title: 'MLBB', image: { data: 'x' } })).body.error, /PUBG Mobile/);
});
