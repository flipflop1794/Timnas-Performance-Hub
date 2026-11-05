import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { FIELDS, board, rivalNote } from '../src/core/competitors.js';
import { planScrim, completeScrim, summary } from '../src/core/scrims.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('competitor fields match the published finals sizes (Indonesia excluded)', () => {
  const size = Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, v.length]));
  assert.deepEqual({ d: size['Dota 2'], m: size.MLBB, mw: size['MLBB Women'], p: size['PUBG Mobile'], c: size.CS2, cw: size['CS2 Women'] }, { d: 11, m: 7, mw: 3, p: 15, c: 11, cw: 11 });
  for (const v of Object.values(FIELDS)) assert.ok(!v.includes('Indonesia'));
});

test('competitor board: verified notes, staff tiers with reasons, field check', () => {
  const b = board('MLBB', [], { 'MLBB|Myanmar': { tier: 'main threat', by: 'Aufa Bassam', why: 'Asian Games gold' } });
  assert.equal(b.rows[0].nation, 'Myanmar'); assert.equal(b.rows[0].tier, 'main threat');
  assert.ok(b.rows[0].notes.some((n) => /Asian Games/.test(n.note)));
  assert.equal(b.covered, 4);
  assert.throws(() => rivalNote({ title: 'MLBB', nation: 'Philippines', note: 'x', source: 's', kind: 'observed', by: 'A' }), /not in the published MLBB field/);
  assert.throws(() => rivalNote({ title: 'MLBB', nation: 'Nepal', note: 'x', source: '', kind: 'observed', by: 'A' }), /Source is required/);
});

test('scrim rules: partner and owner required; a scrim result needs a score', () => {
  assert.throws(() => planScrim({ title: 'Dota 2', date: '2026-11-12', kind: 'scrim', owner: 'Aufa Bassam' }), /sparring partner/);
  const sc = planScrim({ title: 'Dota 2', date: '2026-11-12', kind: 'scrim', partner: 'Team X', owner: 'Aufa Bassam', mirrors: 'Mongolia' });
  assert.throws(() => completeScrim(sc, { by: 'Aufa Bassam' }), /score/);
  const done = completeScrim(sc, { by: 'Aufa Bassam', score: '2-1' });
  const s = summary([done], 'Dota 2', '2026-11-13');
  assert.equal(s.last7, 1); assert.deepEqual(s.mirrored, ['Mongolia']);
  assert.throws(() => completeScrim(done, { by: 'x', score: '1-0' }), /already closed/);
});

function mock() {
  const store = new Map(); const subs = []; const notify = () => subs.forEach((s) => s()); let n = 0;
  const ref = (p) => ({ set: async (d) => { store.set(p, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(p), data: () => store.get(p) }); subs.push(f); f(); return () => {}; } });
  return { store, doc: ref, collection: (c) => ({ doc: (id) => ref(`${c}/${id}`), add: async (d) => { store.set(`${c}/a${++n}`, structuredClone(d)); notify(); },
    onSnapshot: (next) => { const f = () => next({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }); subs.push(f); f(); return () => {}; } }) };
}

test('page: a scrim that practises an accepted objective logs a linked session', async () => {
  const db = mock();
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#dota-team', beforeParse(w) { w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 20)); await wait();
  const d = dom.window.document; const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  d.querySelector('[data-propose]').click(); await wait();
  await go('staff-cycle');
  const id = [...db.store.keys()].find((k) => k.startsWith('cycle/')).split('/')[1];
  d.getElementById(`rv-d-${id}`).value = 'accepted'; d.getElementById(`rv-n-${id}`).value = 'Aufa Bassam';
  d.querySelector(`[data-act="review"][data-id="${id}"]`).click(); await wait();
  await go('dota-scrims');
  d.getElementById('spP-Dota_2').value = 'Sparring Team A'; d.getElementById('spMi-Dota_2').value = 'Mongolia';
  d.querySelector('input[name="spObj-Dota_2"]').checked = true;
  d.querySelector('[data-scrim-plan="Dota 2"]').click(); await wait();
  const scId = [...db.store.keys()].find((k) => k.startsWith('scrims/')).split('/')[1];
  d.getElementById(`scS-${scId}`).value = '2-1'; d.getElementById(`scR-${scId}-${id}`).value = 'partly-met'; d.getElementById(`scV-${scId}-${id}`).value = '1 of 2 reps';
  d.querySelector(`[data-scrim-done="${scId}"]`).click(); await wait();
  const o = db.store.get(`cycle/${id}`);
  assert.equal(o.sessions.length, 1); assert.equal(o.sessions[0].result, 'partly-met'); assert.equal(o.sessions[0].context.scrimId, scId); assert.equal(o.sessions[0].context.mirrors, 'Mongolia');
  assert.equal(db.store.get(`scrims/${scId}`).status, 'done');
  await go('board');
  assert.match(d.getElementById('main').textContent, /1 \/ 0/);
  await go('pubgm-rivals'); assert.match(d.getElementById('main').textContent, /Myanmar/);
  await go('t-cs2w-rivals'); assert.match(d.getElementById('main').textContent, /Field: 11 nations/);
});
