import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wilson, shrink, rng, quantile } from '../src/core/stats.js';
import { finding, recommendation } from '../src/core/evidence.js';
import { runCoaches } from '../src/core/coaches.js';
import { compareWindows, KPIS, scoutingHitRate } from '../src/core/measure.js';
import { parseHeroes, parsePlayerMatches, reduceOpenDotaMatch } from '../src/dota/data.js';
import { buildPools, teamFindings } from '../src/dota/team.js';
import { CM_ORDER, checkOrder, evaluateDraft, compareDrafts, suggest, draftPatterns } from '../src/dota/draft.js';
import { analyseMatch, detectSide } from '../src/dota/match.js';
import { scoutingReport } from '../src/dota/scout.js';
import { recommendations as dotaRecs, dotaAdapter } from '../src/dota/training.js';
import { parseCSV, scorer, validateMatches } from '../src/pubgm/scoring.js';
import { perfFindings, dropFindings, fightFindings, classifyFight, standings } from '../src/pubgm/analytics.js';
import { simulate } from '../src/pubgm/simulator.js';
import { recommendations as pubgmRecs, pubgmAdapter } from '../src/pubgm/training.js';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const heroes = parseHeroes(rd('data/dota/heroes.csv'));
const players = parsePlayerMatches(rd('data/dota/ina_pro_matches.csv'));
const matches = JSON.parse(rd('data/dota/matches_parsed.json')).matches;
const mgl = JSON.parse(rd('data/dota/opp_MGL.json'));
const ASOF = 1793696400; // 2026-11-03 07:00 UTC
const pools = buildPools(players, heroes, ASOF);
const INA = Object.values(players).map((p) => p.account);
const profiles = JSON.parse(rd('data/pubgm/scoring_profiles.json')).profiles;
const sc = scorer(profiles.standard_10_6);
const rows = parseCSV(rd('data/pubgm/demo_matches.csv'));
const fights = parseCSV(rd('data/pubgm/demo_fights.csv'));
const TEAM = 'INA (demo)';

// ---------- core ----------
test('stats: wilson, shrink, rng', () => {
  const w = wilson(7, 10); assert.ok(w.lo < 0.7 && w.hi > 0.7);
  assert.equal(shrink(0, 0, 0.5, 10), 0.5);
  assert.ok(shrink(3, 3, 0.5, 8) < 0.75, 'three wins must not look like a 100% hero');
  const a = rng(5), b = rng(5); assert.equal(a(), b());
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
});

test('evidence: finding requires a lens; recommendation requires all five parts', () => {
  assert.throws(() => finding({ title: 'x' }));
  assert.throws(() => recommendation({ problem: 'p', evidence: [], explanation: 'e', drill: 'd', success: 's', confidence: 'Low' }));
});

test('measure: small or unfair windows are never reported as clean improvement', () => {
  const k = KPIS.pubgm[0];
  const r = compareWindows(k, [5, 6, 4], [12, 14, 13], { minN: 8 });
  assert.ok(r.flags.length >= 1);
  assert.ok(!/^better$/.test(r.status));
  assert.match(r.note, /does not show a change in tournament win probability/);
  assert.equal(scoutingHitRate([1, 2, 3, 4], [2, 4, 9]).rate, 0.5);
});

// ---------- dota data ----------
test('dota data: all five WEC players loaded with real accounts', () => {
  assert.deepEqual(Object.keys(players).sort(), ['Fbz', 'Jhocam', 'Mikoto', 'Whitemon', 'jikroy']);
  assert.equal(players.Whitemon.account, 136829091);
  for (const p of Object.values(players)) {
    assert.ok(p.games.length >= 100, `${p.ign} has ${p.games.length} games`);
    for (const g of p.games) { assert.ok(g.start >= 1774313459); assert.ok(heroes[g.hero], `unknown hero ${g.hero}`); }
  }
});

test('dota data: shared match rows agree between players (cross-check)', () => {
  // jikroy and Fbz share many club matches; both rows must agree on the result.
  const f = Object.fromEntries(players.Fbz.games.map((g) => [g.match, g]));
  let shared = 0;
  for (const g of players.jikroy.games) if (f[g.match]) { shared++; assert.equal(g.win, f[g.match].win, `match ${g.match}`); assert.equal(g.dur, f[g.match].dur); }
  assert.ok(shared >= 50);
});

test('dota data: OpenDota full-match reducer handles a minimal record', () => {
  const r = reduceOpenDotaMatch({ match_id: 1, duration: 100, radiant_win: true, players: [{ account_id: 5, player_slot: 0, hero_id: 1 }] });
  assert.equal(r.id, 1); assert.equal(r.pl[0].h, 1); assert.equal(r.parsed, false);
  assert.throws(() => reduceOpenDotaMatch({ foo: 1 }));
});

// ---------- dota proficiency / team ----------
test('dota pools: positions inferred from lanes and hero roles', () => {
  const pos = Object.fromEntries(pools.map((p) => [p.player, p.pos]));
  assert.deepEqual(pos, { jikroy: 1, Mikoto: 2, Fbz: 3, Jhocam: 4, Whitemon: 5 });
});

