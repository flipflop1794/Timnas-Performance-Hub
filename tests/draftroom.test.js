import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroIndex } from '../src/core/capture.js';
import * as D from '../src/core/draftroom.js';

const heroes = heroIndex(JSON.parse(readFileSync(new URL('../data/mlbb/heroes.json', import.meta.url), 'utf8')).heroes);
const t = (s) => new Date(`2026-11-20T10:00:${String(s).padStart(2, '0')}Z`);

test('draft order: 10 bans then picks 1-2-2-1 / 1-2-1, five picks each', () => {
  const o = D.MPL_ORDER;
  assert.equal(o.length, 20);
  for (const s of ['blue', 'red']) { assert.equal(o.filter((x) => x.side === s && x.action === 'ban').length, 5); assert.equal(o.filter((x) => x.side === s && x.action === 'pick').length, 5); }
  assert.deepEqual(o.slice(6, 12).map((x) => x.side), ['blue', 'red', 'red', 'blue', 'blue', 'red']);
});

test('mock draft: steps in order, time per step, no hero twice, a lost ban allowed, a pick not skippable', () => {
  let m = D.newMock({ title: 'MLBB', ourSide: 'blue', opponent: 'Myanmar', by: 'Indra', now: t(0) });
  m = D.applyStep(m, 'fanny', { heroes, now: t(12) });
  assert.equal(m.actions[0].hero, 'Fanny'); assert.equal(m.actions[0].seconds, 12);
  assert.throws(() => D.applyStep(m, 'Fanny', { heroes, now: t(14) }), /already banned or picked/);
  assert.throws(() => D.applyStep(m, 'Not A Hero', { heroes, now: t(14) }), /not a hero/);
  m = D.applyStep(m, '', { heroes, now: t(50) }); // red's ban timed out
  assert.equal(m.actions[1].over, true);
  const names = heroes.names.filter((h) => h !== 'Fanny');
  for (let i = 0; m.actions.length < 6; i++) m = D.applyStep(m, names[i], { heroes, now: t(55) });
  assert.throws(() => D.applyStep(m, '', { heroes, now: t(56) }), /pick cannot be skipped/);
  assert.equal(D.mockState(m).team, 'ours');
  assert.throws(() => D.finishMock(m), /Finish every step/);
  for (let i = 10; !D.mockState(m).done; i++) m = D.applyStep(m, names[i], { heroes, now: t(58) });
  const st = D.mockState(m); assert.equal(st.picks.blue.length, 5); assert.equal(st.picks.red.length, 5);
  const f = D.finishMock(m, { result: 'win' }); assert.equal(f.status, 'done'); assert.equal(f.overSteps, 1);
  assert.equal(D.undoStep(D.applyStep(D.newMock({ title: 'MLBB', ourSide: 'red', by: 'x' }), 'Fanny', { heroes })).actions.length, 0);
  assert.throws(() => D.newMock({ title: 'Dota 2', ourSide: 'blue', by: 'x' }), /MLBB and MLBB Women/);
});

test('hero pools: coach ratings, suggestions from confirmed scrim games', () => {
  let p = D.setPoolHero(null, { title: 'MLBB', player: 'Aran', hero: 'ling', tier: 'main', by: 'Indra', heroes });
  p = D.setPoolHero(p, { title: 'MLBB', player: 'Aran', hero: 'Fanny', tier: 'can', by: 'Indra', heroes });
  assert.deepEqual(Object.keys(p.heroes).sort(), ['Fanny', 'Ling']);
  p = D.setPoolHero(p, { title: 'MLBB', player: 'Aran', hero: 'Fanny', tier: '', by: 'Indra', heroes });
  assert.deepEqual(Object.keys(p.heroes), ['Ling']);
  const g = (hero, result) => ({ result, players: [{ team: 'ours', player: 'Aran', hero }, { team: 'partner', player: '', hero: 'Layla' }] });
  const s = D.poolSuggestions([g('Ling', 'win'), g('Ling', 'loss'), g('Hayabusa', 'win')], 'Aran', p);
  assert.deepEqual(s[0], { hero: 'Ling', games: 2, wins: 1, rated: 'main' }); assert.equal(s[1].rated, '');
});

test('draft book: versions kept, ban and protect cannot overlap, the writer cannot approve', () => {
  const b1 = D.saveBook(null, { bans: 'Fanny, Ling', protect: ['Hayabusa'], blue: 'Early turtle' }, { title: 'MLBB', opponent: 'Myanmar', by: 'Aufa', heroes });
  assert.equal(b1.version, 1); assert.deepEqual(b1.bans, ['Fanny', 'Ling']);
  assert.throws(() => D.saveBook(b1, { bans: 'Fanny', protect: 'Fanny' }, { title: 'MLBB', opponent: 'Myanmar', by: 'Aufa', heroes }), /both the ban list and the protect list/);
  const b2 = D.saveBook(b1, { bans: 'Fanny' }, { title: 'MLBB', opponent: 'Myanmar', by: 'Indra', heroes });
  assert.equal(b2.version, 2); assert.equal(b2.history[0].version, 1); assert.equal(b2.status, 'draft');
  assert.throws(() => D.approveBook(b2, { by: 'Indra', approvers: ['Aufa', 'Indra'] }), /writer of this version/);
  assert.throws(() => D.approveBook(b2, { by: 'Greg', approvers: ['Aufa', 'Indra'] }), /Approval for MLBB is by Aufa or Indra/);
  assert.equal(D.approveBook(b2, { by: 'Aufa', approvers: ['Aufa', 'Indra'] }).status, 'approved');
});

