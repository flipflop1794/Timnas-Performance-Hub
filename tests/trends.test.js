import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeks, teamTrends, playerTrends, MIN_VALUES } from '../src/core/trends.js';
import { shiftDay } from '../src/core/dates.js';

const asOf = '2026-11-16';
const W = weeks(asOf, 6);
const rep = (date, won, lost, progress, title = 'MLBB') => ({ title, date, progress, result: { mode: 'wl', won, lost, drawn: 0 }, origin: 'operational' });

test('weeks: six rolling 7-day weeks ending today, oldest first, no gaps', () => {
  assert.equal(W.length, 6); assert.deepEqual(W[5], { from: '2026-11-10', to: '2026-11-16' }); assert.deepEqual(W[0], { from: '2026-10-06', to: '2026-10-12' });
  for (let i = 1; i < 6; i++) assert.equal(W[i].from, shiftDay(W[i - 1].to, 1));
});

test('team: win rate weighs each game; a week without reports is a gap; a clear rise is called better', () => {
  const reports = [
    rep('2026-10-28', 1, 3, 2), rep('2026-10-29', 0, 3, 2), rep('2026-10-30', 0, 2, 2), rep('2026-11-02', 1, 3, 3),   // weeks 3–4: 2 of 13
    rep('2026-11-05', 4, 0, 4), rep('2026-11-06', 3, 1, 5), rep('2026-11-12', 4, 0, 5), rep('2026-11-13', 3, 0, 4),   // weeks 5–6: 14 of 15
    rep('2026-11-13', 1, 0, 5, 'Dota 2'),
  ];
  const t = teamTrends('MLBB', { reports }, W);
  const win = t.find((m) => m.key === 'win');
  assert.equal(win.values[0], null, 'no reports in week 1');
  assert.equal(win.counts[5], 7); assert.equal(Math.round(win.values[5] * 100), 100);
  assert.equal(win.nBefore, 13); assert.equal(win.nAfter, 15);
  assert.equal(win.verdict, 'better');
  const plan = t.find((m) => m.key === 'plan');
  assert.equal(plan.verdict, 'not enough data', `${plan.nBefore} vs ${plan.nAfter} reports: fewer than ${MIN_VALUES} each side`);
  assert.deepEqual(teamTrends('eFootball', { reports }, W), []);
});

test('team: PUBG Mobile reports and match log; lower placement is better', () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ team: 'INA', date: '2026-11-01', placement: 12, died_phase: 2 }, { team: 'INA', date: '2026-11-12', placement: 3, died_phase: 0 }, { team: 'MGL', date: '2026-11-12', placement: 1, died_phase: 0 });
  rows.forEach((r, i) => { r.placement += i % 3; });
  const t = teamTrends('PUBG Mobile', { reports: [{ title: 'PUBG Mobile', date: '2026-11-12', progress: 4, result: { mode: 'points', played: 6, points: 60 } }], pubgm: { rows, team: 'INA', points: (r) => 20 - r.placement } }, W);
  assert.deepEqual(t.map((m) => m.key), ['ppm', 'plan', 'place', 'logppm', 'early']);
  assert.equal(t.find((m) => m.key === 'ppm').values[5], 10);
  const place = t.find((m) => m.key === 'place'); assert.equal(place.verdict, 'better'); assert.ok(place.after < place.before);
  assert.equal(t.find((m) => m.key === 'early').verdict, 'better');
});

test('players: per-game KDA and K/D/A from confirmed games; stand-ins and the other team left out', () => {
  const g = (date, deaths, k = 3, a = 6) => ({ game: 'mlbb', date, players: [
    { team: 'ours', player: 'Aran', stats: { kills: k, deaths, assists: a } }, { team: 'ours', player: 'stand-in', stats: { kills: 9, deaths: 0, assists: 0 } },
    { team: 'partner', player: '', stats: { kills: 1, deaths: 1, assists: 1 } }] });
  const games = [...[5, 6, 5, 7, 6, 6].map((d) => g('2026-11-01', d)), ...[2, 1, 2, 2, 1, 2].map((d) => g('2026-11-13', d))];
  const [aran, ...rest] = playerTrends(games, W);
  assert.equal(rest.length, 0); assert.equal(aran.player, 'Aran'); assert.equal(aran.games, 12);
  const deaths = aran.measures.find((m) => m.key === 'deaths');
  assert.equal(deaths.better, 'down'); assert.equal(deaths.verdict, 'better');
  const kda = aran.measures.find((m) => m.key === 'kda');
  assert.equal(kda.values[5], (9 / 2 + 9 + 9 / 2 + 9 / 2 + 9 + 9 / 2) / 6); assert.equal(kda.verdict, 'better');
  assert.deepEqual(playerTrends([], W), []);
});
