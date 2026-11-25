// V1.59 on the website build: the daily login is recorded when the hub opens; support staff see their streaks and
// milestones on Progres mingguan and a streak line after saving; a title's coaches see theirs on the Scrim reports
// page; the Head Coach team sees the streaks next to each name. Without the database table: reports only, no error.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';
import { supportReport } from '../../src/core/support.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  ilham: { id: 'u-ilham', email: 'ilham@example.test', password: 'pw', name: 'Coach Ilham', roles: ['support'], titles: [], job: 'physio_men' },
  honjaw: { id: 'u-honjaw', email: 'honjaw@example.test', password: 'pw', name: 'Coach Honjaw', roles: ['title_coach'], titles: ['MLBB'] },
  fayad: { id: 'u-fayad', email: 'fayad@example.test', password: 'pw', name: 'Coach Fayad', staffKey: 'fayad', roles: ['head_coach'], titles: [] },
};
const t0 = localDay(); const d1 = shiftDay(t0, -1); const d2 = shiftDay(t0, -2);
function world() {
  const B = backend(); Object.values(people).forEach((p) => B.addUser(p));
  B.tables.profiles.find((x) => x.id === 'u-ilham').support_job = 'physio_men';
  ['Rinz', 'Kiboy'].forEach((ign, i) => B.tables.roster_players.push({ title: 'MLBB', ign, sort_order: i }));
  for (const date of [d1, d2]) {
    const r = { ...supportReport({ date, discipline: 'physio', job: 'physio_men', by: 'Coach Ilham', rows: [{ athlete: 'Rinz', title: 'MLBB', did: 'Massage bahu' }] }), id: `SR-${date}` };
    const at = `${date}T10:00:00.000Z`;
    B.tables.support_reports.push({ id: r.id, data: { ...r, createdAt: at }, created_by: 'u-ilham', created_at: at, updated_by: 'u-ilham', updated_at: at });
    B.tables.scrim_reports.push({ id: `R-${date}`, title: 'MLBB', data: { id: `R-${date}`, title: 'MLBB', origin: 'operational', date, by: 'Coach Honjaw', partner: 'Team Q', result: { mode: 'wl', won: 1, lost: 1, drawn: 0 },
      focus: '', progress: 3, worked: 'w', failed: '', adjust: 'a', notes: [], createdAt: at }, created_by: 'u-honjaw', created_at: at, updated_by: 'u-honjaw', updated_at: at });
  }
  return B;
}
async function open(B, who, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(people[who].id); } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(300);
  return { d, w: dom.window, text: () => d.getElementById('main').textContent, wait: async (fn) => { for (let i = 0; i < 80 && !fn(); i++) await sleep(50); },
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await sleep(150); } };
}

test('support staff: opening the hub is today\'s login; Progres mingguan shows the streaks and milestones; saving adds a day', async () => {
  const B = world(); const p = await open(B, 'ilham', 'support');
  await p.wait(() => B.tables.hub_checkins.length);
  assert.deepEqual(B.tables.hub_checkins.map((c) => [c.user_id, c.day]), [['u-ilham', t0]], 'one row: who and which day');
  assert.doesNotMatch(p.text(), /My achievements/, 'the daily tab stays for input');
  await p.go('support-week');
  await p.wait(() => /My achievements/.test(p.text()) && /login days? in a row/.test(p.text()));
  const ach = p.d.querySelector('.ach').textContent;
  assert.match(ach, /🔥 2\s*days reported in a row/); assert.match(ach, /✅ 1\s*login day in a row/); assert.match(ach, /days to WEC/);
  const on = [...p.d.querySelectorAll('.ach-b.on')].map((b) => b.textContent);
  assert.ok(on.some((x) => /First report/.test(x)), 'first report reached');
  assert.match([...p.d.querySelectorAll('.ach-b')].map((b) => b.textContent).join('|'), /7 days in a row 2\/7/);
  assert.ok(p.d.querySelector(`[data-sup-day="${t0}"] .sw-in`), 'a dot on today: signed in');
  // A report today: day 3.
  await p.go('support');
  await p.wait(() => p.d.getElementById('sR-0-athlete'));
  const sel = p.d.getElementById('sR-0-athlete'); sel.value = [...sel.options].find((o) => o.value === 'MLBB|Rinz' || o.value.startsWith('MLBB|')).value;
  const did = p.d.getElementById('sR-0-did'); did.value = 'Stretching'; did.dispatchEvent(new p.w.Event('input', { bubbles: true }));
  p.d.querySelector('[data-sup-save]').click();
  await p.wait(() => p.d.querySelector('.ach-msg'));
  assert.match(p.d.querySelector('.ach-msg').textContent, /🔥 Day 3 in a row/);
});

test('coach: the title\'s streak, their login, the milestones on Scrim reports; the Head Coach team sees streaks next to names', async () => {
  const B = world();
  const c = await open(B, 'honjaw', 'mlbb-reports');
  await c.wait(() => c.d.querySelector('.panel.ach') && /login day/.test(c.d.querySelector('.panel.ach').textContent));
  const card = c.d.querySelector('.panel.ach').textContent;
  assert.match(card, /🔥 2\s*days of MLBB reports in a row/); assert.match(card, /✅ 1\s*login day in a row/); assert.match(card, /No report yet today/);
  assert.match(card, /First scrim report/); assert.match(card, /15 scrim reports 2\/15/);
  // The Head Coach team: their own page shows no personal card; the streaks are next to the names.
  B.tables.hub_checkins.push({ user_id: 'u-ilham', day: d1, first_at: `${d1}T01:00:00Z` }, { user_id: 'u-ilham', day: t0, first_at: `${t0}T01:00:00Z` });
  const f = await open(B, 'fayad', 'support');
  await f.wait(() => /Team support this week/.test(f.text()) && /✅/.test(f.text()));
  const row = [...f.d.querySelectorAll('.sw-board li.sw-pp')].find((li) => /Coach Ilham/.test(li.textContent));
  assert.match(row.querySelector('.ach-mini').textContent, /🔥2 ✅2/);
  await f.go('reports-all');
  await f.wait(() => /Coaches' logins/.test(f.text()));
  assert.match(f.text(), /🔥 2/); assert.match(f.text(), /Coach Honjaw \(MLBB\) ✅1/);
  assert.equal(f.d.querySelector('.panel.ach'), null);
});

test('before the database records logins: streaks from reports only, no login line, nothing breaks', async () => {
  const B = world(); B.missing = new Set(['hub_checkins']);
  const p = await open(B, 'ilham', 'support-week');
  await p.wait(() => /My achievements/.test(p.text()));
  assert.match(p.d.querySelector('.ach').textContent, /🔥 2/); assert.doesNotMatch(p.text(), /login day|Logged in/);
  assert.equal(p.d.querySelector('.sw-in'), null);
});
