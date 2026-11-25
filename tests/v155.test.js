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

// V1.57 (owner's ask): the Menu of V1.55 is gone; every section is on the top bar, always, as up to V1.54.
test('top bar: every section always visible, no Menu to open; changing page keeps them all', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/#today', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); } });
  const d = dom.window.document; await new Promise((r) => setTimeout(r, 300));
  const bar = () => [...d.querySelectorAll('#titles > button')].map((b) => b.textContent.trim());
  assert.equal(d.getElementById('menuBtn'), null, 'no Menu button'); assert.equal(d.getElementById('titlesMore'), null, 'nothing folded away');
  for (const g of ['Today', 'Competitors', 'Tournament', 'Dota 2', 'PUBG Mobile', 'MLBB', 'MLBB Women', 'eFootball', 'CS2', 'CS2 Women', 'Performance', 'Guide', 'Staff']) assert.ok(bar().includes(g), `${g} on the top bar`);
  [...d.querySelectorAll('#titles > button')].find((b) => b.textContent === 'Guide').click(); await new Promise((r) => setTimeout(r, 150));
  assert.match(dom.window.location.hash, /guide/);
  assert.ok(bar().includes('Dota 2') && bar().includes('Staff'), 'still every section after changing page');
  assert.equal([...d.querySelectorAll('#titles > button')].find((b) => b.getAttribute('aria-pressed') === 'true' && b.id !== 'homeBtn').textContent, 'Guide', 'the section you are on is marked');
});
