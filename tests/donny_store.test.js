import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The storage bridge is TypeScript that imports Coach Donny's code; bundle it for Node first.
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/readiness/donny/store.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false });
const S = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const { build: _b } = { build };

// A shared in-memory "database" with the hub's collection API (set + onSnapshot), several devices on it.
function fakeDb() {
  const rows = new Map(); const subs = new Set(); let writes = 0;
  const emit = () => { const docs = [...rows.values()].map((r) => ({ data: () => structuredClone(r) })); for (const f of subs) f({ docs }); };
  return { rows, get writes() { return writes; },
    collection: () => ({ doc: (id) => ({ set: async (d) => { writes++; rows.set(id, structuredClone(d)); queueMicrotask(emit); } }), onSnapshot: (ok) => { subs.add(ok); queueMicrotask(() => ok({ docs: [...rows.values()].map((r) => ({ data: () => structuredClone(r) })) })); } }) };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const team = (svc) => svc.buatTim({ id: 'timnas', nama: 'Timnas', divisi: 'Esports', timezone: 'Asia/Jakarta' });

test('ids made on two devices never collide (his counters would)', () => {
  const a = new S.HubStorage(), b = new S.HubStorage();
  const ids = new Set([...Array(50)].flatMap(() => [a.nextId('catatan'), b.nextId('catatan')]));
  assert.equal(ids.size, 100);
});

test('every record becomes a row; list items get their own rows; secrets never leave the device', () => {
  const st = new S.HubStorage();
  st.saveTeam({ id: 'timnas', nama: 'T', divisi: 'E', timezone: 'Asia/Jakarta' });
  st.appendAudit({ id: 'a1', teamId: 'timnas', actorId: 'x', action: 'buat', targetType: 't', targetId: 't', at: '2026-11-08T01:00:00Z' });
  st.appendAudit({ id: 'a2', teamId: 'timnas', actorId: 'x', action: 'ubah', targetType: 't', targetId: 't', at: '2026-11-08T02:00:00Z' });
  st.simpanRahasia('garmin', 'SECRET');
  const rows = S.toRows(st);
  assert.deepEqual(rows.map((r) => r.id).sort(), ['auditByTeam|timnas|a1', 'auditByTeam|timnas|a2', 'teams|timnas']);
  assert.doesNotMatch(JSON.stringify(rows), /SECRET/);
  const copy = new S.HubStorage(); S.fromRows(copy, [...rows].reverse());
  assert.deepEqual(copy.listAudit('timnas').map((x) => x.id), ['a1', 'a2'], 'list rebuilt in time order');
});

test('his service on the hub database: commands are saved, another device sees them, a removal is a marker row', async () => {
  const db = fakeDb();
  const A = S.createDonnyStore(db); await tick();
  team(A.svc); await A.persist(); await tick();
  assert.ok(db.rows.has('teams|timnas'));
  const B = S.createDonnyStore(db); await tick();
  assert.equal(B.storage.getTeam('timnas').nama, 'Timnas', 'second device loads it');
  // A change on device B reaches device A.
  B.storage.saveTeam({ ...B.storage.getTeam('timnas'), nama: 'Timnas Esports Indonesia' }); await B.persist(); await tick(); await tick();
  assert.equal(A.storage.getTeam('timnas').nama, 'Timnas Esports Indonesia');
  // Removal: marker row, record gone on both devices.
  A.storage.saveMembership({ userId: 'x', teamId: 'timnas', peran: 'staf_pelatih' }); await A.persist(); await tick();
  A.storage.deleteMembership('x', 'timnas'); await A.persist(); await tick(); await tick();
  assert.equal(db.rows.get('memberships|x:timnas').deleted, true); assert.equal(B.storage.getMembership('x', 'timnas'), undefined);
  // Nothing changed: no writes.
  const w = db.writes; await A.persist(); assert.equal(db.writes, w);
});

test('two devices adding audit entries at the same time keep both', async () => {
  const db = fakeDb();
  const A = S.createDonnyStore(db); await tick(); team(A.svc); await A.persist(); await tick();
  const B = S.createDonnyStore(db); await tick();
  A.storage.appendAudit({ id: 'from-A', teamId: 'timnas', actorId: 'a', action: 'x', targetType: 't', targetId: 't', at: '2026-11-08T03:00:00Z' });
  B.storage.appendAudit({ id: 'from-B', teamId: 'timnas', actorId: 'b', action: 'x', targetType: 't', targetId: 't', at: '2026-11-08T03:00:01Z' });
  await Promise.all([A.persist(), B.persist()]); await tick(); await tick(); await tick();
  for (const st of [A, B]) { const ids = st.storage.listAudit('timnas').map((x) => x.id); assert.ok(ids.includes('from-A') && ids.includes('from-B'), ids.join()); }
});
