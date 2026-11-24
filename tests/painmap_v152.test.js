// V1.52 the physios asked for the back of the thigh and the calf, left and right, on the back figure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, isPoint, pointLabel, cleanPain, bodySvg } from '../src/core/painmap.js';

test('hamstring and calf: left and right on the back figure, labelled in both languages, saved like the others', () => {
  for (const id of ['hamstring_L', 'hamstring_R', 'calf_L', 'calf_R']) {
    assert.ok(isPoint(id), id); assert.equal(POINTS.find((p) => p.id === id).view, 'back');
  }
  assert.equal(pointLabel('hamstring_L', 'id'), 'Hamstring (paha belakang) kiri');
  assert.equal(pointLabel('calf_R', 'id'), 'Betis kanan');
  assert.equal(pointLabel('calf_L'), 'Calf (left)');
  assert.deepEqual(cleanPain([{ p: 'hamstring_R', v: 6 }, { p: 'calf_L', v: '' }]), [{ p: 'hamstring_R', v: 6 }, { p: 'calf_L', v: null }]);
  // tappable on the form; the person's left sits on the viewer's left of the back figure (centre 110)
  const svg = bodySvg({ row: 0 });
  const cx = (id) => Number(svg.match(new RegExp(`cx="([\\d.]+)" cy="[\\d.]+" r="\\d+"[^>]*data-pt="${id}"`))[1]);
  assert.ok(cx('hamstring_L') < 110 && cx('hamstring_R') > 110 && cx('calf_L') < 110 && cx('calf_R') > 110);
  // old reports keep working
  assert.ok(isPoint('knee_L') && isPoint('trochanter_R'));
});
