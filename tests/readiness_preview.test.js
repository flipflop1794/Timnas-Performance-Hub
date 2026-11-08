import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadReadiness, PREVIEW_LABEL, READINESS_SLOT } from '../src/readiness/contract.js';
import { mockProvider, MOCK_TITLES } from '../src/readiness/mockProvider.js';
import { readinessView, trendChart } from '../src/readiness/view.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('mock provider fulfils the contract for every title and for all titles together', async () => {
  assert.equal(READINESS_SLOT.use, 'mock');
  assert.deepEqual(MOCK_TITLES, ['Dota 2', 'MLBB', 'MLBB Women', 'PUBG Mobile', 'CS2', 'CS2 Women', 'eFootball']);
  for (const title of [...MOCK_TITLES, 'All titles']) {
    const d = await loadReadiness(mockProvider, { title, date: '2026-11-03' });
    assert.equal(d.provider.preview, true); assert.equal(d.trend.length, 7);
    for (const a of d.team.athletes) { assert.match(a.name, /Athlete \d/); assert.ok(['red', 'amber', 'green', 'none'].includes(a.status)); assert.equal(a.readiness == null, !a.checkedIn); }
  }
  const a = await loadReadiness(mockProvider, { title: 'Dota 2', date: '2026-11-03' });
  const b = await loadReadiness(mockProvider, { title: 'Dota 2', date: '2026-11-03' });
  assert.deepEqual(a.team, b.team, 'dummy data is stable for a given title and date');
});

test('view renders the preview label, all five components, and only the provider\'s data', async () => {
  const data = await loadReadiness(mockProvider, { title: 'PUBG Mobile', date: '2026-11-03' });
  const out = readinessView({ data, titles: MOCK_TITLES, title: 'PUBG Mobile', date: '2026-11-03' });
  assert.ok(out.includes(PREVIEW_LABEL.replace("'", '&#39;')) || out.includes(PREVIEW_LABEL));
  for (const s of ['Checked in', 'Average readiness', 'Team readiness, 7 days', 'Athletes', 'Needs follow-up', 'Daily check-ins', 'Integration point', 'Dummy data']) assert.ok(out.includes(s), s);
  assert.ok(!/AKx|Satarrr/.test(out), 'no real player names in the preview');
  assert.match(out, /disabled/);
  const fake = { team: { athletes: [{ id: 'x', name: 'Donny test · Athlete 1', title: 'Dota 2', checkedIn: true, checkInTime: '08:00', readiness: 88, status: 'green' }], thresholds: { red: 20, ready: 30 }, scale: { min: 0, max: 100 }, date: 'd', title: 'Dota 2' }, trend: [{ date: '2026-11-03', avg: 88, n: 1 }], alerts: [], provider: { id: 'donny', label: 'Donny API', kind: 'api', preview: false } };
  const o2 = readinessView({ data: fake, titles: MOCK_TITLES, title: 'Dota 2', date: '2026-11-03' });
  assert.match(o2, /Donny API/); assert.match(o2, /red &lt; 20, ready ≥ 30/); assert.ok(!o2.includes('Dummy data:'));
  assert.match(trendChart([{ date: '2026-11-01', avg: null, n: 0 }], { ready: 45 }), /No scored days/);
});

test('page: Performance → Athlete readiness (preview) loads, filters by title and date', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#readiness', beforeParse(w) { w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  // V1.15: opens on Coach Donny's own system, running inside the hub (his screens in a shadow root).
  const host = d.querySelector('#donnyMount .donny-host'); assert.ok(host, 'his screens are mounted');
  assert.match(host.shadowRoot.textContent, /Papan Tim/); assert.match(main(), /Built by Coach Donny/);
  assert.equal(d.querySelector('iframe'), null);
  d.querySelector('[data-rd-mode="hub"]').click(); await wait(); await wait();
  // The hub board now reads his scores (no dummy athletes); his real team list is there, nobody checked in yet.
  assert.doesNotMatch(main(), /Preview — Coach Donny's Athlete Readiness System \(Future Integration\)\./);
  assert.match(main(), /Scores, statuses and thresholds are Coach Donny's/); assert.match(main(), /0 of 30 athletes checked in/);
  assert.match(d.getElementById('titles').textContent, /Performance/);
  d.getElementById('rdT').value = 'CS2 Women'; d.getElementById('rdT').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  await wait(); assert.match(main(), /Risalma Agnia Lukman/); assert.doesNotMatch(main(), /Matthew Filemon/); // his CS2 Women list, not Dota
  d.getElementById('rdD').value = '2026-12-15'; d.getElementById('rdD').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  assert.equal(d.getElementById('rdD').value, '2026-12-15');
});
