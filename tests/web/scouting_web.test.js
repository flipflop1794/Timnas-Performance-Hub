// V1.25 Live scouting on the website: weak venue internet. An entry saved while writes fail stays on the phone,
// shows as waiting, and goes to the database once the connection is back, exactly once.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  // Other website test files rebuild the same file at the same time: read it once it is complete.
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aufa = { id: 'u-aufa', email: 'aufa@example.test', password: 'pw', name: 'Aufa Bassam', staffKey: 'aufa', roles: ['admin', 'assistant_coach'], titles: ['Dota 2', 'MLBB'] };

test('live scouting: saved on the phone while offline, synced once when back, never twice', async () => {
  const B = backend(); B.addUser(aufa);
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://hub.example.test/#tour-scout',
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(aufa.id); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document; const main = () => d.getElementById('main')?.textContent || '';
  for (let i = 0; i < 120 && !d.getElementById('scX'); i++) await sleep(25);
  await sleep(100);
  const rows = () => B.tables.scouting_notes.filter((r) => r.data?.kind === 'live');
  B.failWrite = new Set(['scouting_notes']);
  d.getElementById('scX').value = 'Fast pace from the first minute'; d.getElementById('scSave').click();
  for (let i = 0; i < 40 && !/waiting to sync/.test(main()); i++) await sleep(25);
  assert.match(main(), /1 waiting to sync/); assert.match(main(), /not synced yet/); assert.equal(rows().length, 0);
  assert.equal(JSON.parse(dom.window.localStorage.getItem('hub-live-queue')).length, 1, 'kept on this phone');
  // Connection back.
  B.failWrite = null;
  d.getElementById('scSync').click();
  for (let i = 0; i < 60 && rows().length < 1; i++) await sleep(25);
  await sleep(150);
  assert.equal(rows().length, 1); assert.equal(rows()[0].data.text, 'Fast pace from the first minute');
  assert.match(main(), /All synced\./); assert.equal(dom.window.localStorage.getItem('hub-live-queue'), null);
  // A second sync (e.g. the "online" event) sends nothing again.
  dom.window.dispatchEvent(new dom.window.Event('online')); await sleep(200);
  assert.equal(rows().length, 1);
});
