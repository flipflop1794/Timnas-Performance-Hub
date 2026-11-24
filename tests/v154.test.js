// V1.54 the work behind the numbers: a staff member's week day by day, what they have done so far, and one line per
// staff member for the readers of every report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportReport, calWeek, myDays, reportStreak, soFar, roleResult, teamBoard, boardText } from '../src/core/support.js';

const rep = (by, date, discipline, rows, extra = {}) => ({ ...supportReport({ date, discipline, by, rows, ...extra }), id: `SR-${by}-${date}` });
const W = calWeek('2026-11-25');   // Monday 23 to Sunday 29 November 2026
const reports = [
  rep('Ilham', '2026-11-23', 'physio', [{ athlete: 'Rinz', title: 'MLBB', did: 'Massage bahu', vasBefore: '6', vasAfter: '3', response: 'better', followUp: 'Cek lagi besok' }, { athlete: 'Kiboy', title: 'MLBB', did: 'Stretching', response: 'same' }]),
  rep('Ilham', '2026-11-24', 'physio', [{ athlete: 'Rinz', title: 'MLBB', did: 'Cek ulang bahu', vasBefore: '3', vasAfter: '2', response: 'better' }]),
  rep('Ilham', '2026-11-25', 'physio', [], { general: { did: 'Pemanasan bersama', found: '', teams: ['MLBB'] } }),
  rep('Ilham', '2026-11-18', 'physio', [{ athlete: 'Vivi', title: 'MLBB Women', did: 'Terapi pergelangan' }]),
  rep('Fadhil', '2026-11-24', 'psych', [{ athlete: 'Rinz', title: 'MLBB', did: 'Konseling', session: 'formal' }]),
];

test('my week day by day: own reports only, in their own words; a day without a report is empty', () => {
  const days = myDays(reports, 'Ilham', W);
  assert.equal(days.length, 7); assert.deepEqual(days.map((d) => d.reports), [1, 1, 1, 0, 0, 0, 0]);
  assert.deepEqual(days[0].items.map((x) => [x.athlete, x.did]), [['Rinz', 'Massage bahu'], ['Kiboy', 'Stretching']]);
  assert.equal(days[0].items[0].followUp, 'Cek lagi besok');
  assert.deepEqual(days[2].general, [{ teams: ['MLBB'], did: 'Pemanasan bersama' }]);
  assert.ok(!JSON.stringify(days).includes('Konseling'), 'another staff member\'s work is never in it');
});

test('so far: totals since the first report and the run of days reported', () => {
  assert.equal(reportStreak(reports, 'Ilham', '2026-11-25'), 3);
  assert.equal(reportStreak(reports, 'Ilham', '2026-11-26'), 3, 'today not in yet: the run up to yesterday still counts');
  assert.equal(reportStreak(reports, 'Ilham', '2026-11-27'), 0);
  const s = soFar(reports, 'Ilham', '2026-11-25');
  assert.equal(s.since, '2026-11-18'); assert.equal(s.days, 4); assert.equal(s.athletes, 3); assert.equal(s.visits, 4); assert.equal(s.streak, 3);
  assert.equal(soFar(reports, 'Ekky', '2026-11-25'), null);
  assert.match(roleResult('physio', s), /pain down 2 on average \(2 treatments\) · better 2\/3/);
  assert.match(roleResult('psych', soFar(reports, 'Fadhil', '2026-11-25'), 'id'), /sesi formal 1 · informal 0/);
  assert.equal(roleResult('medic', { responded: 0 }), '');
});

test('team board: one row per staff member, also those with no report; a list by role, not a ranking', () => {
  const staff = [{ name: 'Ekky', job: 'physical' }, { name: 'Ilham', job: 'physio_men' }, { name: 'Fadhil', job: 'psych_men' }];
  const b = teamBoard(staff, reports, W, '2026-11-25');
  assert.deepEqual(b.map((p) => p.name), ['Ilham', 'Ekky', 'Fadhil'], 'physio, physical, psychologist');
  const ilham = b[0]; assert.equal(ilham.cur.days, 3); assert.equal(ilham.cur.athletes, 2); assert.equal(ilham.cur.visits, 3); assert.equal(ilham.prev.athletes, 1);
  assert.deepEqual(ilham.days, [2, 1, 0, null, null, null, null]); assert.equal(ilham.last, '2026-11-25');
  assert.equal(ilham.open, 0, 'the follow-up on Rinz was closed by the newer report on the same athlete');
  const ekky = b[1]; assert.equal(ekky.cur.reports, 0); assert.equal(ekky.last, ''); assert.equal(ekky.disc, 'physical');
  // Someone who filed but has no support account still gets a row.
  assert.ok(teamBoard([], reports, W, '2026-11-25').some((p) => p.name === 'Fadhil'));
  const text = boardText(b, W, 'en');
  assert.match(text, /Ilham \(Physio \/ massage\): reported 3\/7 days · 2 athletes · 3 visits/); assert.match(text, /Ekky \(Physical conditioning\): reported 0\/7 days/);
  assert.doesNotMatch(text, /Rinz|Kiboy|bahu/, 'no athlete names and no findings in the WhatsApp text');
  assert.match(text, /not from all the work done/);
});
