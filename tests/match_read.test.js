import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeMatch, confirmMatch, matchResult, matchLine, readGameOf } from '../src/core/match_read.js';
import { teamTrends, playerTrends, period } from '../src/core/trends.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { matchResultSchema } from '../supabase/functions/_shared/scrim_spec.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

const stats = (o) => Object.fromEntries(['possession', 'shots', 'shots_on_target', 'passes', 'successful_passes', 'tackles', 'interceptions', 'fouls', 'offsides', 'corners', 'free_kicks', 'saves']
  .map((k) => [k, o[k] ? { home: o[k][0], away: o[k][1] } : { home: -1, away: -1 }]));

test('every title has a screenshot reader: MOBA capture, PUBG Mobile, and now eFootball and CS2', () => {
  assert.equal(readGameOf('eFootball'), 'efootball'); assert.equal(readGameOf('CS2'), 'cs2'); assert.equal(readGameOf('CS2 Women'), 'cs2'); assert.equal(readGameOf('MLBB'), null);
  assert.ok(matchResultSchema('efootball').properties.stats.properties.possession); assert.ok(matchResultSchema('cs2').properties.players);
  assert.throws(() => matchResultSchema('mlbb'), /No screenshot reading/);
});

test('eFootball: our side found from the name, values range-checked, penalties decide a draw', () => {
  const raw = { screen_kind: 'match_stats', readable: true, home_name: 'INA Timnas', away_name: 'MAS Elite', home_goals: 2, away_goals: 2, penalties: { home: 4, away: 3 },
    stats: stats({ possession: [55, 45], shots: [12, 9], shots_on_target: [6, 3], passes: [5000, 300] }), notes: '' };
  const p = proposeMatch({ title: 'eFootball', raw });
  assert.equal(p.ourSide, 'home'); assert.equal(p.stats.passes.home, null, '5000 passes is out of range: left empty'); assert.equal(p.stats.possession.away, 45);
  assert.ok(p.issues.some((i) => /out of range/.test(i.text)));
  const g = confirmMatch(p, { ourSide: 'home', ours: '2', theirs: '2', penOurs: '4', penTheirs: '3' });
  assert.equal(g.result, 'win'); assert.deepEqual(g.score, { ours: 2, theirs: 2 }); assert.deepEqual(g.stats.shots_on_target, { ours: 6, theirs: 3 });
  assert.match(matchLine(g), /^2-2 \(pen 4-3\) · possession 55% · on target 6-3$/);
  // Our side on the right: the coach picks it; numbers flip accordingly.
  const away = confirmMatch({ ...p, ourSide: '' }, { ourSide: 'away', ours: '2', theirs: '2' }); assert.equal(away.result, 'draw'); assert.deepEqual(away.stats.possession, { ours: 45, theirs: 55 });
  assert.throws(() => confirmMatch(p, { ourSide: '', ours: '1', theirs: '0' }), /Pick which side is ours/);
  assert.throws(() => confirmMatch(p, { ourSide: 'home', ours: '', theirs: '0' }), /Goals \(us\) must be a whole number/);
  const bad = proposeMatch({ title: 'eFootball', raw: { screen_kind: 'other', readable: false } }); assert.equal(bad.issues[0].level, 'block');
  const noside = proposeMatch({ title: 'eFootball', raw: { ...raw, home_name: 'Player1', away_name: 'Player2' } }); assert.equal(noside.ourSide, ''); assert.ok(noside.issues.some((i) => /Which side is ours/.test(i.text)));
});

