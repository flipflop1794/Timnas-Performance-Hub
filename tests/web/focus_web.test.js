// V1.41 on the website: focus mode folds screens with no entries yet behind "More · n" at the end of the tab bar.
// One tap shows every tool again; a folded screen opened by link still works and shows its own tab.
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
const coach = { id: 'u-rama', email: 'rama@example.test', password: 'pw', name: 'Coach Rama', roles: ['title_coach'], titles: ['Dota 2'] };
async function open(hash, lang = 'en') {
  const B = backend(); B.addUser(coach);
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', lang); w.__HUB_TEST_CLIENT__ = B.client(coach.id); } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  return { d, tabs: () => d.getElementById('tabs').textContent };
}

test('a Dota coach sees the screens in use; draft room, post-match and series review fold behind "More · 3"', async () => {
  const { d, tabs } = await open('dota-team');
  assert.match(tabs(), /Scrim reports/); assert.match(tabs(), /Analysis/);
  assert.doesNotMatch(tabs(), /Draft room/); assert.doesNotMatch(tabs(), /Series review/);
  const more = d.getElementById('focusMore'); assert.ok(more); assert.equal(more.textContent, 'More · 3');
  more.click(); await sleep(50);
  assert.match(tabs(), /Draft room/); assert.match(tabs(), /Series review/);
  assert.equal(d.getElementById('focusMore'), null);
});

test('a folded screen opened by link shows its own tab; Bahasa label', async () => {
  const { d, tabs } = await open('dota-draft');
  assert.match(tabs(), /Draft room/); assert.equal(d.getElementById('focusMore').textContent, 'More · 2');
  const id = await open('dota-team', 'id');
  assert.equal(id.d.getElementById('focusMore').textContent, 'Lainnya · 3');
});
