import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMeans, diffProportions, t95 } from '../src/core/stats.js';
import { compareWindows, KPIS } from '../src/core/measure.js';
import { checkin, flags } from '../src/core/wellbeing.js';
import { reportSummary, TREND_MIN } from '../src/core/reports.js';

// Balance review, 7 Nov 2026: each test pins one rule that was too eager or too blind.

test('win-rate change: 0/8 vs 8/8 has a real interval, 3/8 vs 5/8 is no clear change', () => {
  const big = diffProportions(0, 8, 8, 8);
  assert.ok(big.hi - big.lo > 0.3, 'Wald gave a zero-width interval here');
  const small = diffProportions(3, 8, 5, 8);
  assert.ok(small.lo < 0 && small.hi > 0);
  assert.ok(Number.isNaN(diffProportions(0, 0, 1, 2).d));
});

test('mean change uses t, not 1.96, on small samples; constant windows claim nothing', () => {
  assert.equal(t95(7), 2.36); assert.ok(t95(200) < 1.98);
  const r = diffMeans([1, 2, 3, 2, 1, 2, 3, 2], [2, 3, 4, 3, 2, 3, 4, 3]);
  assert.ok(r.hi - r.lo > 2 * 1.96 * Math.sqrt(2 * 0.5714 / 8));
  const flat = diffMeans([3, 3, 3], [4, 4, 4]);
  assert.equal(flat.lo, -Infinity);
  const kpi = KPIS.dota.find((k) => k.id === 'nw10');
  assert.equal(compareWindows(kpi, Array(8).fill(100), Array(8).fill(400)).status, 'no clear change');
});

test('wellbeing: a big drop flags even when the player always scored the same', () => {
  const base = (d, v) => checkin({ player: 'A', title: 'Dota 2', date: d, sleepH: 8, sleepQ: v, fatigue: v, soreness: v, stress: v, mood: v });
  const cs = [];
  for (let i = 1; i <= 10; i++) cs.push(base(`2026-11-${String(i).padStart(2, '0')}`, 4));
  cs.push(base('2026-11-11', 3));
  assert.ok(flags('A', '2026-11-11', cs, []).some((f) => f.level === 'check'), 'SD 0 baseline hid a 5-point drop');
  // A one-point wobble on a steady baseline is not a flag.
  const c2 = cs.slice(0, 10).concat(checkin({ player: 'A', title: 'Dota 2', date: '2026-11-11', sleepH: 8, sleepQ: 3, fatigue: 4, soreness: 4, stress: 4, mood: 4 }));
  assert.ok(!flags('A', '2026-11-11', c2, []).some((f) => f.level === 'check'));
});

test('report trend needs a few reports in each week', () => {
  const r = (date, progress) => ({ title: 'Dota 2', date, createdAt: `${date}T10:00`, progress, result: { mode: 'wl', won: 1, lost: 0, drawn: 0 }, partner: 'x', by: 'c', adjust: '' });
  const one = reportSummary([r('2026-11-07', 5), r('2026-10-31', 2)], 'Dota 2', '2026-11-07');
  assert.equal(one.trend, null);
  const many = [];
  const thisWeek = ['2026-11-07', '2026-11-06', '2026-11-05'], lastWeek = ['2026-10-31', '2026-10-30', '2026-10-29'];
  for (let i = 0; i < TREND_MIN; i++) { many.push(r(thisWeek[i], 5)); many.push(r(lastWeek[i], 2)); }
  assert.equal(reportSummary(many, 'Dota 2', '2026-11-07').trend, 'up');
});

test('PUBGM: one early exit in two matches is not a survival finding', async () => {
  const { perfFindings } = await import('../src/pubgm/analytics.js');
  const { scorer } = await import('../src/pubgm/scoring.js');
  const { readFileSync } = await import('node:fs');
  const sc = scorer(JSON.parse(readFileSync(new URL('../data/pubgm/scoring_profiles.json', import.meta.url), 'utf8')).profiles.standard_10_6);
  const row = (m, team, placement, died) => ({ match_id: m, date: '2026-11-07', session: 'D1', map: 'Erangel', team, placement, elims: 2, survival_s: 900, died_phase: died, drop_spot: 'School' });
  const rows = [row('A', 'INA', 15, 2), row('A', 'X', 1, 0), row('B', 'INA', 3, 6), row('B', 'X', 1, 0)];
  const f = perfFindings(rows, 'INA', sc);
  assert.ok(!f.some((x) => x.tags.includes('early-exit') || x.tags.includes('zone34')));
});
