import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as C from '../src/core/camp_plan.js';

const deck = () => C.newPlan({ title: 'MLBB', start: '2026-11-16', end: '2026-12-12', by: 'Coach Indra' });

test('camp plan: the deck camp gets 4 phases with 74/100/89/54 and the Mon–Sun pattern', () => {
  const p = deck();
  assert.equal(p.id, 'CP-MLBB');
  assert.deepEqual(p.weeks.map((w) => [w.phase, w.target]), [['accumulation', 74], ['peak-volume', 100], ['transmutation', 89], ['taper', 54]]);
  assert.equal(p.days['2026-11-16'].level, 'high'); // Monday
  assert.equal(p.days['2026-11-19'].level, 'low');  // Thursday
  assert.equal(p.days['2026-11-21'].level, 'simulation');
  assert.equal(p.days['2026-11-22'].level, 'off');
  assert.equal(Object.keys(p.days).length, 27);
  assert.deepEqual(C.weeks(p).map((w) => w.hours), [29, 29, 29, 29]); // last week ends Saturday (Sunday is off anyway)
  assert.deepEqual(C.warnings(p), [], 'the default plan follows the deck');
  assert.deepEqual(C.defaultPhases(6), ['accumulation', 'peak-volume', 'peak-volume', 'peak-volume', 'transmutation', 'taper']);
  assert.throws(() => C.newPlan({ title: 'MLBB', start: '2026-12-12', end: '2026-11-16', by: 'x' }), /before the start/);
  assert.throws(() => C.newPlan({ title: 'MLBB', start: '2026-01-01', end: '2026-12-01', by: 'x' }), /at most 120/);
});

test('camp plan: edits are checked, and the plan warns like the deck', () => {
  let p = deck();
  p = C.setDay(p, '2026-11-17', { level: 'high' }, 'Coach Indra');
  p = C.setWeek(p, 3, { target: 90 }, 'Coach Indra');
  const w = C.warnings(p).map((x) => x.kind);
  assert.ok(w.includes('back-to-back')); assert.ok(w.includes('taper'));
  p = C.setDay(p, '2026-11-22', { level: 'medium' }, 'x');
  assert.ok(C.warnings(p).some((x) => x.kind === 'no-day-off'));
  assert.throws(() => C.setDay(p, '2026-12-20', { level: 'high' }, 'x'), /outside the camp plan/);
  assert.throws(() => C.setDay(p, '2026-11-17', { level: 'max' }, 'x'), /Day level/);
  assert.throws(() => C.setDay(p, '2026-11-17', { note: 'call 081234567890' }, 'x'), /phone/);
  assert.throws(() => C.setWeek(p, 9, { target: 50 }, 'x'), /No such week/);
  p = C.setUnits(p, 'Mon', { s1: 'Aim drill 45\'' }, 'x');
  assert.equal(p.units.Mon.s1, 'Aim drill 45\''); assert.ok(p.units.Mon.s2, 'other units kept');
});

test('camp plan: progress counts marked days, sessions and puts load on the plan scale', () => {
  let p = deck();
  for (const d of ['2026-11-16', '2026-11-17', '2026-11-18']) p = C.setDay(p, d, { status: 'as-planned' }, 'x');
  p = C.setDay(p, '2026-11-19', { status: 'partly' }, 'x');
  const sessions = [{ date: '2026-11-16', status: 'done' }, { date: '2026-11-17', status: 'planned' }, { date: '2026-11-24', status: 'done' }];
  const loads = [{ date: '2026-11-18', load: 3700 }, { date: '2026-11-24', load: 2500 }];
  const r = C.progress(p, '2026-11-24', { sessions, loads });
  assert.equal(r.state, 'in progress'); assert.equal(r.current.n, 2);
  assert.equal(r.weeks[0].past, 6); assert.equal(r.weeks[0].marked, 4); assert.equal(r.weeks[0].unmarked, 2);
  assert.equal(r.weeks[0].adherence, 88); // (3 + ½) / 4
  assert.equal(r.logged, 2);
  assert.equal(r.weeks[0].actual, 74, 'week 1 sets the scale');
  assert.equal(r.weeks[1].actual, 50);
  assert.equal(r.weeks[2].actual, null, 'future week');
  assert.equal(C.progress(p, '2026-11-24').weeks[0].actual, null, 'no load records: no actual');
  assert.equal(C.progress(p, '2026-11-01').state, 'not started');
  const ex = C.examplePlan('2026-11-26');
  const e = C.progress(ex, '2026-11-26');
  assert.equal(ex.example, true); assert.equal(e.unmarked, 0); assert.equal(e.marked, 10); // 16–26 Nov without Sunday 22
  assert.equal(ex.days['2026-11-20'].status, 'partly'); assert.equal(ex.days['2026-11-27'].status, '', 'future days stay open');
});

