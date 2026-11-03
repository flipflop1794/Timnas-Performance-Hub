import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { tr } from '../src/hub/i18n.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('dictionary, prefixes and patterns; data and blank text untouched', () => {
  assert.equal(tr('Competitors'), 'Kompetitor');
  assert.equal(tr('Dota 2: no accepted objective.'), 'Dota 2: belum ada objektif diterima.');
  assert.equal(tr('Readiness 33 below the red threshold (35).'), 'Kesiapan 33 di bawah ambang merah (35).');
  assert.equal(tr('MLBB · Athlete 3, Dota 2 · Athlete 1'), 'MLBB · Atlet 3, Dota 2 · Atlet 1');
  assert.equal(tr('Game patch (Dota 2): provisional — 7.41'), 'Patch game (Dota 2): sementara — 7.41');
  assert.equal(tr('   '), null); assert.equal(tr('NARMAN'), null); assert.equal(tr('Winter Wyvern'), null);
});

test('page in Bahasa Indonesia: toggle, stable redraws, option values kept, logic still works', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#readiness', beforeParse(w) { w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  assert.match(main(), /Athlete readiness|Preview/);
  d.getElementById('langBtn').click(); await wait();
  assert.equal(d.documentElement.lang, 'id');
  assert.match(main(), /Pratinjau — Sistem Kesiapan Atlet Coach Donny \(Integrasi Mendatang\)\./); assert.match(main(), /Perlu tindak lanjut/);
  assert.match(d.getElementById('titles').textContent, /Kompetitor/); assert.match(d.getElementById('titles').textContent, /Performa/);
  const size = d.body.innerHTML.length;
  for (let i = 0; i < 5; i++) { d.getElementById('meSel').dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
  assert.ok(Math.abs(d.body.innerHTML.length - size) < 200, 'redraws do not grow the page');
  // option labels translated, values unchanged, so filtering still works
  const opt = [...d.getElementById('rdT').options].find((o) => o.value === 'All titles');
  assert.equal(opt.textContent, 'Semua title');
  d.getElementById('rdT').value = 'CS2'; d.getElementById('rdT').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  assert.match(main(), /CS2 · Atlet 1/);
  dom.window.location.hash = 'tour-runbook'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /Runbook hari pertandingan — Dota 2/); assert.match(main(), /Pekan turnamen/);
  d.getElementById('wmD').value = '2026-12-01'; d.getElementById('wmAdd').click(); await wait();
  assert.equal(d.getElementById('wmAddMsg').textContent, 'Date must fall within WEC (2026-12-15 to 2026-12-20).'); // validation messages stay in English
  d.getElementById('langBtn').click(); await wait();
  assert.equal(d.documentElement.lang, 'en'); assert.match(main(), /Match-day runbook — Dota 2/);
});
