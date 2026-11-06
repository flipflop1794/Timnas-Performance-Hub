// Two staff members save the same record: the second save, based on an older copy, is refused with a
// plain message naming who changed it, instead of silently overwriting. After the refresh it saves fine.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backend } from './fake-supabase.js';

let createHubDb;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'hubdb-')), 'db.mjs');
  buildSync({ entryPoints: [new URL('../../src/web/db.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'neutral', outfile: out, external: ['@supabase/supabase-js'] });
  ({ createHubDb } = await import(out));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setup() {
  const B = backend();
  B.addUser({ id: 'u-aufa', email: 'a@x', password: 'p', name: 'Aufa Bassam', staffKey: 'aufa', roles: ['admin', 'assistant_coach'], titles: ['Dota 2', 'MLBB'] });
  B.addUser({ id: 'u-fayad', email: 'f@x', password: 'p', name: 'Fayad', staffKey: 'fayad', roles: ['head_coach'], titles: [] });
  const names = { 'u-aufa': 'Aufa Bassam', 'u-fayad': 'Fayad' };
  const a = createHubDb(B.client('u-aufa'), { canWellbeing: true, names, debounceMs: 5 });
  const f = createHubDb(B.client('u-fayad'), { canWellbeing: false, names, debounceMs: 5 });
  return { B, a, f };
}
const obj = (status, note) => ({ id: 'OBJ-1', title: 'MLBB', status, note, rec: { problem: 'p' }, reviews: [], sessions: [], decisions: [], origin: 'operational' });

test('the later save based on an outdated copy is refused, names who changed it, and works after the refresh', async () => {
  const { B, a, f } = setup();
  const seenA = []; const seenF = [];
  a.collection('cycle').onSnapshot((s) => seenA.push(s)); f.collection('cycle').onSnapshot((s) => seenF.push(s));
  await sleep(30);
  await a.collection('cycle').doc('OBJ-1').set(obj('proposed', 'first'));
  await sleep(40);                                   // both devices now hold version 1
  // Fayad's realtime refresh is delayed: simulate an outdated copy by saving twice from Aufa's side first.
  await a.collection('cycle').doc('OBJ-1').set(obj('proposed', 'aufa edit'));
  const fv = B.tables.coaching_objectives[0].updated_at;
  // Fayad saves from the version he loaded before Aufa's edit (his snapshot has not arrived yet).
  B.channels.clear();                                // stop realtime so Fayad's copy stays old
  const f2 = createHubDb(B.client('u-fayad'), { canWellbeing: false, names: { 'u-aufa': 'Aufa Bassam' }, debounceMs: 5 });
  f2.collection('cycle').onSnapshot(() => {}); await sleep(30);   // f2 loads the current version
  await a.collection('cycle').doc('OBJ-1').set(obj('proposed', 'aufa edit 2'));   // now f2 is outdated
  await assert.rejects(f2.collection('cycle').doc('OBJ-1').set(obj('accepted', 'fayad decision')), (e) => {
    assert.equal(e.code, 'conflict'); assert.match(e.message, /Not saved: Aufa Bassam changed this record at \d\d:\d\d WIB/); return true;
  });
  assert.equal(B.tables.coaching_objectives[0].data.note, 'aufa edit 2', "colleague's change kept");
  assert.notEqual(B.tables.coaching_objectives[0].updated_at, fv);
  // After a refresh Fayad saves normally.
  const f3 = createHubDb(B.client('u-fayad'), { canWellbeing: false, names: {}, debounceMs: 5 });
  f3.collection('cycle').onSnapshot(() => {}); await sleep(30);
  await f3.collection('cycle').doc('OBJ-1').set(obj('accepted', 'fayad decision'));
  assert.equal(B.tables.coaching_objectives[0].data.status, 'accepted');
  // Saving twice in a row from one device is fine (its own version moves forward).
  await f3.collection('cycle').doc('OBJ-1').set(obj('accepted', 'session 1'));
  await f3.collection('cycle').doc('OBJ-1').set(obj('accepted', 'session 2'));
  assert.equal(B.tables.coaching_objectives[0].data.note, 'session 2');
  assert.ok(seenA.length && seenF.length);
});

test('two people creating the same new record: the second is told, not overwritten', async () => {
  const { B, a, f } = setup();
  a.collection('rival_tiers').onSnapshot(() => {}); f.collection('rival_tiers').onSnapshot(() => {}); await sleep(30);
  B.channels.clear();
  const tier = (by) => ({ id: 'MLBB|Myanmar', title: 'MLBB', nation: 'Myanmar', tier: 'Main threat', reason: by, origin: 'operational' });
  await a.collection('rival_tiers').doc('MLBB|Myanmar').set(tier('aufa'));
  await assert.rejects(f.collection('rival_tiers').doc('MLBB|Myanmar').set(tier('fayad')), /Not saved: Aufa Bassam changed this record/);
  assert.equal(B.tables.rival_tiers[0].data.reason, 'aufa');
});

test('runbooks (shared configuration) are protected the same way', async () => {
  const { B, a, f } = setup();
  const rb = (n) => ({ runbooks: { MLBB: [{ id: 'R1', item: n }] } });
  a.doc('config/runbooks').onSnapshot(() => {}); f.doc('config/runbooks').onSnapshot(() => {}); await sleep(30);
  await a.doc('config/runbooks').set(rb('v1')); await sleep(40);
  B.channels.clear();
  await a.doc('config/runbooks').set(rb('aufa v2'));
  await assert.rejects(f.doc('config/runbooks').set(rb('fayad v2')), /Not saved: Aufa Bassam/);
  assert.equal(B.tables.app_config[0].data.runbooks.MLBB[0].item, 'aufa v2');
});
