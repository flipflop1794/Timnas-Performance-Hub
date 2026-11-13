import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

function mock({ denyWellbeing = false } = {}) {
  const store = new Map(); const subs = [];
  const notify = () => subs.forEach((s) => s());
  const ref = (path) => ({ set: async (d) => { store.set(path, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(path), data: () => store.get(path) }); subs.push(f); f(); return () => {}; } });
  let n = 0;
  return { store, doc: ref, collection: (col) => ({ doc: (id) => ref(`${col}/${id}`), add: async (d) => { store.set(`${col}/a${++n}`, structuredClone(d)); notify(); },
    onSnapshot: (next, err) => { if (denyWellbeing && col.startsWith('wellbeing')) { err?.({ code: 'permission_denied' }); return () => {}; } const f = () => { const docs = [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })); next({ docs }); }; subs.push(f); f(); return () => {}; } }) };
}
async function page(hash, db) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`, beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  await new Promise((r) => setTimeout(r, 30));
  const d = dom.window.document; const wait = () => new Promise((r) => setTimeout(r, 15));
  return { dom, d, wait, text: () => d.getElementById('main').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); },
    as: async (who) => { const el = d.getElementById('meSel'); el.value = who; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(); } };
}

const click = async (h, sel) => { const el = h.d.querySelector(sel); assert.ok(el, `no ${sel}`); el.click(); await h.wait(); await h.wait(); };
const set = (h, id, v) => { const el = h.d.getElementById(id); assert.ok(el, `no #${id}`); el.value = v; };
const msg = (h, id) => h.d.getElementById(id)?.textContent || '';

test('Pelatnas: dates TBD, a planned session gets attendance, availability saved, message copied', async () => {
  const db = mock(); const h = await page('pel-day', db);
  assert.ok([...h.d.querySelectorAll('#titles button')].some((b) => b.textContent === 'Pelatnas'), 'top menu has Pelatnas');
  assert.match(h.text(), /Pelatnas dates: TBD — to be confirmed by PB ESI BOD/);
  // record proposed dates (artifact mode acts as staff with full rights)
  set(h, 'plStart', '2026-11-20'); set(h, 'plEnd', '2026-12-13'); set(h, 'plDStatus', 'confirmed');
  await click(h, '[data-pl-savedates]'); assert.match(msg(h, 'msg-pl-dates'), /need a source/);
  set(h, 'plDStatus', 'proposed'); await click(h, '[data-pl-savedates]');
  assert.match(h.text(), /proposed, not confirmed/);
  assert.equal(db.store.get('config/pelatnas').camp.status, 'proposed');
  // a session planned for the shown day appears with the roster
  const day = h.d.getElementById('plDay').value;
  await db.collection('scrims').doc('SC-x').set({ id: 'SC-x', title: 'Dota 2', date: day, time: '19:00', kind: 'scrim', partner: 'Team A', owner: 'Aufa', status: 'planned', objectives: [], origin: 'operational' });
  await h.wait();
  assert.match(h.text(), /19:00 · Dota 2 · Scrim vs Team A/);
  await click(h, '[data-pl-saveatt="SC-x"]'); assert.match(msg(h, 'msg-pl-SC-x'), /at least one/);
  await click(h, '[data-pl-allpresent="SC-x"]');
  const absent = [...h.d.querySelectorAll('[data-pl-mark]')].find((b) => b.dataset.plMark.endsWith('|absent'));
  absent.click(); await h.wait();
  await click(h, '[data-pl-saveatt="SC-x"]');
  const att = db.store.get('pelatnas_attendance/AT-SC-x');
  assert.ok(att && Object.values(att.marks).includes('absent') && Object.values(att.marks).includes('present'));
  assert.match(h.text(), /Attendance this day\d+%/);
  // availability
  await h.go('pel-avail');
  assert.match(h.text(), /Player availability/);
  assert.match(h.d.getElementById('plMsg').value, /Tanggal kamu BISA/); assert.doesNotMatch(h.d.getElementById('plMsg').value, /\bSK\b|kompensasi/);
  assert.doesNotMatch(h.d.getElementById('plMsg').value, /Rp|IDR/);
  await click(h, '[data-pl-msglang="en"]'); assert.match(h.d.getElementById('plMsg').value, /dates you CAN attend/); assert.doesNotMatch(h.d.getElementById('plMsg').value, /\bSK\b|compensation/);
  set(h, 'plStatus', 'Available for part of it'); set(h, 'plCFrom', '2026-11-22'); set(h, 'plCTo', '2026-11-23'); set(h, 'plCReason', 'Club bootcamp');
  await click(h, '[data-pl-addconf]'); assert.match(h.text(), /2026-11-22 to 2026-11-23 · Club bootcamp/);
  set(h, 'plStatus', 'Available for part of it');
  await click(h, '[data-pl-saveavail]');
  const av = [...db.store.entries()].filter(([k]) => k.startsWith('pelatnas_availability/')).map(([, v]) => v);
  assert.equal(av.length, 1); assert.equal(av[0].conflicts[0].reason, 'Club bootcamp');
  assert.match(h.text(), /1 of \d+ players have answered/);
  // Today shows the pelatnas line
  await h.go('today'); assert.match(h.text(), /have not answered about availability/);
});

