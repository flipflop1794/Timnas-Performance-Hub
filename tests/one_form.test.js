// V1.16 one form: a scrim report is also the session's daily report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyFromReport, sessionFromReport, NOTE_LIMIT } from '../src/core/daily_sessions.js';
import { planScrim, completeScrim } from '../src/core/scrims.js';
import { titleQuality } from '../src/core/practice_quality.js';

const coach = { id: 'u-indra', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB'] };
const report = (extra = {}) => ({ id: 'RP-1', title: 'MLBB', date: '2026-11-11', partner: 'Team Q', focus: 'Turtle setup', worked: 'Clean first turtle', failed: 'Late lord vision', adjust: 'Ward before lord', createdAt: '2026-11-11T12:00:00Z', progress: 4, result: { mode: 'wl', won: 2, lost: 1, drawn: 0 }, ...extra });

test('report fields map onto the daily report; nothing required is left empty; long text is cut to the limit', () => {
  assert.deepEqual(dailyFromReport(report(), '2-1'), { objective: 'Turtle setup', outcome: '2-1 vs Team Q. Clean first turtle', issue: 'Late lord vision', nextAction: 'Ward before lord' });
  assert.equal(dailyFromReport(report({ failed: '' }), '2-1').issue, 'No main issue noted');
  assert.equal(dailyFromReport(report({ adjust: 'x'.repeat(900) }), '2-1').nextAction.length, NOTE_LIMIT);
});

test('without a planned session: a completed scrim session is created with the daily report and follow-up', () => {
  const s = sessionFromReport(report(), '2-1', coach, { id: 'SC-new', today: '2026-11-12' });
  assert.equal(s.id, 'SC-new'); assert.equal(s.status, 'done'); assert.equal(s.kind, 'scrim'); assert.equal(s.partner, 'Team Q');
  assert.equal(s.dailyReport.objective, 'Turtle setup'); assert.equal(s.dailyReport.fromReport, 'RP-1');
  assert.deepEqual([s.followUp.ownerId, s.followUp.due, s.followUp.status], ['u-indra', '2026-11-13', 'Open']);
});

test('closing a planned session attaches the daily report to it; no permission or already reported = nothing', () => {
  const planned = { ...planScrim({ title: 'MLBB', date: '2026-11-11', kind: 'scrim', partner: 'Team Q', owner: 'Coach Indra' }), id: 'SC-p' };
  const done = completeScrim(planned, { score: '2-1', by: 'Coach Indra' });
  const s = sessionFromReport(report(), '2-1', coach, { session: done, today: '2026-11-12' });
  assert.equal(s.id, 'SC-p'); assert.equal(s.result.score, '2-1'); assert.equal(s.dailyReport.nextAction, 'Ward before lord');
  assert.equal(sessionFromReport(report(), '2-1', coach, { session: s, today: '2026-11-12' }), null, 'already has a daily report');
  assert.equal(sessionFromReport(report({ title: 'Dota 2' }), '1-0', coach, { id: 'SC-x', today: '2026-11-12' }), null, 'not his title');
});

test('practice quality counts a report and the daily report made from it as one filing', () => {
  const s = sessionFromReport(report(), '2-1', coach, { id: 'SC-new', today: '2026-11-12' });
  const q = titleQuality('MLBB', { scrims: [s], reports: [report({ scrimId: 'SC-new' })], cycle: [] }, '2026-11-06', '2026-11-12');
  assert.deepEqual([q.parts.onTime.hit, q.parts.onTime.n], [1, 1]); assert.equal(q.sessions, 1); assert.deepEqual([q.parts.reported.hit, q.parts.reported.n], [1, 1]);
});
