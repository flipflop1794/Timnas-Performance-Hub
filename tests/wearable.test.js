// V1.51 Coach Donny's readiness index (IKB) and the per-athlete summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ikbFrom, ikbSeries, IKB, wearSummary, recoveryBand, hours, inviteText } from '../src/core/wearable.js';

test('IKB: the worked example in Donny\'s file (40.05 with load); without load the weights re-normalise', () => {
  const withLoad = { ...IKB, weights: { ...IKB.weights, BEBAN: { w: 0.2, s: -1 } } };
  assert.deepEqual(ikbFrom({ LNHRV: -0.8, DTT: -1.2, RHR: 0.5, KETERATURAN: -2.0, BEBAN: 0.6 }, withLoad), { value: 40.05, band: 'watch', n: 5 });
  assert.equal(ikbFrom({ LNHRV: -0.8, DTT: -1.2, RHR: 0.5, KETERATURAN: -2.0 }).value, 39.06);
  assert.equal(ikbFrom({ LNHRV: 1, DTT: 1 }).value, null, 'three parts at least');
  assert.equal(ikbFrom({ LNHRV: 9, DTT: 9, RHR: -9 }).value, 80, 'z clamped at 3');
});

test('IKB series: needs 2 earlier days; a bad night after steady ones reads low', () => {
  const day = (d, hrv, sleepMin, rhr, mid) => ({ day: `2026-11-${String(d).padStart(2, '0')}`, hrv, sleepMin, rhr, mid });
  const s = ikbSeries([day(10, 50, 420, 60, 900), day(11, 54, 440, 58, 910), day(12, 52, 430, 59, 905), day(13, 30, 300, 70, 1080)]);
  assert.equal(s[0].value, null); assert.equal(s[1].value, null);
  assert.ok(s[2].value != null); assert.equal(s[3].band, 'low');
});

test('summary: today, 7-day average, 14 dots, linked athletes without data still listed', () => {
  const asOf = '2026-11-24';
  const days = [21, 22, 23, 24].map((d, i) => ({ title: 'MLBB Women', athlete: 'Vivy', day: `2026-11-${d}`, data: { recovery: [30, 50, 70, 90][i], sleepMin: 400 } }));
  const s = wearSummary(days, [{ title: 'MLBB Women', athlete: 'Vivy' }, { title: 'MLBB Women', athlete: 'Fumy', needs_reconnect: true }], asOf);
  const v = s.find((a) => a.athlete === 'Vivy'); const f = s.find((a) => a.athlete === 'Fumy');
  assert.equal(v.today.recovery, 90); assert.equal(v.avg7, 60); assert.equal(v.days14.length, 14); assert.equal(v.days14.at(-1).recovery, 90);
  assert.equal(f.today, null); assert.equal(f.link.needs_reconnect, true);
  assert.deepEqual([recoveryBand(67), recoveryBand(66), recoveryBand(33), recoveryBand(null)], ['green', 'yellow', 'red', '']);
  assert.equal(hours(395), '6j 35m');
  assert.match(inviteText('Vivy', 'https://x/whoop?go=1'), /^Halo Vivy,[\s\S]*https:\/\/x\/whoop\?go=1\nLink berlaku 7 hari\.$/);
});
