// V1.39 two-minute scrim report on the website: a Dota coach files partner, score and the one change for next time,
// saves, copies the report for the team's WhatsApp group, and My day shows it at the top as filed today.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten by another test file */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coach = { id: 'u-rama', email: 'rama@example.test', password: 'pw', name: 'Coach Rama', roles: ['title_coach'], titles: ['Dota 2', 'PUBG Mobile'] };
async function open(B, hash, lang = 'en') {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) {
      w.localStorage.setItem('hub-lang', lang); w.__HUB_TEST_CLIENT__ = B.client(coach.id);
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { w.__copied = t; } } });
    } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  return { d, w: dom.window, set: (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); } };
}

test('three things and save: partner, score, the one change; then Copy for WhatsApp', async () => {
  const B = backend(); B.addUser(coach);
  const c = await open(B, 'dota-reports');
  const left = () => c.d.getElementById('rpLeft-Dota_2').textContent;
  assert.match(left(), /0 of 3 done — still needed: sparring partner, result, change for next time\./);
  assert.equal(c.d.querySelector('[data-rp-wa]'), null, 'nothing to copy before a save');
  c.set('rp-Dota_2-partner', 'Team Falcon Academy');
  [...c.d.querySelectorAll('.chip')].find((b) => b.textContent === '2-1').click(); await sleep(30);
  c.set('rp-Dota_2-adjust', 'Ward the enemy triangle before 10:00');
  assert.match(left(), /Everything needed is filled in/);
  c.d.querySelector('[data-report-save="Dota 2"]').click();
  for (let i = 0; i < 60 && !B.tables.scrim_reports.length; i++) await sleep(50);
  assert.ok(B.tables.scrim_reports.length, c.d.getElementById('rpMsg-Dota_2').textContent);
  const r = B.tables.scrim_reports[0].data;
  assert.equal(r.partner, 'Team Falcon Academy'); assert.equal(r.progress, null); assert.equal(r.focus, '');
  for (let i = 0; i < 40 && !c.d.querySelector('[data-rp-wa]'); i++) await sleep(50);
  c.d.querySelector('[data-rp-wa]').click(); await sleep(50);
  assert.match(c.w.__copied, /^\*Scrim report — Dota 2\*/);
  assert.match(c.w.__copied, /vs Team Falcon Academy · Coach Rama/); assert.match(c.w.__copied, /Result: 2-1/);
  assert.match(c.w.__copied, /\*Next session:\* Ward the enemy triangle before 10:00$/);
  assert.match(c.d.getElementById('rpMsg-Dota_2').textContent, /WhatsApp group/);
});

test('My day: scrim reports near the top, the title without a report first; Bahasa', async () => {
  const B = backend(); B.addUser(coach);
  const c = await open(B, 'dota-reports', 'id');
  c.set('rp-Dota_2-partner', 'Team X'); c.set('rp-Dota_2-won', '1'); c.set('rp-Dota_2-adjust', 'Faster smoke');
  c.d.querySelector('[data-report-save="Dota 2"]').click();
  for (let i = 0; i < 60 && !B.tables.scrim_reports.length; i++) await sleep(50);
  const t = await open(B, 'today', 'en');
  const panel = [...t.d.querySelectorAll('.panel')].find((p) => /Scrim reports today/.test(p.textContent));
  assert.ok(panel); assert.match(panel.querySelector('h2').textContent, /Scrim reports today: 1 of 2 filed/);
  const items = [...panel.querySelectorAll('li')].map((li) => li.textContent);
  assert.match(items[0], /never.*PUBG Mobile/); assert.match(items[1], /filed today.*Dota 2/);
  const id = await open(B, 'today', 'id');
  assert.ok([...id.d.querySelectorAll('h2')].some((h) => h.textContent === 'Laporan scrim hari ini: 1 dari 2 sudah masuk'));
});