test('dota team findings: club context is tagged and synergy gap is flagged', () => {
  const F = teamFindings(pools, players, ASOF);
  assert.ok(F.every((f) => f.tags.includes('club') || f.tags.includes('idle')));
  assert.ok(F.some((f) => f.area === 'synergy' && f.severity < 0));
});

// ---------- dota draft ----------
test('dota draft: CM order matches both real tournament drafts', () => {
  assert.equal(CM_ORDER.length, 24);
  for (const m of matches) assert.equal(checkOrder(m.picks).ok, true, `match ${m.id}`);
});

test('dota draft: evaluation separates terms and explains a comparison', () => {
  const ctx = { heroes, pools, oppPools: [] };
  const comfort = [pools[0].pool[0].hero, pools[1].pool[0].hero, pools[2].pool[0].hero, pools[3].pool[0].hero, pools[4].pool[0].hero];
  const random = [1, 22, 34, 59, 105].filter((h) => !comfort.includes(h)).slice(0, 5);
  const c = compareDrafts({ ours: comfort }, { ours: random }, ctx, ['Comfort', 'Off-pool']);
  assert.equal(c.preferred, 'Comfort');
  assert.ok(c.reasons.some((r) => /Player comfort/.test(r)));
  assert.ok(c.caveat, 'matchup term must be declared off without data');
  const e = evaluateDraft({ ours: comfort }, ctx);
  assert.equal(e.assignment.length, 5);
});

test('dota draft: suggestions carry reasons and never repeat taken heroes', () => {
  const ctx = { heroes, pools, oppPools: scoutingReport(mgl, heroes, pools).players };
  const st = { ours: [pools[0].pool[0].hero], theirs: [13], ourBans: [145], theirBans: [112] };
  const s = suggest(st, ctx, { kind: 'pick', top: 5 });
  assert.ok(s.length > 0);
  for (const x of s) { assert.ok(x.reasons.length); assert.ok(![...st.ours, ...st.theirs, ...st.ourBans, ...st.theirBans].includes(x.hero)); }
  const b = suggest(st, ctx, { kind: 'ban', top: 3 });
  assert.ok(b[0].reasons[0].includes('games'));
});

test('dota draft patterns: first actions and adaptation from real picks_bans', () => {
  const drafts = matches.map((m) => ({ picks: m.picks, side: 1, win: !m.rw })); // 1win was Dire in both
  const p = draftPatterns(drafts, heroes);
  assert.equal(p.games, 2);
  assert.ok(p.firstBans.length > 0);
  assert.equal(p.adaptationAfterLoss.length, 1);
});

// ---------- dota match ----------
test('dota match 9057681759: facts read correctly from the parsed record', () => {
  const m = matches.find((x) => x.id === 9057681759);
  const side = detectSide(m, INA);
  assert.equal(side.side, 'dire'); assert.equal(side.count, 2);
  const a = analyseMatch(m, INA, heroes);
  assert.equal(a.won, false); assert.equal(a.opponent, 'OG');
  const rosh = a.findings.find((f) => /^Roshan:/.test(f.title));
  assert.equal(rosh.title, 'Roshan: 0 for us, 2 for them');
  const conv = a.findings.find((f) => /enemy Roshans/.test(f.title));
  assert.match(conv.title, /1\/2/);
  assert.ok(a.findings.every((f) => ['observed', 'inferred', 'hypothesis'].includes(f.kind)));
  assert.ok(a.findings.some((f) => f.at != null), 'timestamped findings expected');
  assert.ok(a.findings.every((f) => f.tags.includes('club')), '2/5 tracked players → club tag');
});

test('dota match 9035078952: same match seen from both Indonesian players\' sides', () => {
  const m = matches.find((x) => x.id === 9035078952);
  const asMikoto = analyseMatch(m, [301750126], heroes);
  const asWhitemon = analyseMatch(m, [136829091], heroes);
  assert.equal(asMikoto.won, true); assert.equal(asWhitemon.won, false);
  assert.equal(asMikoto.opponent, '1win'); assert.equal(asWhitemon.opponent, 'Aurora Gaming');
});

// ---------- dota scouting ----------
test('dota scouting (Mongolia): coverage gaps are explicit and ban plan uses real counts', () => {
  const r = scoutingReport(mgl, heroes, pools);
  assert.ok(r.findings.some((f) => /Se has no matched/.test(f.title) && f.confidence === 'Blocked'));
  assert.ok(r.findings.some((f) => /ambiguous/.test(f.title)));
  const kez = r.banPlan.find((b) => b.player === '423');
  assert.equal(kez.name, 'Kez'); assert.equal(kez.games, 31);
  assert.ok(r.blocked.length >= 3);
});

