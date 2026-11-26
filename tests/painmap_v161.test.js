// V1.61 the physios asked for the front of the shoulder, left and right, on the front figure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, isPoint, pointLabel, bodySvg } from '../src/core/painmap.js';

test('front shoulder (deltoid): left and right on the front figure, labelled in both languages', () => {
  for (const id of ['deltoid_L', 'deltoid_R']) { assert.ok(isPoint(id), id); assert.equal(POINTS.find((p) => p.id === id).view, 'front'); }
  assert.equal(pointLabel('deltoid_L', 'id'), 'Bahu depan (deltoid) kiri');
  assert.equal(pointLabel('deltoid_R'), 'Front shoulder (deltoid) (right)');
  // the person's left is on the viewer's right of the front figure (centre 330)
  const svg = bodySvg({ row: 0 });
  const cx = (id) => Number(svg.match(new RegExp(`cx="([\\d.]+)" cy="[\\d.]+" r="\\d+"[^>]*data-pt="${id}"`))[1]);
  assert.ok(cx('deltoid_L') > 330 && cx('deltoid_R') < 330);
});