test('V1.17: AI suggests the next session from reports; "Use in the plan" fills focus, drill and check; planned focus reaches the report', async () => {
  const db = mock(); const calls = [];
  await db.collection('scrim_reports').doc('RP-1').set({ id: 'RP-1', title: 'MLBB', date: '2026-11-11', createdAt: '2026-11-11T10:00:00Z', by: 'Aufa Bassam', partner: 'Team A', focus: 'Lord', progress: 3, worked: 'early', failed: 'late lord', adjust: 'vision before lord', result: { mode: 'wl', won: 1, lost: 2, drawn: 0 }, notes: [], origin: 'operational' });
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-scrims', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en');
    w.claude = { use: async (nm) => (nm === 'db' ? db : null) };
    w.__HUB_PLATFORM__ = { ai: { call: async (b) => { calls.push(b); return { raw: { focus: 'Vision before lord', why: 'Repeated [RP-1]', drill: 'Ward 30 s before lord', measure: 'Lord fights with vision', based_on: ['RP-1'], alternatives: ['Early rotations'] }, model: 'm' }; } } };
    w.console.error = (...a) => { throw new Error(a.join(' ')); };
  } });
  await new Promise((r) => setTimeout(r, 40));
  const d = dom.window.document; const wait = () => new Promise((r) => setTimeout(r, 30));
  assert.match(d.getElementById('main').textContent, /Suggest the next session \(AI\)/);
  d.querySelector('[data-plan-suggest="MLBB"]').click(); await wait(); await wait();
  assert.equal(calls[0].action, 'plan'); assert.equal(calls[0].reports[0].id, 'RP-1'); assert.equal(calls[0].reports[0].result, '1-2');
  assert.match(d.getElementById('main').textContent, /Vision before lord/);
  d.querySelector('[data-plan-use="MLBB"]').click(); await wait();
  assert.equal(d.getElementById('spFo-MLBB').value, 'Vision before lord'); assert.equal(d.getElementById('spDr-MLBB').value, 'Ward 30 s before lord');
  d.getElementById('spP-MLBB').value = 'Team B';
  d.querySelector('[data-scrim-plan="MLBB"]').click(); await wait();
  const planned = [...db.store.entries()].filter(([k]) => k.startsWith('scrims/')).map(([, v]) => v);
  assert.equal(planned[0].focus, 'Vision before lord'); assert.equal(planned[0].measure, 'Lord fights with vision');
  assert.match(d.getElementById('main').textContent, /Focus: Vision before lord/);
  // the report form offers "Did we fix it?" for last time's adjustment
  dom.window.location.hash = 'mlbb-reports'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(d.getElementById('main').textContent, /the adjustment was: vision before lord/);
  assert.ok(d.getElementById('rp-MLBB-fix'));
});
