// V1.50: the pain map, VAS and body region are for the physios only (Coach Ilham, Coach Dewi); a psychologist's row
// has a Prognosis column next to the session type; each staff member sees their own weekly recap.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';
import { myRecap, recapText, calWeek } from '../../src/core/support.js';

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
  fadhil: { id: 'u-fadhil', email: 'fadhil@example.test', password: 'pw', name: 'Psikolog Fadhil', roles: ['support'], titles: [], job: 'psych_men' },
  ekky: { id: 'u-ekky', email: 'ekky@example.test', password: 'pw', name: 'Coach Ekky', roles: ['support'], titles: [], job: 'physical' },
  donny: { id: 'u-donny', email: 'donny@example.test', password: 'pw', name: 'Coach Donny', staffKey: 'donny', roles: ['readiness_owner'], titles: [], job: 'medic' },
};
const t0 = localDay();
function world() {
  const B = backend(); Object.values(people).forEach((p) => B.addUser(p));
  for (const p of Object.values(people)) B.tables.profiles.find((x) => x.id === p.id).support_job = p.job;
  ['Rinz', 'Kiboy'].forEach((ign, i) => B.tables.roster_players.push({ title: 'MLBB', ign, sort_order: i }));
  return B;
}
async function open(B, who, draft) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://hub.example.test/#support',
    beforeParse(w) {
      w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(people[who].id);
      // a physio draft left on this device by someone else, under the old shared key and under this account
      if (draft) { w.localStorage.setItem('hub-support-draft', JSON.stringify(draft)); w.localStorage.setItem(`hub-support-draft:${people[who].id}`, JSON.stringify(draft)); }
    } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  return { d, w: dom.window, text: () => d.getElementById('main').textContent, wait: async (fn) => { for (let i = 0; i < 80 && !fn(); i++) await sleep(50); } };
}
const stale = { date: t0, discipline: 'physio', rows: [{ athlete: '', athleteSeen: '', title: '', did: 'x', found: '', followUp: '', pain: [{ p: 'knee_L', v: 5 }], vasBefore: '4', vasAfter: '2' }], general: { did: '', found: '', teams: [] }, paste: '', source: 'form' };

test('pain map, VAS and body region: physios only; a stale physio draft never opens for anyone else', async () => {
  const B = world();
  const ilham = await open(B, 'ilham');
  await ilham.wait(() => ilham.d.getElementById('sR-0-vb'));
  assert.ok(ilham.d.querySelector('.pm-field'), 'the physio has the pain map'); assert.ok(ilham.d.getElementById('sR-0-region'));
  for (const who of ['fadhil', 'ekky']) {
    const x = await open(B, who, stale);
    await x.wait(() => x.d.getElementById('sR-0-did'));
    assert.ok(x.d.getElementById('sR-0-did'), `${who} has a form`);
    assert.equal(x.d.querySelector('.pm-field'), null, `${who}: no pain map`);
    assert.equal(x.d.getElementById('sR-0-vb'), null, `${who}: no VAS`); assert.equal(x.d.getElementById('sR-0-region'), null, `${who}: no body region`);
    assert.doesNotMatch(x.text(), /Pain map|VAS before/);
  }
  const donny = await open(B, 'donny', stale);
  await donny.wait(() => /To check/.test(donny.text()));
  assert.equal(donny.d.querySelector('.pm-field'), null, 'the team doctor files as doctor: no pain map');
  assert.ok(donny.d.getElementById('sR-0-response'), 'the doctor keeps the athlete response');
});

