import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { owner, ownerNote, queueFor, reviewersFor, TITLES } from '../src/core/staff.js';
import { staffObservation, recommendationRecord } from '../src/core/records.js';
import { propose, review } from '../src/core/cycle.js';
import { checkin, session, flags, teamDay } from '../src/core/wellbeing.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('routing follows the confirmed staff roles', () => {
  assert.equal(owner('Dota 2').name, 'Aufa Bassam');
  assert.equal(owner('MLBB').name, 'Aufa Bassam');
  for (const t of ['PUBG Mobile', 'eFootball', 'MLBB Women']) assert.equal(owner(t).name, 'Fayad');
  assert.equal(owner('CS2').name, 'Fayad');
  assert.match(ownerNote('CS2'), /by oversight; no focus owner named/);
  assert.equal(owner('Wellbeing').name, 'Donny Ardy Kusuma');
  assert.ok(reviewersFor('Dota 2').includes('Fayad'), 'Head Coach can always review');
  assert.equal(TITLES.length, 7);
});

test('staff observation needs source, games, context and enters the owner\'s queue', () => {
  assert.throws(() => staffObservation({ title: 'MLBB', observation: 'x', by: 'Aufa Bassam', context: 'national' }), /source/);
  assert.throws(() => staffObservation({ title: 'MLBB', observation: 'x', source: 's', by: 'Aufa Bassam', context: 'demo' }), /national, mixed or club/);
  const ev = staffObservation({ title: 'MLBB Women', observation: 'Late turtle setups', source: 'Scrim VOD 12 Nov', n: 3, context: 'national', by: 'Coach Ilyas' });
  assert.equal(ev.origin, 'operational'); assert.equal(ev.context, 'national');
  const rec = recommendationRecord({ problem: 'Late turtle setups', drill: 'd', success: 's', findings: [ev.id], priority: 2, confidence: ev.confidence }, [ev]);
  assert.equal(rec.sufficient, true, 'observed evidence with games is enough to propose');
  const o = propose(rec, { title: 'MLBB Women', by: 'Coach Ilyas' });
  assert.equal(o.assignedTo, 'Fayad');
  assert.equal(queueFor('fayad', [o]).length, 1); assert.equal(queueFor('aufa', [o]).length, 0);
  const r = review(o, { decision: 'accepted', reviewer: 'Fayad' });
  assert.equal(queueFor('fayad', [r]).length, 1, 'still his until closed');
});

test('wellbeing: validation, baseline building, personal flags, no scores', () => {
  assert.throws(() => checkin({ player: 'A', title: 'Dota 2', date: '2026-11-10', sleepH: 7, sleepQ: 6, fatigue: 3, soreness: 3, stress: 3, mood: 3 }), /1–5/);
  const day = (i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
  const C = []; const L = [];
  for (let i = 0; i < 3; i++) C.push(checkin({ player: 'A', title: 'Dota 2', date: day(i), sleepH: 8, sleepQ: 4, fatigue: 4, soreness: 4, stress: 4, mood: 4 }));
  assert.match(flags('A', day(2), C, L)[0].text, /Baseline building: 2 of 7/);
  for (let i = 3; i < 12; i++) C.push(checkin({ player: 'A', title: 'Dota 2', date: day(i), sleepH: 8, sleepQ: 4 + (i % 2 ? 1 : 0), fatigue: 4, soreness: 4, stress: 4, mood: 4 }));
  assert.deepEqual(flags('A', day(11), C, L), [], 'a normal day raises nothing');
  C.push(checkin({ player: 'A', title: 'Dota 2', date: day(12), sleepH: 5, sleepQ: 2, fatigue: 2, soreness: 3, stress: 2, mood: 3 }));
  C.push(checkin({ player: 'A', title: 'Dota 2', date: day(13), sleepH: 5, sleepQ: 2, fatigue: 2, soreness: 3, stress: 2, mood: 3 }));
  const f = flags('A', day(13), C, L).map((x) => x.text).join(' ');
  assert.match(f, /own 28-day average/); assert.match(f, /Under 6 h sleep on 2 consecutive days/);
  for (let w = 1; w <= 3; w++) L.push(session({ player: 'A', title: 'Dota 2', date: day(13 - w * 7), minutes: 120, rpe: 5 }));
  L.push(session({ player: 'A', title: 'Dota 2', date: day(13), minutes: 240, rpe: 8 }));
  assert.match(flags('A', day(13), C, L).map((x) => x.text).join(' '), /not a validated injury predictor/);
  const t = teamDay(['A', 'B'], day(13), C, L);
  assert.equal(t.done, 1); assert.equal(t.total, 2); assert.equal(t.toCheck.length, 1);
  assert.ok(!('score' in t) && t.rows.every((r) => !('score' in r)), 'no readiness score');
});

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

test('page: MLBB observation goes to Aufa, MLBB Women to Fayad; board covers all titles', async () => {
  const db = mock(); const h = await page('mlbb', db);
  const fill = (v) => { for (const [k, x] of Object.entries(v)) h.d.getElementById(k).value = x; };
  fill({ obT: 'MLBB', obBy: 'Coach Indra', obSrc: 'Scrim 14 Nov G1-3', obN: '3', obK: 'observed', obC: 'national', obO: 'Red side loses first-phase priority heroes', obD: 'Red-side mock drafts x5', obS: 'Priority hero secured in 4 of 5' });
  h.d.getElementById('obSave').click(); await h.wait();
  fill({ obT: 'MLBB Women', obBy: 'Coach Ilyas', obSrc: 'VOD', obN: '2', obK: 'observed', obC: 'national', obO: 'Late turtle setups', obD: 'Turtle timing drill', obS: '3 of 4 setups on time' });
  h.d.getElementById('obSave').click(); await h.wait();
  const objs = [...db.store.entries()].filter(([k]) => k.startsWith('cycle/')).map(([, v]) => v);
  assert.deepEqual(objs.map((o) => o.assignedTo).sort(), ['Aufa Bassam', 'Fayad']);
  await h.go('today'); await h.as('aufa');
  assert.match(h.text(), /Red side loses first-phase priority heroes/); assert.doesNotMatch(h.text(), /Late turtle setups/);
  await h.as('fayad'); assert.match(h.text(), /Late turtle setups/);
  await h.go('board');
  for (const t of ['Dota 2', 'MLBB', 'MLBB Women', 'PUBG Mobile', 'eFootball', 'CS2', 'CS2 Women']) assert.match(h.text(), new RegExp(t));
  assert.match(h.text(), /Overall-title \(Juara Umum\) scoring: not published/);
  assert.match(h.text(), /Not computed by the hub and not evidence/);
});

test('page: wellbeing check-in saves for editors and is hidden when access is refused', async () => {
  const db = mock(); const h = await page('well-log', db);
  h.d.getElementById('ciH').value = '5';
  h.d.getElementById('ciSave').click(); await h.wait();
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('wellbeing_checkins/')).length, 1);
  await h.go('well-day'); assert.match(h.text(), /1 of 5 players checked in/);
  const h2 = await page('well-day', mock({ denyWellbeing: true }));
  assert.match(h2.text(), /Editors only/);
  await h2.go('today'); await h2.as('donny');
  assert.match(h2.text(), /visible to editors only/);
});
