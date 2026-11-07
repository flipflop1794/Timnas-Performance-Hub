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

test('findings the staff marked known or wrong are not raised again until 5 more games back them', async () => {
  const { checkFindings, digestPayload } = await import('../src/core/patterns.js');
  const fact = (n) => ({ id: 'side:left', group: 'side', label: 'Games on the left', n, won: 4, lost: n - 4, winRate: Math.round(400 / n), lowSample: false, games: [] });
  const raw = { findings: [{ kind: 'problem', claim: `We lose on the left: 4 of ${8} won.`, why_it_matters: 'Practise left-side starts.', fact_ids: ['side:left'] }] };
  const earlier = [{ title: 'MLBB', kind: 'problem', factIds: ['side:left'], facts: [{ id: 'side:left', n: 8 }], status: 'wrong', statusBy: 'Indra', statusAt: '2026-11-06T10:00:00Z', claim: 'old' }];
  const r1 = checkFindings(raw, [fact(8)], { earlier });
  assert.equal(r1.kept.length, 0); assert.match(r1.dropped[0].why, /already marked wrong by Indra/);
  // Five more games: the same reading may come back.
  const raw13 = { findings: [{ ...raw.findings[0], claim: 'We lose on the left: 4 of 13 won.' }] };
  assert.equal(checkFindings(raw13, [fact(13)], { earlier }).kept.length, 1);
  // A finding marked useful is never blocked, and the marks go to the AI.
  assert.equal(checkFindings(raw, [fact(8)], { earlier: [{ ...earlier[0], status: 'useful' }] }).kept.length, 1);
  assert.equal(digestPayload([fact(8)], [], { earlier }).feedback[0].status, 'wrong');
});

test('AI cost estimate: cache reads priced at a tenth or less, unknown models not guessed', async () => {
  const { usageSummary, callCost } = await import('../src/core/ai_cost.js');
  const m = 'claude-sonnet-5-5';
  // First screenshot writes the cache, the second reads it.
  const rows = [
    { model: m, action: 'scoreboard', title: 'MLBB', ok: true, input_tokens: 1600, output_tokens: 900, cache_write_tokens: 2000, cache_read_tokens: 0 },
    { model: m, action: 'scoreboard', title: 'MLBB', ok: true, input_tokens: 1600, output_tokens: 900, cache_write_tokens: 0, cache_read_tokens: 2000 },
    { model: 'other-model', action: 'digest', title: 'Dota 2', ok: false, input_tokens: 10, output_tokens: 0 },
  ];
  assert.ok(Math.abs(callCost(rows[1]) - (1600 * 2 + 900 * 10 + 2000 * 0.1) / 1e6) < 1e-12);
  const u = usageSummary(rows);
  assert.equal(u.total.calls, 3); assert.equal(u.total.failed, 1); assert.equal(u.total.unpriced, 1);
  assert.ok(u.byAction.scoreboard.cost < 0.04); assert.ok(u.cacheShare > 0.2);
  assert.ok(u.perScreenshot > 0.01 && u.perScreenshot < 0.02);
});
