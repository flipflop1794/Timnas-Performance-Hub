// Two staff members save the same record: the second save, based on an older copy, is refused with a
// plain message naming who changed it, instead of silently overwriting. After the refresh it saves fine.
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  buildSync({ entryPoints: [fileURLToPath(new URL('../../src/web/db.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'neutral', outfile: out, external: ['@supabase/supabase-js'] });
  ({ createHubDb } = await import(pathToFileURL(out).href));
});
function snapshot(ref) {
  return new Promise((resolve, reject) => {
    const stop = ref.onSnapshot((value) => { stop(); resolve(value); }, reject);
  });
}
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
  await snapshot(a.collection('cycle'));
  await a.collection('cycle').doc('OBJ-1').set(obj('proposed', 'first'));
  await snapshot(f.collection('cycle'));
  // Fayad's copy is stale while Aufa makes two changes.
  await a.collection('cycle').doc('OBJ-1').set(obj('proposed', 'aufa edit'));
  const fv = B.tables.coaching_objectives[0].updated_at;
  await a.collection('cycle').doc('OBJ-1').set(obj('proposed', 'aufa edit 2'));
  await assert.rejects(f.collection('cycle').doc('OBJ-1').set(obj('accepted', 'fayad decision')), (e) => {
    assert.equal(e.code, 'conflict'); assert.match(e.message, /Not saved: Aufa Bassam changed this record at \d\d:\d\d WIB/); return true;
  });
  assert.equal(B.tables.coaching_objectives[0].data.note, 'aufa edit 2', "colleague's change kept");
  assert.notEqual(B.tables.coaching_objectives[0].updated_at, fv);
  // After a refresh Fayad saves normally.
  await snapshot(f.collection('cycle'));
  await f.collection('cycle').doc('OBJ-1').set(obj('accepted', 'fayad decision'));
  assert.equal(B.tables.coaching_objectives[0].data.status, 'accepted');
  // Saving twice in a row from one device is fine (its own version moves forward).
  await f.collection('cycle').doc('OBJ-1').set(obj('accepted', 'session 1'));
  await f.collection('cycle').doc('OBJ-1').set(obj('accepted', 'session 2'));
  assert.equal(B.tables.coaching_objectives[0].data.note, 'session 2');
});

test('two people creating the same new record: the second is told, not overwritten', async () => {
  const { B, a, f } = setup();
  await Promise.all([snapshot(a.collection('rival_tiers')), snapshot(f.collection('rival_tiers'))]);
  const tier = (by) => ({ id: 'MLBB|Myanmar', title: 'MLBB', nation: 'Myanmar', tier: 'Main threat', reason: by, origin: 'operational' });
  await a.collection('rival_tiers').doc('MLBB|Myanmar').set(tier('aufa'));
  await assert.rejects(f.collection('rival_tiers').doc('MLBB|Myanmar').set(tier('fayad')), /Not saved: Aufa Bassam changed this record/);
  assert.equal(B.tables.rival_tiers[0].data.reason, 'aufa');
});

test('runbooks (shared configuration) are protected the same way', async () => {
  const { B, a, f } = setup();
  const rb = (n) => ({ runbooks: { MLBB: [{ id: 'R1', item: n }] } });
  await snapshot(a.doc('config/runbooks'));
  await a.doc('config/runbooks').set(rb('v1'));
  await snapshot(f.doc('config/runbooks'));
  await a.doc('config/runbooks').set(rb('aufa v2'));
  await assert.rejects(f.doc('config/runbooks').set(rb('fayad v2')), /Not saved: Aufa Bassam/);
  assert.equal(B.tables.app_config[0].data.runbooks.MLBB[0].item, 'aufa v2');
});

test('a follow-up edit uses the version the form opened even after a newer row loads', async () => {
  const { B, a, f } = setup();
  const id = 'SC-1';
  const session = (status) => ({ id, title: 'MLBB', origin: 'operational', followUp: { status } });
  await snapshot(a.collection('scrims'));
  await a.collection('scrims').doc(id).set(session('Open'));
  const initial = (await snapshot(f.collection('scrims'))).docs[0].data()._version;
  await a.collection('scrims').doc(id).set(session('In progress'));
  const shown = (await snapshot(f.collection('scrims'))).docs[0].data();
  assert.notEqual(shown._version, initial);
  await assert.rejects(f.collection('scrims').doc(id).set(session('Done'), initial), { code: 'conflict' });
  assert.equal(B.tables.scrim_sessions[0].data.followUp.status, 'In progress');
  await f.collection('scrims').doc(id).set({ ...shown, followUp: { status: 'Done' } }, shown._version);
  assert.equal(B.tables.scrim_sessions[0].data.followUp.status, 'Done');
  assert.equal(B.tables.scrim_sessions[0].data._version, undefined);
});
