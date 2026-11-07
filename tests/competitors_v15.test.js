import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { crossTitle, nationProfile, coverage, titleCount, FIELDS } from '../src/core/competitors.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('cross-title: nations ranked by staff main threats, then titles entered', () => {
  assert.equal(titleCount('Egypt'), Object.values(FIELDS).filter((f) => f.includes('Egypt')).length);
  let rows = crossTitle();
  assert.equal(rows[0].nation, 'Egypt');
  assert.ok(!rows.some((r) => r.nation === 'Djibouti'), 'unscouted eFootball-only nations hidden by default');
  assert.ok(crossTitle({}, { includeEfootballUnscouted: true }).some((r) => r.nation === 'Djibouti'));
  rows = crossTitle({ tiers: { 'MLBB|Myanmar': { tier: 'main threat', by: 'Aufa', why: 'AG gold' } } });
  assert.equal(rows[0].nation, 'Myanmar');
});

test('nation profile joins notes, tiers, VODs, stand-in partners, scrims and WEC matches', () => {
  const p = nationProfile('Mongolia', {
    vods: [{ title: 'Dota 2', nation: 'Mongolia', reviewed: true, added: '2026-11-04', tags: [] }],
    partners: [{ title: 'Dota 2', name: 'Team A', level: 'Tier 2', resembles: 'Mongolia' }],
    scrims: [{ title: 'Dota 2', mirrors: 'Mongolia', status: 'done', date: '2026-11-05' }, { title: 'Dota 2', mirrors: 'Mongolia', status: 'planned', date: '2026-11-09' }],
    matches: [{ title: 'Dota 2', opponent: 'Mongolia', date: '2026-12-16', games: [], result: null }],
  });
  assert.deepEqual(p.titles, ['Dota 2', 'PUBG Mobile', 'CS2', 'eFootball']);
  const d = p.per[0];
  assert.equal(d.notes.length, 1); assert.equal(d.vodsReviewed, 1); assert.equal(d.standIns.length, 1);
  assert.equal(d.scrimsDone, 1); assert.equal(d.scrimsPlanned, 1); assert.equal(d.lastScrim, '2026-11-05'); assert.equal(d.wecMatches.length, 1);
  assert.equal(d.updated, '2026-11-04');
});

test('coverage suggests unscouted nations, multi-title first', () => {
  const c = coverage().find((x) => x.title === 'Dota 2');
  assert.equal(c.field, 11); assert.equal(c.noted, 2);
  assert.equal(c.next[0], 'Egypt'); assert.ok(!c.next.includes('Mongolia'));
});

test('page: competitors tab — overview, nation profile, coverage', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#comp-overview', beforeParse(w) { w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 25)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  assert.match(main(), /Competitor analysis/); assert.match(main(), /Egypt/);
  d.getElementById('compEf').click(); await wait(); assert.match(main(), /Djibouti/);
  d.querySelector('[data-nation="Myanmar"]').click(); await wait(); dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /Myanmar enters 3 of our titles: MLBB, PUBG Mobile, eFootball/); assert.match(main(), /Asian Games 2026 MLBB gold/);
  dom.window.location.hash = 'comp-coverage'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /Scout next/);
});

test('scout next: an unscouted main threat comes before multi-title nations; old notes come back as re-checks', async () => {
  const { coverage } = await import('../src/core/competitors.js');
  const c = coverage({ tiers: { 'Dota 2|New Zealand': { tier: 'main threat', by: 'Aufa', why: 'x' } } }, '2026-11-07').find((x) => x.title === 'Dota 2');
  assert.equal(c.next[0], 'New Zealand'); assert.equal(c.next[1], 'Egypt');
  // By 1 Dec the 3 Nov notes on Greece and Mongolia are stale.
  const late = coverage({}, '2026-12-01').find((x) => x.title === 'Dota 2');
  assert.deepEqual(late.stale.sort(), ['Greece', 'Mongolia']);
});
