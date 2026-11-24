// V1.55 visual pass: plain plurals on the English page, and the one-row top menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { plural, pluralDom, tr } from '../src/hub/i18n.js';

test('plain plurals: the number decides; without a number the plural is used', () => {
  assert.equal(plural('2 session(s) planned from this pack.'), '2 sessions planned from this pack.');
  assert.equal(plural('1 line(s) left out: a number not in the trend.'), '1 line left out: a number not in the trend.');
  assert.equal(plural('5 athlete visit(s) · 1 follow-up(s) · 0 athlete(s) seen'), '5 athlete visits · 1 follow-up · 0 athletes seen');
  assert.equal(plural('Upload scoreboard screenshot(s)'), 'Upload scoreboard screenshots');
  assert.equal(plural('1 more screenshot(s) waiting.'), '1 more screenshot waiting.');
  assert.equal(plural('No change'), 'No change');
  // The Indonesian rules still see the source text.
  assert.ok(tr('Upload scoreboard screenshot(s)'), 'the source string keeps its translation');
});

test('pluralDom rewrites text and titles, and leaves what the coach typed alone', () => {
  const d = new JSDOM('<div id="r"><p>3 game(s) <b title="2 note(s)">1 note(s)</b></p><textarea>keep 2 item(s)</textarea></div>').window.document;
  pluralDom(d.getElementById('r'));
  assert.equal(d.querySelector('p').textContent, '3 games 1 note'); assert.equal(d.querySelector('b').title, '2 notes');
  assert.equal(d.querySelector('textarea').textContent, 'keep 2 item(s)');
});

test('top menu: one row, the rest under Menu; every group is still a button', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/#today', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); } });
  const d = dom.window.document; await new Promise((r) => setTimeout(r, 300));
  const topRow = [...d.querySelectorAll('#titles > button')].map((b) => b.textContent.trim());
  assert.ok(topRow.length <= 6, `top row is short: ${topRow.join(' | ')}`); assert.ok(topRow.some((t) => /Menu/.test(t)));
  const more = d.getElementById('titlesMore'); assert.ok(more.hidden, 'closed until Menu is tapped');
  assert.ok([...more.querySelectorAll('button')].some((b) => b.textContent === 'Guide'), 'the other groups are under Menu');
  d.getElementById('menuBtn').click(); await new Promise((r) => setTimeout(r, 50));
  assert.equal(d.getElementById('titlesMore').hidden, false); assert.equal(d.getElementById('menuBtn').getAttribute('aria-expanded'), 'true');
  [...d.querySelectorAll('#titlesMore button')].find((b) => b.textContent === 'Guide').click(); await new Promise((r) => setTimeout(r, 150));
  assert.match(dom.window.location.hash, /guide/); assert.ok(d.getElementById('titlesMore').hidden, 'changing page closes the menu');
  assert.equal([...d.querySelectorAll('#titles > button')].find((b) => b.getAttribute('aria-pressed') === 'true' && b.id !== 'homeBtn').textContent, 'Guide', 'the group you are on moves to the top row');
});