// ---------- coaches ----------
test('coaches: three different outputs; C challenges single-match claims; verdict needs human review', () => {
  const m = matches.find((x) => x.id === 9057681759);
  const a = analyseMatch(m, INA, heroes);
  const recs = dotaRecs(a.findings);
  const out = runCoaches(a.findings, recs, dotaAdapter, { clubData: true });
  assert.notEqual(out.a.headline, out.b.headline);
  assert.ok(out.c.challenges.length > 0);
  assert.ok(out.c.challenges.some((c) => /club match|club games/.test(c.text)), 'context challenge expected');
  assert.ok(out.c.challenges.some((c) => /lane result depends|item timing|support deaths/.test(c.text)), 'specific alternative explanation expected');
  assert.ok(out.verdict.priorities.length >= 1, 'observed single-match facts still yield priorities');
  assert.ok(out.c.blindSpots.length >= 2);
  assert.match(out.verdict.humanReview, /sign-off/);
  for (const r of recs) for (const k of ['problem', 'evidence', 'explanation', 'drill', 'success', 'confidence']) assert.ok(r[k]);
});

// ---------- pubgm ----------
test('pubgm: scoring profiles — WEC is blocked, default computes', () => {
  assert.throws(() => scorer(profiles.wec26), /not usable/);
  assert.equal(sc.total({ placement: 1, elims: 7 }), 17);
  assert.equal(sc.total({ placement: 9, elims: 2 }), 2);
});

test('pubgm: demo log is valid and clearly synthetic', () => {
  assert.deepEqual(validateMatches(rows), []);
  assert.match(rd('data/pubgm/demo_matches.csv').split('\n')[0], /SYNTHETIC/);
  const st = standings(rows, sc);
  assert.equal(st.length, 16);
  const tot = st.reduce((a, t) => a + t.total, 0);
  const expect = rows.reduce((a, r) => a + sc.total(r), 0);
  assert.equal(tot, expect);
});

test('pubgm: validator catches broken rows', () => {
  const bad = [{ match_id: 'X', map: 'Erangel', team: 'A', placement: 1, elims: 3, elims_early: 1, elims_mid: 1, elims_late: 0 }, { match_id: 'X', map: 'Erangel', team: 'B', placement: 1, elims: 0 }];
  const e = validateMatches(bad);
  assert.ok(e.some((x) => /do not add up/.test(x))); assert.ok(e.some((x) => /two teams placed 1/.test(x)));
});

test('pubgm: engine finds the patterns planted in the synthetic log', () => {
  const pf = perfFindings(rows, TEAM, sc);
  const df = dropFindings(rows, TEAM, sc);
  assert.ok([...pf, ...df.findings].some((f) => f.tags.includes('drop') && /Pochinki/.test(f.title)), 'contested Pochinki drop');
  assert.ok(pf.some((f) => f.tags.includes('zone34') || f.tags.includes('early-exit')), 'survival problem');
});

test('pubgm: fight classification rules', () => {
  assert.equal(classifyFight({ zone_forced: 1, team_deaths: 0, knocks_for: 1, knocks_against: 0, finishes_for: 1 }), 'necessary');
  assert.equal(classifyFight({ zone_forced: 0, team_deaths: 3, knocks_for: 0, knocks_against: 3, finishes_for: 0, initiator: 'us', third_party: 0 }), 'avoidable');
  assert.equal(classifyFight({ zone_forced: 0, team_deaths: 0, knocks_for: 2, knocks_against: 0, finishes_for: 2, initiator: 'them', third_party: 0 }), 'favourable');
  const ff = fightFindings(fights, TEAM);
  assert.ok(ff.findings.length >= 1);
});

test('pubgm simulator: reproducible ranges with stated basis', () => {
  const s1 = simulate({ rows, team: TEAM, sc, matches: 6, iters: 1500, seed: 3 });
  const s2 = simulate({ rows, team: TEAM, sc, matches: 6, iters: 1500, seed: 3 });
  for (let i = 0; i < 3; i++) {
    const r = s1.results[i];
    assert.ok(r.p10 <= r.p50 && r.p50 <= r.p90);
    assert.equal(r.p50, s2.results[i].p50);
    assert.ok(/logged/.test(r.source));
  }
  const withRival = simulate({ rows, team: TEAM, sc, matches: 6, iters: 800, rival: { team: 'Team 05', ourPoints: 40, theirPoints: 52 } });
  assert.ok(withRival.results[0].pBeatRival >= 0 && withRival.results[0].pBeatRival <= 1);
});

test('pubgm coaches and recommendations', () => {
  const F = [...perfFindings(rows, TEAM, sc), ...dropFindings(rows, TEAM, sc).findings, ...fightFindings(fights, TEAM).findings];
  const recs = pubgmRecs(F);
  assert.ok(recs.length >= 2);
  const out = runCoaches(F, recs, pubgmAdapter, { synthetic: true, fightsLogged: true });
  assert.ok(out.c.blindSpots.some((b) => /SYNTHETIC/.test(b)));
  assert.ok(out.verdict.priorities.length >= 1);
});