const CSV = `date,event,blue,red,winner,blue_bans,red_bans,blue_picks,red_picks,source
2026-11-06,MPL ID S18 Playoffs,AE,BTR,blue,Fanny|Ling|Joy|Kalea|Atlas,Masha|Gloo|Hilda|Chou|Aulus,Esmeralda|Zhuxin|Selena|Alice|Lancelot,Hayabusa|Layla|Tigreal|Valir|Akai,https://example.org/m1
2026-11-06,MPL ID S18 Playoffs,BTR,AE,red,"Fanny|Ling",Masha,Esmeralda|Zhuxin|Selena|Alice|Lancelot,Hayabusa|Layla|Tigreal|Valir|Akai,
2026-11-07,MPL ID S18 Playoffs,AE,BTR,purple,,,,,
2026-11-07,MPL ID S18 Playoffs,AE,BTR,blue,Fanny,Gloo,Esmeralda|Zhuxin|Selena|Alice,Hayabusa|Layla|Tigreal|Valir|Akai,`;

test('public pro games: CSV import checks every hero and row; bad rows are listed, good ones kept', () => {
  const { games, errors } = D.parseProCsv(CSV, { title: 'MLBB', heroes, by: 'analyst' });
  assert.equal(games.length, 2); assert.equal(errors.length, 2);
  assert.match(errors[0], /Line 4: winner must be blue or red/); assert.match(errors[1], /Line 5: blue_picks needs 5 heroes/);
  assert.notEqual(games[0].id, games[1].id); assert.equal(games[0].kind, 'public pro');
  assert.throws(() => D.parseProCsv('date,blue\n2026-01-01,A', { title: 'MLBB', heroes }), /Missing column/);
  const f = D.proFacts(games);
  assert.equal(f.games, 2); const es = f.priority.find((r) => r.hero === 'Esmeralda'); assert.equal(es.presence, 1); assert.equal(f.priority.find((r) => r.hero === 'Joy').presence, 0.5);
  assert.equal(es.winRate, null, 'no win rate below 5 picks'); assert.equal(f.lowSample, true);
});

test('pool gaps: high-priority pro heroes nobody on our side rates main or can play, only from 5 games', () => {
  const g = (i) => ({ date: `2026-11-0${i}`, event: 'x', blue: 'A', red: 'B', winner: 'blue', blueBans: ['Fanny'], redBans: ['Ling'], bluePicks: ['Esmeralda', 'Zhuxin', 'Selena', 'Alice', 'Lancelot'], redPicks: ['Hayabusa', 'Layla', 'Tigreal', 'Valir', 'Akai'] });
  const pro = [1, 2, 3, 4, 5].map(g);
  const pools = [{ heroes: { Fanny: { tier: 'main' }, Ling: { tier: 'learning' } } }];
  const gaps = D.poolGaps(pro, pools).map((x) => x.hero);
  assert.ok(gaps.includes('Ling')); assert.ok(!gaps.includes('Fanny'));
  assert.deepEqual(D.poolGaps(pro.slice(0, 4), pools), []);
  assert.equal(D.proFacts(pro).priority.find((r) => r.hero === 'Esmeralda').winRate, 1);
});

test('our draft facts: bans against us, first picks, heroes with game counts; mock-draft timing', () => {
  const game = (result, first) => ({ result, players: [{ team: 'ours', player: 'Aran', hero: first }],
    draft: [{ action: 'ban', team: 'partner', hero: 'Fanny' }, { action: 'ban', team: 'ours', hero: 'Ling' }, { action: 'pick', team: 'ours', hero: first }] });
  const f = D.ourDraftFacts({ games: [game('win', 'Joy'), game('loss', 'Joy'), { result: 'win', players: [], draft: [] }], mocks: [{ status: 'done', overSteps: 2, avgSeconds: 20 }] });
  assert.equal(f.drafted, 2); assert.deepEqual(f.bansAgainstUs[0], { hero: 'Fanny', n: 2, of: 2 }); assert.equal(f.firstPicks[0].hero, 'Joy');
  assert.equal(f.heroes[0].won, 1); assert.equal(f.lowSample, true); assert.equal(f.mockOverSteps, 2);
});

test('drills: situation replayed from the draft order, answers scored for hero and time', () => {
  const d = D.newDrill({ title: 'MLBB', name: 'Answer a Fanny first pick', ourSide: 'red', prefill: 'Ling, Joy, Kalea, Atlas, Masha, Gloo, Fanny', prompt: 'Red picks two: what first?', accept: 'Khufra, Fanny', seconds: 20, by: 'Indra', heroes });
  assert.equal(d.ask.side, 'red'); assert.equal(d.ask.action, 'pick');
  assert.deepEqual(d.accept, ['Khufra'], 'a hero already taken cannot be an accepted answer');
  let x = D.recordAttempt(d, { player: 'Aran', hero: 'Khufra', seconds: 12, by: 'Indra', heroes });
  x = D.recordAttempt(x, { player: 'Aran', hero: 'Khufra', seconds: 25, by: 'Indra', heroes });
  x = D.recordAttempt(x, { player: 'Kevin', hero: 'Tigreal', seconds: 8, by: 'Indra', heroes });
  assert.throws(() => D.recordAttempt(x, { player: 'Kevin', hero: 'Fanny', seconds: 8, heroes }), /already banned or picked/);
  assert.deepEqual(D.drillSummary(x), [{ player: 'Aran', tries: 2, good: 1, inTime: 1 }, { player: 'Kevin', tries: 1, good: 0, inTime: 1 }]);
});
