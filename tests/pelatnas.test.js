// V1.16 Pelatnas board: camp dates, availability, schedule from the planner, attendance, the request message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/core/pelatnas.js';

test('camp dates: TBD until recorded, proposed until confirmed with a source', () => {
  assert.equal(P.campLine(null).state, 'tbd');
  assert.match(P.campLine(null).text, /TBD — to be confirmed by PB ESI BOD/);
  const prop = P.campDates({ start: '2026-11-20', end: '2026-12-13', venue: '', status: 'proposed', by: 'Aufa Bassam' });
  assert.match(P.campLine(prop, '2026-11-12').text, /proposed, not confirmed.*starts in 8 days/);
  assert.throws(() => P.campDates({ start: '2026-11-20', end: '2026-12-13', status: 'confirmed', by: 'Fayad' }), /need a source/);
  assert.throws(() => P.campDates({ start: '2026-12-20', end: '2026-12-13', status: 'proposed', by: 'Fayad' }), /before the start/);
  const conf = P.campDates({ start: '2026-11-20', end: '2026-12-13', status: 'confirmed', source: 'BOD letter', by: 'Fayad' });
  assert.match(P.campLine(conf, '2026-11-25').text, /^Pelatnas 2026-11-20 to 2026-12-13 — in progress/);
});

test('availability: statuses, date checks, reason categories only, history kept', () => {
  const a = P.availability(null, { title: 'Dota 2', player: 'Fbz', status: 'Available for part of it', from: '2026-11-20', to: '2026-12-14', conflicts: [{ from: '2026-11-22', to: '2026-11-23', reason: 'Club match or tournament' }], by: 'Aufa' });
  assert.equal(a.id, 'AV-Dota_2-Fbz'); assert.equal(a.origin, 'operational');
  assert.equal(P.availableOn(a, '2026-11-21'), true);
  assert.equal(P.availableOn(a, '2026-11-22'), false, 'conflict day');
  assert.equal(P.availableOn(a, '2026-11-19'), false, 'before available from');
  assert.equal(P.availableOn(null, '2026-11-21'), null);
  assert.throws(() => P.availability(null, { title: 'Dota 2', player: 'Fbz', status: 'Available for part of it', by: 'Aufa' }), /part of it/);
  assert.throws(() => P.availability(null, { title: 'Dota 2', player: 'Fbz', status: 'Not available', conflicts: [{ from: '2026-11-22', to: '2026-11-23', reason: 'Sick' }], by: 'Aufa' }), /reason category/);
  assert.throws(() => P.availability(null, { title: 'Dota 2', player: 'Fbz', status: 'Asked, waiting', note: 'call 0812 3456 7890', by: 'Aufa' }), /phone or ID/);
  const b = P.availability(a, { title: 'Dota 2', player: 'Fbz', status: 'Available for all of it', by: 'Aufa' });
  assert.equal(b.history.length, 1); assert.equal(b.history[0].status, 'Available for part of it');
  const sum = P.availabilitySummary({ 'Dota 2': ['Fbz', 'Mikoto'] }, [b]);
  assert.deepEqual([sum[0].players, sum[0].answered, sum[0].full, sum[0].open], [2, 1, 1, ['Mikoto']]);
});

test('schedule comes from the planner; attendance per session and its rate', () => {
  const scrims = [
    { id: 'SC-1', title: 'Dota 2', date: '2026-11-21', time: '19:00', kind: 'scrim', status: 'planned' },
    { id: 'SC-2', title: 'MLBB', date: '2026-11-21', time: '10:00', kind: 'review', status: 'planned' },
    { id: 'SC-3', title: 'MLBB', date: '2026-11-21', time: '', kind: 'scrim', status: 'cancelled' },
    { id: 'SC-4', title: 'MLBB', date: '2026-11-22', time: '10:00', kind: 'scrim', status: 'planned' },
  ];
  assert.deepEqual(P.daySessions(scrims, '2026-11-21').map((s) => s.id), ['SC-2', 'SC-1']);
  assert.deepEqual(P.daySessions(scrims, '2026-11-21', ['Dota 2']).map((s) => s.id), ['SC-1']);
  const r = P.attendance(scrims[0], { Fbz: 'present', Mikoto: 'late', jikroy: 'absent', Jhocam: '' }, { by: 'Aufa' });
  assert.equal(r.id, 'AT-SC-1'); assert.deepEqual(Object.keys(r.marks), ['Fbz', 'Mikoto', 'jikroy']);
  assert.throws(() => P.attendance(scrims[0], {}, { by: 'Aufa' }), /at least one/);
  assert.throws(() => P.attendance(scrims[0], { Fbz: 'sick' }, { by: 'Aufa' }), /Unknown mark/);
  const rate = P.attendanceRate([r]);
  assert.deepEqual([rate.marked, rate.there, rate.late], [3, 2, 1]); assert.equal(Math.round(rate.rate * 100), 67);
  assert.equal(P.attendanceRate([]).rate, null);
});

test('availability message: dates and reason categories only; says when dates are not final', () => {
  for (const lang of ['id', 'en']) {
    const m = P.availabilityMessage({ lang });
    assert.doesNotMatch(m, /Rp|IDR|\$|\d{1,3}\.\d{3}/, 'no money figures');
    assert.doesNotMatch(m, /\bSK\b|compensation|kompensasi/i);
    assert.match(m, lang === 'id' ? /menunggu konfirmasi PB ESI/ : /to be confirmed by PB ESI/);
  }
  const prop = P.campDates({ start: '2026-11-20', end: '2026-12-13', status: 'proposed', by: 'Aufa' });
  assert.match(P.availabilityMessage({ lang: 'id', camp: prop }), /usulan, belum final/);
});
