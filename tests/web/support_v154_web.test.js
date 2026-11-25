// V1.54 on the website build: a staff member sees their own work (day by day, so far); Coach Donny sees one line per
// staff member and opens a name for that person's week. Staff never see each other or the board.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';
import { supportReport, calWeek } from '../../src/core/support.js';

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
  ekky: { id: 'u-ekky', email: 'ekky@example.test', password: 'pw', name: 'Coach Ekky', roles: ['support'], titles: [], job: 'physical' },
  donny: { id: 'u-donny', email: 'donny@example.test', password: 'pw', name: 'Coach Donny', staffKey: 'donny', roles: ['readiness_owner'], titles: [], job: 'medic' },
};
const t0 = localDay(); const W = calWeek(t0);
function world() {
  const B = backend(); Object.values(people).forEach((p) => B.addUser(p));
  for (const p of Object.values(people)) B.tables.profiles.find((x) => x.id === p.id).support_job = p.job;
  ['Rinz', 'Kiboy'].forEach((ign, i) => B.tables.roster_players.push({ title: 'MLBB', ign, sort_order: i }));
  const add = (date, rows) => { const r = { ...supportReport({ date, discipline: 'physio', job: 'physio_men', by: 'Coach Ilham', rows }), id: `SR-${date}` }; const at = new Date().toISOString();
    B.tables.support_reports.push({ id: r.id, data: r, created_by: 'u-ilham', created_at: at, updated_by: 'u-ilham', updated_at: at }); };
  add(t0, [{ athlete: 'Rinz', title: 'MLBB', did: 'Massage bahu kanan', vasBefore: '6', vasAfter: '3', response: 'better' }]);
  add(shiftDay(t0, -9), [{ athlete: 'Kiboy', title: 'MLBB', did: 'Stretching punggung' }]);
  return B;
}
async function open(B, who, hash = 'support') {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(people[who].id); } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(250);
  return { d, w: dom.window, text: () => d.getElementById('main').textContent, wait: async (fn) => { for (let i = 0; i < 80 && !fn(); i++) await sleep(50); },
    click: async (sel) => { const e = d.querySelector(sel); assert.ok(e, `no ${sel}`); e.click(); await sleep(200); } };
}

