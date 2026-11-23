// TEST BRANCH (test/wearables): WHOOP / Garmin days handed to Coach Donny's real system (his code, unchanged).
// His consent check decides: refused without the athlete's "Data wearable" consent, taken after it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
let M;
before(async () => {
  const dir = `${root}/tests/.tmp-wear`; mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/entry.ts`, `export { MonitoringService, MemoryStorage, FakeClock, MemoryNotificationPort } from '../../vendor/donny-monitoring/src/index.ts';\nexport { importWearables } from '../../src/readiness/donny/wearables.tsx';\n`);
  await build({ entryPoints: [`${dir}/entry.ts`], bundle: true, format: 'esm', platform: 'node', outfile: `${dir}/out.mjs`, jsx: 'automatic', logLevel: 'silent',
    loader: { '.css': 'text' } });
  M = await import(pathToFileURL(`${dir}/out.mjs`).href);
});

test('WHOOP and Garmin days go into Coach Donny\'s system only with consent; Garmin first where both have a value; unchanged days are not sent again', () => {
  // His team setup, as in his tests/helpers.ts (without his test framework).
  const storage = new M.MemoryStorage(); const svc = new M.MonitoringService(storage, new M.FakeClock('2026-11-02T00:00:00Z'), new M.MemoryNotificationPort());
  const team = svc.buatTim({ id: 'mlbb', nama: 'Divisi MLBB', divisi: 'MLBB' });
  svc.daftarkanManajerAwal({ userId: 'manajer', teamId: team.id }); const manajer = { userId: 'manajer', teamId: team.id, peran: 'manajer_tim' };
  svc.daftarkanAtlet(manajer, { athleteId: 'rizky', nama: 'rizky', tanggalLahir: '2002-03-15' });
  const d = { svc, manajer }; const rizky = { athleteId: 'rizky' }; const day = '2026-11-02';
  const rows = [
    { athlete_id: 'rizky', provider: 'whoop', day, data: { hrvRmssd: 61.3, tidur: { durasiMenit: 360, skor: 88 }, detakJantung: { istirahat: 54, rataRata: 72, maks: 168 }, langkah: 8000 } },
    { athlete_id: 'rizky', provider: 'garmin', day, data: { langkah: 9000, stres: 31, detakJantung: { istirahat: 52 } } },
  ];
  const r1 = M.importWearables(d.svc, storage, rows);
  assert.equal(r1.sent, 0); assert.equal(r1.refused.length, 1); assert.match(r1.refused[0], /persetujuan/i);
  d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId, jenis: 'wearable' });
  const r2 = M.importWearables(d.svc, storage, rows);
  assert.equal(r2.sent, 1);
  const got = storage.listDataWearableByAthlete('rizky', day, day)[0];
  assert.equal(got.langkah, 9000, 'Garmin wins where both have a value');
  assert.equal(got.hrvRmssd, 61.3, 'WHOOP fills what Garmin did not send');
  assert.deepEqual(got.detakJantung, { istirahat: 52, rataRata: 72, maks: 168 });
  assert.equal(got.sumber, 'garmin');
  const r3 = M.importWearables(d.svc, storage, rows);
  assert.equal(r3.sent, 0); assert.equal(r3.unchanged, 1, 'nothing is written again when nothing changed');
});