test('camp plan: monthly calendar rows start on Monday and cover the WEC', () => {
  const m = C.months('2026-11-16', '2026-12-20');
  assert.deepEqual(m.map((x) => x.key), ['2026-11', '2026-12']);
  assert.deepEqual(m[0].rows[0], [null, null, null, null, null, null, '2026-11-01']); // 1 Nov 2026 is a Sunday
  assert.equal(m[1].rows[0][1], '2026-12-01');
  const o = C.overview(['MLBB', 'CS2'], [deck()], '2026-11-20');
  assert.equal(o[0].phase, 'Accumulation'); assert.equal(o[1].plan, null);
});

// ---------------------------------------------------------------- screen
const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
function mock() {
  const store = new Map(); const subs = [];
  const notify = () => subs.forEach((s) => s());
  const ref = (path) => ({ set: async (d) => { store.set(path, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(path), data: () => store.get(path) }); subs.push(f); f(); return () => {}; } });
  return { store, doc: ref, collection: (col) => ({ doc: (id) => ref(`${col}/${id}`), add: async () => {},
    onSnapshot: (next) => { const f = () => next({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }); subs.push(f); f(); return () => {}; } }) };
}

test('camp plan screen: make a plan, set a day, mark it, change a week and a weekday', async () => {
  const db = mock();
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#pel-plan', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const text = () => d.getElementById('main').textContent;
  const click = async (sel) => { const el = d.querySelector(sel); assert.ok(el, `no ${sel}`); el.click(); await wait(); };
  const set = (id, v) => { const el = d.getElementById(id); assert.ok(el, `no #${id}`); el.value = v; };
  assert.match(text(), /Camp plan/); assert.match(text(), /No camp plan yet/);
  // nothing planned yet: the worked example opens first, read-only
  assert.match(text(), /Example — not saved/); assert.ok(d.querySelector('.cp-cal'), 'example calendar');
  assert.equal(d.querySelector('[data-cp-saveday]'), null, 'example cannot be edited');
  await click('[data-cp-day="2026-11-20"]'); assert.match(text(), /Fri 2026-11-20 · Week 1, Accumulation/);
  assert.equal([...db.store.keys()].length, 0, 'the example is never saved');
  assert.ok([...d.querySelectorAll('#tabs a')].some((a) => a.textContent === 'Camp plan'));
  await click('[data-cp-title="MLBB"]');
  set('cpStart', '2026-11-16'); set('cpEnd', '2026-12-12');
  await click('[data-cp-create="MLBB"]');
  const saved = () => db.store.get('camp_plans/CP-MLBB');
  assert.equal(saved().weeks.length, 4);
  assert.match(text(), /Monthly timeline/); assert.match(text(), /November 2026/); assert.match(text(), /December 2026/);
  assert.ok(d.querySelector('td.cp-wec'), 'WEC days shown');
  await click('[data-cp-day="2026-11-17"]');
  assert.match(text(), /Tue 2026-11-17 · Week 1, Accumulation/);
  set('cpLevel', 'high'); set('cpNote', 'extra scrim');
  await click('[data-cp-status="as-planned"]');
  await click('[data-cp-saveday="2026-11-17"]');
  assert.deepEqual(saved().days['2026-11-17'], { level: 'high', status: 'as-planned', note: 'extra scrim' });
  assert.match(text(), /High days back to back/);
  set('cpPh-3', 'taper'); set('cpTg-3', '50'); await click('[data-cp-saveweek="3"]');
  assert.equal(saved().weeks[3].target, 50);
  await click('[data-cp-unitday="Thu"]'); set('cpU-s2', 'VOD lawan 60\''); await click('[data-cp-saveunits="Thu"]');
  assert.equal(saved().units.Thu.s2, 'VOD lawan 60\'');
  assert.match(text(), /VOD lawan 60'/);
  dom.window.close();
});
