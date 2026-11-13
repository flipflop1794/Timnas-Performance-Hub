import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { localDay } from '../src/core/dates.js';
import { FIELDS, FORM, EVENTS, formOf, fieldForm, coverage } from '../src/core/competitors.js';
import { autoCard, cardMarkdown } from '../src/core/oppcard.js';

const DATE = /^\d{4}(-\d\d(-\d\d)?)?$/;

test('public results: every line names a nation in that title\'s published field, a date and a source', () => {
  for (const f of FORM) {
    assert.ok(FIELDS[f.title], `${f.title} is a WEC title`);
    assert.ok(FIELDS[f.title].includes(f.nation), `${f.nation} is in the ${f.title} field`);
    assert.match(f.date, DATE, `${f.title}|${f.nation} date`);
    assert.ok(f.event && f.result && f.source, `${f.title}|${f.nation} has event, result and source`);
  }
  for (const e of EVENTS) { assert.ok(FIELDS[e.title]); assert.match(e.date, DATE); assert.ok(e.source); }
});

test('formOf: own line replaces the bare podium for the same event; newest first', () => {
  const my = formOf('MLBB', 'Malaysia');
  assert.equal(my.filter((x) => x.event === 'WEC25 Kuala Lumpur').length, 1, 'no duplicate for WEC25');
  assert.ok(my.some((x) => x.event === 'Asian Games 2026 Aichi-Nagoya' && x.result === 'Bronze' && x.podium));
  assert.deepEqual(my.map((x) => x.date), [...my.map((x) => x.date)].sort().reverse());
  assert.ok(formOf('MLBB Women', 'Egypt').length >= 2, 'Egypt women: two WEC bronzes');
  assert.deepEqual(formOf('MLBB Women', 'Argentina'), []);
  const mm = formOf('MLBB', 'Myanmar');
  assert.equal(mm.filter((x) => /Asian Games 2026/.test(x.event)).length, 1); assert.match(mm[0].result, /4–0 over Indonesia/);
  assert.deepEqual(fieldForm('Dota 2').without, ['Egypt']);
});

test('fieldForm lists the gaps; public results do not change scouting coverage', () => {
  const w = fieldForm('MLBB Women');
  assert.deepEqual(w.without, ['Argentina']);
  assert.ok(w.events.length >= 2);
  const d = coverage().find((x) => x.title === 'Dota 2');
  assert.equal(d.noted, 2, 'coverage still counts staff notes only');
});

test('page: competitors tab — last change, roster-changed flag, sort by latest change, public result to note, Today panel', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-rivals', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  assert.match(main(), /Recent results on record — MLBB/); assert.match(main(), /Last change/);
  const rowOf = (n) => [...d.querySelectorAll('#main table.comp-t tbody tr')].find((tr) => tr.cells[0]?.textContent.startsWith(n));
  assert.match(rowOf('Myanmar').textContent, /roster changed/);
  d.querySelector('[data-comp-sort="recent"]').click(); await wait();
  assert.equal(d.querySelector('[data-comp-sort="recent"]').getAttribute('aria-pressed'), 'true');
  const first = d.querySelector('#main table.comp-t tbody tr td b').textContent;
  assert.ok(['Myanmar', 'Türkiye', 'Cambodia'].includes(first), `latest change first, got ${first}`);
  const btn = [...d.querySelectorAll('[data-form-note]')].find((b) => JSON.parse(b.dataset.formNote).nation === 'Türkiye');
  btn.click(); await wait();
  assert.equal(d.getElementById('rvN-MLBB').value, 'Türkiye'); assert.match(d.getElementById('rvT-MLBB').value, /WEC25/); assert.ok(d.getElementById('rvD-MLBB').open);
  assert.equal(d.querySelectorAll('[data-form-note]').length > 0, true);
  // Today lists the 13 Nov roster changes while they are less than 14 days old.
  if (localDay() <= '2026-11-27') { dom.window.location.hash = 'today'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); assert.match(main(), /Rival roster changes/); assert.match(main(), /J3X/); }
});

test('page: Today opens with a ranked "needs attention" list, each item linking to the screen that fixes it', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#today', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document;
  const panel = d.querySelector('#main .attention'); assert.ok(panel, 'panel shown');
  assert.match(panel.textContent, /Needs attention now/);
  const levels = [...panel.querySelectorAll('li .tag')].map((x) => x.textContent);
  const rank = { now: 0, today: 1, 'this week': 2 };
  assert.deepEqual(levels, [...levels].sort((a, b) => rank[a] - rank[b]), 'most urgent first');
  // Every seeded rival roster was read on 3 Nov, so weekly checks are due from 10 Nov.
  assert.match(panel.textContent, /Rival roster checks due \(weekly\): \d+/);
  assert.ok([...panel.querySelectorAll('a.btn')].every((a) => a.getAttribute('href').startsWith('#')), 'each item links to a screen');
  // Panel comes before the personal queue.
  const panels = [...d.querySelectorAll('#main > .panel, #main .panel')];
  assert.ok(panels.indexOf(panel) < panels.findIndex((p) => /To review/.test(p.textContent)));
});

test('opponent card carries recent public results in the markdown', () => {
  const a = autoCard({ title: 'MLBB', nation: 'Türkiye', per: null, team: null, data: {}, asOf: '2026-11-13' });
  assert.ok(a.results.length >= 1);
  const md = cardMarkdown(a, null);
  assert.match(md, /## Recent results \(public\)/);
  assert.match(md, /bronze match/);
  // Egypt is the one Dota 2 rival with no public result on record (Belarus got one in iteration 2).
  const b = autoCard({ title: 'Dota 2', nation: 'Egypt', per: null, team: null, data: {}, asOf: '2026-11-13' });
  assert.doesNotMatch(cardMarkdown(b, null), /Recent results/);
});
