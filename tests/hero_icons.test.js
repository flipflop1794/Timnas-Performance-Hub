// V1.39 — hero avatars: the reference data covers every hero, the reader is the same code that built the
// data (checked against values computed in the browser), and a crop is read through scaling, an offset,
// a frame and a darker screenshot, while an unknown portrait is only suggested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featureOf, windowsOf, encodeFeature, decodeFeature, distance, readHero, learnFrom, referenceSet, FEATURE_LEN, SURE_MAX } from '../src/core/hero_icons.js';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const HEROES = json('../data/mlbb/heroes.json').heroes.map((h) => h.name);
const ICONS = json('../data/mlbb/hero_icons.json');

// A synthetic test pattern (no game art in the tests).
function pattern(w, h, seed = 0) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = (x * 7 + y * 13 + seed * 31) % 256; d[i + 1] = (x * x + 3 * y + seed * 17) % 256; d[i + 2] = (x * y + seed * 5) % 256; d[i + 3] = 255;
    }
  }
  return d;
}
// A smooth "portrait": colour blobs, so it can be scaled like a real icon.
function portrait(size, seed) {
  const d = new Uint8ClampedArray(size * size * 4); const rnd = (k) => (Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1;
  const blobs = Array.from({ length: 6 }, (_, k) => ({ x: Math.abs(rnd(k)) * size, y: Math.abs(rnd(k + 9)) * size, r: (0.2 + Math.abs(rnd(k + 19)) * 0.3) * size, c: [Math.abs(rnd(k + 29)) * 255, Math.abs(rnd(k + 39)) * 255, Math.abs(rnd(k + 49)) * 255] }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let R = 40; let G = 40; let B = 50;
      for (const b of blobs) { const t = Math.max(0, 1 - Math.hypot(x - b.x, y - b.y) / b.r); R += b.c[0] * t; G += b.c[1] * t; B += b.c[2] * t; }
      const i = (y * size + x) * 4; d[i] = Math.min(255, R); d[i + 1] = Math.min(255, G); d[i + 2] = Math.min(255, B); d[i + 3] = 255;
    }
  }
  return d;
}
// Area resize of a square image (what the browser does when a screenshot is smaller).
function resize(src, s, t) {
  const out = new Uint8ClampedArray(t * t * 4);
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const acc = [0, 0, 0]; let n = 0;
      for (let sy = Math.floor((y * s) / t); sy < Math.ceil(((y + 1) * s) / t); sy++) {
        for (let sx = Math.floor((x * s) / t); sx < Math.ceil(((x + 1) * s) / t); sx++) { const i = (sy * s + sx) * 4; acc[0] += src[i]; acc[1] += src[i + 1]; acc[2] += src[i + 2]; n++; }
      }
      const o = (y * t + x) * 4; out[o] = acc[0] / n; out[o + 1] = acc[1] / n; out[o + 2] = acc[2] / n; out[o + 3] = 255;
    }
  }
  return out;
}
// Put a portrait into a larger, darker crop with a gold ring (a loose crop from a screenshot).
function framed(src, s, canvas, dx, dy, dim = 1) {
  const out = new Uint8ClampedArray(canvas * canvas * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = 27; out[i + 1] = 35; out[i + 2] = 51; out[i + 3] = 255; }
  const ox = Math.round((canvas - s) / 2 + dx); const oy = Math.round((canvas - s) / 2 + dy);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const X = x + ox; const Y = y + oy; if (X < 0 || Y < 0 || X >= canvas || Y >= canvas) continue;
      const i = (y * s + x) * 4; const o = (Y * canvas + X) * 4;
      const r = Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2);
      if (r > s / 2) continue;
      if (r > s / 2 - 2) { out[o] = 201; out[o + 1] = 162; out[o + 2] = 74; continue; }
      out[o] = src[i] * dim; out[o + 1] = src[i + 1] * dim; out[o + 2] = src[i + 2] * dim;
    }
  }
  return out;
}

test('every hero on the list has an official icon reference, 96 bytes each', () => {
  assert.equal(ICONS.count, HEROES.length);
  assert.deepEqual(Object.keys(ICONS.icons).sort(), [...HEROES].sort());
  for (const s of Object.values(ICONS.icons)) assert.equal(decodeFeature(s).length, FEATURE_LEN);
  assert.equal(FEATURE_LEN, ICONS.algorithm.bytes);
});

test('the reader is the code that built the data (values computed in the browser, 21 Nov 2026)', () => {
  assert.equal(encodeFeature(featureOf(pattern(128, 128), 128, 128)),
    'g4B4tXyEfH98sH1/tH2CUIGBhICAiH6BVoR/q3yCjn5+yXt9U4J9kYCGnn52rH6DWYF7cYCJloB6sHp/UYODcX+AT4OBhYGAUoOFPYSBm4KDOoR+UoF9sn6DboB6hn+G');
  assert.equal(encodeFeature(featureOf(pattern(50, 50), 50, 50, 3, 4, 40)),
    'jJCTbaZKZntcY292d5VRTahjeGJpeYuCn4eKvVmVmp1XRnGVt4F8oWueo26sV5eBuWZ3eYWssGeoi4FsUYdYU5Nq3UWRUaaga3xOZoBfgoprfnuGLZR0jYxjiHt+qWmI');
  assert.equal(windowsOf(pattern(56, 56), 56, 56).length, 28);
});

test('official icons are far enough apart that an exact icon is always read as sure', () => {
  const refs = referenceSet(ICONS); let min = Infinity;
  for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) min = Math.min(min, distance(refs[i].f, refs[j].f));
  assert.ok(min > SURE_MAX * 1.4, `closest two heroes ${min.toFixed(1)}`);
});

test('a learned portrait is read again through scaling, a frame, an offset and a darker screenshot', () => {
  const big = portrait(128, 7); const refs = [...referenceSet(ICONS), { hero: 'Lukas', f: decodeFeature(learnFrom({ data: big, width: 128, height: 128 }, 'Lukas').f), learned: true }];
  const cases = [
    { data: resize(big, 128, 48), width: 48, height: 48 },
    { data: framed(resize(big, 128, 48), 48, 56, 0, 0), width: 56, height: 56 },
    { data: framed(resize(big, 128, 46), 46, 56, 3, -2, 0.75), width: 56, height: 56 },
  ];
  for (const c of cases) {
    const r = readHero(c, refs);
    assert.equal(r.candidates[0].hero, 'Lukas'); assert.ok(r.candidates[0].learned);
  }
  assert.ok(readHero(cases[0], refs).sure, 'a clean crop fills the box');
});

test('an unknown portrait is not filled in; suggestions only; `allow` limits the heroes', () => {
  const refs = referenceSet(ICONS);
  const r = readHero({ data: portrait(56, 99), width: 56, height: 56 }, refs);
  assert.equal(r.sure, false); assert.equal(r.hero, ''); assert.equal(r.candidates.length, 3);
  const only = readHero({ data: portrait(56, 99), width: 56, height: 56 }, refs, { allow: new Set(['Atlas', 'Lukas']) });
  assert.deepEqual(only.candidates.map((c) => c.hero).sort(), ['Atlas', 'Lukas']);
  assert.throws(() => featureOf(new Uint8ClampedArray(0), 0, 0), /Empty image/);
  assert.throws(() => decodeFeature('AAAA'), /Bad hero icon feature/);
});
