import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practiceQuality, titleQuality, MIN_SESSIONS } from '../src/core/practice_quality.js';

const S = (id, title, date, status, extra = {}) => ({ id, title, date, status, objectives: [], origin: 'operational', ...extra });
const R = (id, title, date, progress, createdAt, extra = {}) => ({ id, title, date, progress, createdAt, origin: 'operational', ...extra });

test('each part counts what the staff recorded; a part without data is left out, not zero', () => {
  const data = {
    scrims: [
      S('a', 'MLBB', '2026-11-10', 'done', { objectives: ['OBJ-1'] }),
      S('b', 'MLBB', '2026-11-11', 'done', { dailyReport: { objective: 'Turtle', filedAt: '2026-11-11T12:00:00Z' }, followUp: { due: '2026-11-12', status: 'Done' } }),
      S('c', 'MLBB', '2026-11-12', 'planned'),                 // should have happened, did not
      S('d', 'MLBB', '2026-11-13', 'cancelled'),
      S('e', 'MLBB', '2026-11-16', 'planned'),                 // today: not yet due
      S('x', 'PUBG Mobile', '2026-11-12', 'done'),
    ],
    reports: [
      R('r1', 'MLBB', '2026-11-10', 5, '2026-11-11T15:00:00Z', { scrimId: 'a' }),   // 22:00 WIB next day: on time
      R('r2', 'MLBB', '2026-11-12', 3, '2026-11-14T02:00:00Z'),                     // two days later: late
    ],
    cycle: [{ title: 'MLBB', createdAt: '2026-11-12T03:00:00Z', reviews: [{}] }, { title: 'MLBB', createdAt: '2026-11-13T03:00:00Z', reviews: [] }],
  };
  const q = titleQuality('MLBB', data, '2026-11-10', '2026-11-16');
  assert.deepEqual([q.parts.planKept.hit, q.parts.planKept.n], [2, 4]);
  assert.deepEqual([q.parts.objective.hit, q.parts.objective.n], [2, 2]);
  assert.deepEqual([q.parts.reported.hit, q.parts.reported.n], [2, 2]);
  assert.deepEqual([q.parts.onTime.hit, q.parts.onTime.n], [2, 3]);
  assert.equal(q.parts.followed.value, 0.75);                    // average 4 of 5
  assert.deepEqual([q.parts.followUps.hit, q.parts.followUps.n], [1, 1]);
  assert.deepEqual([q.parts.reviewed.hit, q.parts.reviewed.n], [1, 2]);
  assert.equal(q.sessions, 3); assert.equal(q.days, 3);         // a, b, and r2 (no session behind it)
  assert.equal(q.score, Math.round(((0.5 + 1 + 1 + 2 / 3 + 0.75 + 1 + 0.5) / 7) * 100));
  const p = titleQuality('PUBG Mobile', data, '2026-11-10', '2026-11-16');
  assert.equal(p.parts.followed, null); assert.equal(p.parts.reviewed, null); assert.equal(p.parts.onTime, null);
  assert.ok(p.lowSample, `fewer than ${MIN_SESSIONS} sessions`);
});

test('windows and change: compared with the week before only when both have enough sessions', () => {
  const week = (start, n, progress) => Array.from({ length: n }, (_, i) => R(`${start}-${i}`, 'Dota 2', start, progress, `${start}T10:00:00Z`));
  const data = { scrims: [], reports: [...week('2026-11-05', 3, 2), ...week('2026-11-12', 3, 5)], cycle: [] };
  const [row] = practiceQuality(['Dota 2'], data, '2026-11-16', 7);
  assert.equal(row.from, '2026-11-10'); assert.equal(row.score, 100); assert.equal(row.prevScore, 63); assert.equal(row.change, 37);
  const thin = practiceQuality(['Dota 2'], { ...data, reports: data.reports.slice(1) }, '2026-11-16', 7)[0];
  assert.equal(thin.change, null, 'last week had only 2 sessions');
  assert.equal(practiceQuality(['eFootball'], data, '2026-11-16')[0].score, null);
});