test('psychologist: Session and a Prognosis text column in the row; the saved report shows the same column', async () => {
  const B = world();
  const f = await open(B, 'fadhil');
  await f.wait(() => f.d.getElementById('sR-0-prog'));
  const prog = f.d.getElementById('sR-0-prog');
  assert.equal(prog.tagName, 'TEXTAREA'); assert.ok(prog.closest('.srow.srow5'), 'prognosis is a column of the row');
  assert.ok(f.d.getElementById('sR-0-session').closest('.srow'), 'session sits under the athlete');
  const sel = f.d.getElementById('sR-0-athlete'); sel.value = [...sel.options].find((o) => o.value.startsWith('MLBB|')).value;
  const set = (id, v) => { const e = f.d.getElementById(id); e.value = v; e.dispatchEvent(new f.w.Event('input', { bubbles: true })); };
  set('sR-0-did', 'Konseling'); set('sR-0-found', 'Cemas sebelum scrim'); f.d.getElementById('sR-0-session').value = 'formal'; set('sR-0-prog', 'Baik bila rutin latihan napas');
  f.d.querySelector('[data-sup-save]').click();
  await f.wait(() => B.tables.support_reports.length);
  const r = B.tables.support_reports[0].data; assert.equal(r.rows[0].session, 'formal'); assert.equal(r.rows[0].prognosis, 'Baik bila rutin latihan napas');
  f.d.querySelector('[data-sup-histfold]').open = true;
  await f.wait(() => f.d.querySelector('.srow-h.srow5'));
  assert.match(f.d.querySelector('.srow-h.srow5').textContent, /Prognosis/); assert.match(f.d.querySelector('.srow-v.srow5').textContent, /Baik bila rutin latihan napas/);
  assert.match(f.d.querySelector('.srow-v.srow5').textContent, /Formal counselling/);
  // V1.58 the recap is on the Weekly progress tab
  f.w.location.hash = 'support-week'; f.w.dispatchEvent(new f.w.HashChangeEvent('hashchange'));
  await f.wait(() => /Sessions: 1 formal · 0 informal/.test(f.text()));
  assert.match(f.text(), /Sessions: 1 formal · 0 informal/, 'the psychologist recap counts sessions');
});

test('my recap: athletes once, visits each time, follow-ups written and closed, vs the week before; the copy has no names', () => {
  const w = calWeek(t0, 0); const d1 = w.from; const d2 = shiftDay(w.from, 1); const before = shiftDay(w.from, -2);
  const rep = (id, date, rows, by = 'Coach Ilham') => ({ id, date, by, discipline: 'physio', rows: rows.map((x) => ({ title: 'MLBB', did: 'x', found: '', followUp: '', ...x })) });
  const reports = [
    rep('a', d1, [{ athlete: 'Rinz', vasBefore: 5, vasAfter: 3, response: 'better', followUp: 'Re-check' }, { athlete: 'Kiboy' }]),
    rep('b', d2, [{ athlete: 'Rinz', vasBefore: 4, vasAfter: 3, response: 'same', fuDone: { at: `${d2}T10:00:00Z`, by: 'Coach Ilham' } }]),
    rep('c', before, [{ athlete: 'Rinz' }]),
    rep('d', d1, [{ athlete: 'Someone' }], 'Psikolog Fadhil'),
  ];
  const rc = myRecap(reports, 'Coach Ilham', w);
  assert.equal(rc.cur.days, 2); assert.equal(rc.cur.athletes, 2); assert.equal(rc.cur.visits, 3); assert.equal(rc.cur.followUps, 1); assert.equal(rc.cur.closed, 1);
  assert.equal(rc.cur.vasDrop, 1.5); assert.equal(rc.cur.better, 1); assert.equal(rc.cur.responded, 2);
  assert.deepEqual(rc.cur.regulars.map((a) => [a.athlete, a.n]), [['Rinz', 2]]); assert.equal(rc.cur.teams.MLBB, 2);
  assert.equal(rc.prev.athletes, 1);
  const txt = recapText(rc, w, 'Coach Ilham', 'id');
  assert.match(txt, /Atlet ditangani: 2 \(minggu lalu 1\)/); assert.match(txt, /Kunjungan: 3/); assert.match(txt, /1 dibuat, 1 selesai/);
  assert.doesNotMatch(txt, /Rinz|Kiboy|Someone/, 'counts only');
});
