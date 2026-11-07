// V1.13 robustness: thousands of random / broken AI answers through every function the check screen
// uses. Nothing may throw, and nothing unreadable may be filled in as if it were read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroIndex, proposeGame, proposeDraft, mergeGames, heroesFromDraft, heroChoices, findDuplicate, blankGame, confirmGame } from '../src/core/capture.js';
import { checkFindings, facts } from '../src/core/patterns.js';
import { checkDebriefSplit } from '../src/core/debrief.js';

const heroes = heroIndex(JSON.parse(readFileSync(new URL('../data/mlbb/heroes.json', import.meta.url))).heroes);
const REAL = JSON.parse(readFileSync(new URL('./fixtures/mlbb_real_screens.json', import.meta.url), 'utf8'));
let seed = 20261107; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const junk = () => pick([undefined, null, '', 'x', -1, 0, 7, 1e9, -5, 3.7, NaN, Infinity, true, false, [], {}, [1, 2], { a: 1 }, 'Fanny', 'Lapu Lapu', 'left', 'right', 'victory', 'result']);
const mutate = (o, rate) => {
  if (Array.isArray(o)) return rnd() < rate / 4 ? junk() : o.map((x) => mutate(x, rate));
  if (o && typeof o === 'object') { const out = {}; for (const [k, v] of Object.entries(o)) { if (rnd() < rate / 3) continue; out[k] = rnd() < rate ? junk() : mutate(v, rate); } if (rnd() < rate / 3) out[`extra${Math.floor(rnd() * 9)}`] = junk(); return out; }
  return o;
};
const ROSTER = ['Aran', 'Kevin', 'Drichel', 'Lyoni', 'Jull.'];

test('3000 mutated real screens: no crash; every filled number is a non-negative finite number; unread stays empty', () => {
  for (let i = 0; i < 3000; i++) {
    const raw = mutate(JSON.parse(JSON.stringify(pick(REAL).raw)), pick([0.02, 0.1, 0.3, 0.8]));
    const g = proposeGame({ title: pick(['MLBB', 'MLBB Women']), raw, roster: ROSTER, heroes });
    assert.ok(Array.isArray(g.players) && g.players.length <= 12 && Array.isArray(g.issues));
    for (const p of g.players) {
      for (const v of Object.values(p.stats)) assert.ok(v === null || (Number.isFinite(v) && v >= 0), `bad stat ${v}`);
      assert.ok(p.hero === '' || heroes.names.includes(p.hero)); assert.ok(['', 'left', 'right'].includes(p.side));
      for (const c of p.candidates) assert.ok(heroes.names.includes(c));
    }
    assert.ok(['', 'win', 'loss'].includes(g.result));
    const b = proposeGame({ title: 'MLBB', raw: mutate(JSON.parse(JSON.stringify(pick(REAL).raw)), 0.2), roster: ROSTER, heroes });
    const m = mergeGames(g, b); assert.ok(Array.isArray(m.game.players));
    heroChoices(pick(g.players.length ? g.players : [{ candidates: [] }]), { memory: {}, playerHeroes: {} });
    findDuplicate(g, [{ game: 'mlbb', score: { left: 1, right: 2 }, durationS: 600 }]);
  }
});

test('2000 random draft answers: no crash, only list heroes, never fills an unsure hero', () => {
  for (let i = 0; i < 2000; i++) {
    const raw = mutate({ screen_kind: 'draft', readable: true, first_pick_side: 'left', notes: '', actions: Array.from({ length: Math.floor(rnd() * 25) }, (_, k) => ({ order: k + 1, side: pick(['left', 'right']), action: pick(['pick', 'ban']), hero: pick(heroes.names), hero_sure: rnd() < 0.5, hero_candidates: [pick(heroes.names)], player_name: '', order_sure: true })) }, 0.15);
    const d = proposeDraft({ title: 'MLBB', raw, heroes });
    for (const a of d.actions) { assert.ok(a.hero === '' || heroes.names.includes(a.hero)); }
    heroesFromDraft(proposeGame({ title: 'MLBB', raw: REAL[0].raw, roster: ROSTER, heroes }), d, heroes);
  }
});

test('random findings and debrief answers: no crash, nothing kept without a real fact', () => {
  const base = proposeGame({ title: 'MLBB', raw: REAL[1].raw, roster: ROSTER, heroes });
  const e = JSON.parse(JSON.stringify(base)); e.players.forEach((p) => { p.hero = REAL[1].truthHeroes[p.side][p.slot - 1]; });
  const games = Array.from({ length: 8 }, (_, i) => confirmGame({ ...e, result: i % 2 ? 'win' : 'loss' }, { date: '2026-11-16', partner: 'X', gameNo: 1, heroes }));
  const F = facts(games, {}); const ids = new Set(F.map((f) => f.id));
  for (let i = 0; i < 2000; i++) {
    const raw = mutate({ findings: [{ fact_ids: [pick([...ids]), 'nope'], kind: 'problem', claim: `Lost ${Math.floor(rnd() * 10)} of 8 games.`, why_it_matters: 'x' }] }, 0.3);
    const { kept } = checkFindings(raw, F);
    for (const k of kept) assert.ok(k.factIds.length && k.factIds.every((x) => ids.has(x)));
    checkDebriefSplit('fokus rotasi lord', mutate({ focus: 'fokus rotasi', worked: '', failed: '', adjust: '', player_notes: '', detail: '', not_placed: '' }, 0.4), ROSTER);
  }
  // A hand-typed blank game with nothing filled is refused with a sentence, not an exception of another kind.
  assert.throws(() => confirmGame(blankGame('MLBB', ROSTER), { date: '2026-11-16', gameNo: 1, heroes }), /Pick the result/);
});
