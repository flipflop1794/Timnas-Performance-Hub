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
  assert.match(main(), /Athlete readiness|Preview|Coach Donny/);
  d.querySelector('[data-rd-mode="hub"]').click(); await wait();
  d.getElementById('langBtn').click(); await wait();
  assert.equal(d.documentElement.lang, 'id');
  assert.match(main(), /Kesiapan atlet/); assert.match(main(), /Perlu tindak lanjut/); // V1.15: his data, so no preview label
  assert.match(d.getElementById('titles').textContent, /Kompetitor/); assert.match(d.getElementById('titles').textContent, /Performa/);
  const size = d.body.innerHTML.length;
  for (let i = 0; i < 5; i++) { d.getElementById('meSel').dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
  assert.ok(Math.abs(d.body.innerHTML.length - size) < 200, 'redraws do not grow the page');
  // option labels translated, values unchanged, so filtering still works
  const opt = [...d.getElementById('rdT').options].find((o) => o.value === 'All titles');
  assert.equal(opt.textContent, 'Semua title');
  d.getElementById('rdT').value = 'CS2'; d.getElementById('rdT').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  await wait(); assert.match(main(), /Achmad Rismana Handachnie/); assert.doesNotMatch(main(), /Risalma/); // his CS2 list only
  dom.window.location.hash = 'tour-runbook'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /Runbook hari pertandingan — Dota 2/); assert.match(main(), /Pekan turnamen/);
  d.getElementById('wmD').value = '2026-12-01'; d.getElementById('wmAdd').click(); await wait();
  assert.equal(d.getElementById('wmAddMsg').textContent, 'Date must fall within WEC (2026-12-15 to 2026-12-20).'); // validation messages stay in English
  d.getElementById('langBtn').click(); await wait();
  assert.equal(d.documentElement.lang, 'en'); assert.match(main(), /Match-day runbook — Dota 2/);
});

test('V1.9 report pages and title hubs are translated; data and option values stay as written', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#reports-all', beforeParse(w) { w.claude = { use: async () => null }; w.localStorage.setItem('hub-lang', 'id'); } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  const main = () => d.getElementById('main').textContent;
  assert.match(main(), /Laporan scrim/); assert.match(main(), /Sesi 7 h/);
  await go('mlbb-reports'); assert.match(main(), /Isi laporan scrim — MLBB/); assert.match(main(), /Simpan laporan/); assert.match(main(), /Game menang/); assert.match(main(), /Satu perubahan konkret|Penyesuaian untuk sesi berikutnya/);
  assert.equal(d.getElementById('rp-MLBB-roster').options[0].value, 'Full national roster', 'option values stay English');
  assert.match(d.querySelector('[data-rp-prog="MLBB"][data-v="1"]').textContent, /1 Jauh/); assert.equal(d.querySelector('[data-rp-prog="MLBB"][data-v="1"]').title, 'Jauh dari rencana');
  assert.match(main(), /Detail lainnya \(opsional\)/); assert.match(main(), /Skor cepat/);
  await go('pubgm-reports'); assert.match(main(), /Total poin/);
  await go('t-efootball'); assert.match(main(), /Skuad/); assert.match(main(), /Laporan scrim, 7 hari terakhir/);
  await go('t-mlbbw'); assert.doesNotMatch(main(), /Draft Lab/);
  assert.doesNotMatch(main(), /Catatan: temuan analisis otomatis/, 'no engine-data note on report pages');
  const t = d.getElementById('titles').textContent; for (const x of ['MLBB Women', 'eFootball', 'CS2 Women']) assert.match(t, new RegExp(x));
});