// V1.58: this is the Weekly progress tab; the Daily report tab has only the form and their reports.
test('a staff member: My work this week, day by day in their own words, and what they have done so far', async () => {
  const B = world(); const p = await open(B, 'ilham', 'support-week');
  await p.wait(() => /My work this week/.test(p.text()));
  assert.match(p.text(), /My work this week/); assert.match(p.text(), /Day by day/);
  const day = [...p.d.querySelectorAll('details.sw-dl')].find((x) => /Rinz/.test(x.textContent));
  assert.ok(day, 'today is listed with the athlete'); assert.match(day.textContent, /Massage bahu kanan/); assert.match(day.querySelector('summary').textContent, /1 athlete/);
  const so = p.d.querySelector('.sw-sofar').textContent;
  assert.match(so, /What you have done so far/); assert.match(so, /2\s*days reported/); assert.match(so, /2\s*athletes helped/); assert.match(so, /Pain down 3 on average \(1 treatment/);
  assert.doesNotMatch(p.text(), /Team support this week/, 'the board is not for the support staff');
  // A past day of this week without a report offers to add it, and opens the form on that date.
  if (W.days.indexOf(t0) > 0) {
    const y = shiftDay(t0, -1);
    assert.ok(p.d.querySelector(`[data-sup-addday="${y}"]`), 'yesterday has no report: Add it');
    await p.click(`[data-sup-addday="${y}"]`);
    await p.wait(() => p.d.getElementById('supDate'));
    assert.equal(p.w.location.hash, '#support', 'Add it opens the Daily report tab'); assert.equal(p.d.getElementById('supDate').value, y);
  }
});

// V1.58 the two tabs of a staff member: Daily report = the form and their reports; Weekly progress = their week.
test('V1.58 support staff: Daily report is for input only; a day on Weekly progress shows its reports, Edit goes back to the form', async () => {
  const B = world(); const p = await open(B, 'ilham');
  await p.wait(() => p.d.getElementById('supForm'));
  const tabs = p.d.getElementById('tabs').textContent;
  assert.match(tabs, /Daily report/); assert.match(tabs, /Weekly progress/); assert.doesNotMatch(tabs, /Support staff/);
  assert.doesNotMatch(p.text(), /My work this week|Day by day|What you have done so far|Days reported/, 'no weekly numbers on the daily tab');
  assert.ok(p.d.querySelector('[data-sup-histfold]'), 'their own reports of 14 days, folded, under the form');
  p.w.location.hash = 'support-week'; p.w.dispatchEvent(new p.w.HashChangeEvent('hashchange'));
  await p.wait(() => /My work this week/.test(p.text()));
  assert.equal(p.d.getElementById('supForm'), null, 'no form on Weekly progress');
  await p.click(`[data-sup-day="${t0}"]`);
  const rep = p.d.querySelector('.sw-dayrep'); assert.ok(rep, 'the day opens under the strip'); assert.match(rep.textContent, /Massage bahu kanan/);
  await p.click('.sw-dayrep [data-sup-edit]');
  await p.wait(() => /Edit report/.test(p.text()));
  assert.equal(p.w.location.hash, '#support', 'Edit opens the Daily report tab'); assert.equal(p.d.getElementById('sR-0-did').value, 'Massage bahu kanan');
  // Coach Donny reads everyone's: his page is unchanged and has no Weekly progress tab.
  const d = await open(B, 'donny');
  await d.wait(() => /Team support this week/.test(d.text()));
  assert.doesNotMatch(d.d.getElementById('tabs').textContent, /Weekly progress|Daily report/);
});

test('Coach Donny: one line per staff member, also those with no report; a name opens that week; staff see none of it', async () => {
  const B = world(); const p = await open(B, 'donny');
  await p.wait(() => /Team support this week/.test(p.text()));
  const rows = [...p.d.querySelectorAll('.sw-board li.sw-pp')];
  const ilham = rows.find((li) => /Coach Ilham/.test(li.textContent)); const ekky = rows.find((li) => /Coach Ekky/.test(li.textContent));
  assert.ok(ilham && ekky, 'both staff members have a row');
  assert.match(ilham.textContent, /1\/7/); assert.match(ilham.textContent, /1 athlete/); assert.match(ilham.textContent, /pain down 3 on average/);
  assert.match(ekky.textContent, /0\/7/); assert.match(ekky.textContent, /No report filed in the hub yet/);
  assert.match(p.text(), /counts the reports filed in the hub, not all the work done/);
  assert.equal(ilham.querySelector('.sw-daylist'), null, 'closed until the name is tapped');
  await p.click('[data-sup-who="Coach Ilham"]');
  const openRow = [...p.d.querySelectorAll('.sw-board li.sw-pp')].find((li) => /Coach Ilham/.test(li.textContent));
  assert.match(openRow.querySelector('.sw-daylist').textContent, /Rinz/); assert.equal(openRow.querySelector('[data-sup-addday]'), null, 'no "Add it" on someone else\'s week');
  // Another support staff member sees neither the board nor Coach Ilham's work.
  const e = await open(B, 'ekky', 'support-week');
  await e.wait(() => /My work this week/.test(e.text()));
  assert.doesNotMatch(e.text(), /Team support this week|Coach Ilham|Massage bahu/);   // (athlete names are in his own form's picker)
  assert.equal(e.d.querySelector('.sw-board'), null); assert.equal(e.d.querySelector('details.sw-dl'), null, 'no day of work listed: he filed nothing');
  assert.match(e.text(), /not reported yet today/);
});