test('CS2: our team found from the roster, unsure values flagged, rounds give the map result', () => {
  const pl = (team, name, k, d, a, adr) => ({ team, name_seen: name, kills: k, deaths: d, assists: a, adr, hs_pct: 40, mvps: 2, score: 50, uncertain: false });
  const raw = { screen_kind: 'scoreboard', readable: true, map: 'Mirage', team_a_name: 'Rivals', team_b_name: 'INA', rounds_a: 9, rounds_b: 13,
    players: [pl('a', 'zeus', 15, 18, 3, 70), pl('b', 'INA Ricky', 22, 12, 4, 95.4), pl('b', 'Fatur.INA', 18, 14, 6, 999)], notes: '' };
  const p = proposeMatch({ title: 'CS2', raw, roster: ['Ricky', 'Fatur'] });
  assert.equal(p.ourSide, 'b'); assert.equal(p.players[1].player, 'Ricky'); assert.equal(p.players[2].stats.adr, null); assert.equal(p.players[2].unsure, true);
  const g = confirmMatch(p, { ourSide: 'b', ours: '13', theirs: '9', map: 'Mirage' }, { gameNo: 1, captureIds: ['c1'] });
  assert.equal(g.result, 'win'); assert.equal(g.map, 'Mirage'); assert.deepEqual(g.players.map((x) => [x.team, x.player]), [['partner', ''], ['ours', 'Ricky'], ['ours', 'Fatur']]);
  assert.deepEqual(matchResult([g, { result: 'loss' }, { result: 'draw' }]), { won: 1, lost: 1, drawn: 1 });
});

test('Trends: eFootball team lines from read matches; CS2 players with K/D/A and ADR', () => {
  const W = period('2026-11-16', 1);
  const foot = [1, 2, 3, 4].map((i) => ({ title: 'eFootball', game: 'efootball', date: `2026-11-1${i}`, score: { ours: i, theirs: 1 }, stats: { possession: { ours: 50 + i, theirs: 50 - i }, shots_on_target: { ours: i + 2, theirs: 1 } } }));
  const t = teamTrends('eFootball', { reports: [], games: foot }, W);
  assert.deepEqual(t.map((m) => m.key), ['poss', 'sot'], 'goals come from the report rows (V1.31); screenshots add possession and shots'); assert.equal(t[0].nAfter, 4, 'all four matches fall inside the week');
  const cs = [{ title: 'CS2', game: 'cs2', date: '2026-11-15', players: [{ team: 'ours', player: 'Ricky', stats: { kills: 20, deaths: 10, assists: 5, adr: 90 } }] }];
  const [ricky] = playerTrends(cs, W); assert.deepEqual(ricky.measures.map((m) => m.key), ['kda', 'kills', 'deaths', 'assists', 'adr']);
});

test('scrim-ai: match_result reads eFootball and CS2 screens only', async () => {
  const calls = []; const inserts = [];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64');
  const deps = { env: { ANTHROPIC_API_KEY: 'k' }, uuid: () => 'u1', now: () => new Date('2026-11-18T05:00:00Z'), heroes: HEROES, sleep: async () => {},
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: '{"screen_kind":"scoreboard"}' }], stop_reason: 'end_turn', usage: {} }) }; },
    clientFor: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x' } }, error: null }) }, rpc: async (fn) => ({ data: fn === 'can_write_title' ? true : 0, error: null }),
      storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: (t) => ({ insert: async (row) => { inserts.push([t, row]); return { error: null }; } }) }) };
  const call = (body) => handle({ method: 'POST', headers: { authorization: 'Bearer t' }, json: async () => body }, deps);
  assert.equal((await call({ action: 'match_result', title: 'MLBB', image: { data: png } })).status, 400);
  const r = await call({ action: 'match_result', title: 'CS2', image: { data: png }, day: '2026-11-18' });
  assert.equal(r.status, 200); assert.equal(r.body.captureId, 'u1');
  assert.ok(calls.at(-1).output_config.format.schema.properties.rounds_a); assert.match(calls.at(-1).system[0].text, /Counter-Strike 2/);
  assert.ok(inserts.some(([t, row]) => t === 'ai_usage' && row.action === 'match_result'));
  assert.ok(inserts.some(([t, row]) => t === 'scrim_captures' && row.data.kind === 'match_result' && row.data.storagePath.startsWith('cs2/2026-11-18/')));
  await call({ action: 'match_result', title: 'eFootball', image: { data: png } }); assert.ok(calls.at(-1).output_config.format.schema.properties.stats);
});
