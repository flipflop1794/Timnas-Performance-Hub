import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { donnyProvider, httpSource, mapRow, NOMOR_TO_TITLE } from '../src/readiness/donnyProvider.js';
import { loadReadiness } from '../src/readiness/contract.js';
import { readinessView } from '../src/readiness/view.js';
import { TITLES } from '../src/core/staff.js';

// Fixture written to the shapes in Coach Donny's repo (BarisPapanTim, DailyScore, ScoreConfig), not copied data.
const comp = (z, beban, sumber = 'manual') => ({ wellness: { nilai: 18, z: 0.2, bobot: 0.4, tersedia: true }, tidur: { nilai: 420, z, bobot: 0.3, tersedia: true },
  reaksi: { nilai: null, z: null, bobot: 0, tersedia: false }, fisiologis: { nilai: null, z: null, bobot: 0, tersedia: false }, beban: { nilai: beban, z: 0.1, bobot: 0.3, tersedia: true, sumber } });
const rows = [
  { athleteId: 'a1', nama: 'Atlet Satu', kelompok: 'Dota 2', sudahCheckIn: true, status: 'hijau', statusReason: '', readiness: 61.2, wellnessScore: 72, komponen: comp(0.4, 1800) },
  { athleteId: 'a2', nama: 'Atlet Dua', kelompok: 'Mobile Legends: Bang Bang', sudahCheckIn: true, status: 'merah', statusReason: 'Readiness 31.0 di bawah ambang merah (35).', readiness: 31, wellnessScore: 40, komponen: comp(-1.8, 2600) },
  { athleteId: 'a3', nama: 'Atlet Tiga', kelompok: 'Mobile Legends: Bang Bang', sudahCheckIn: false, status: 'abu_abu', statusReason: 'Check-in hari ini belum terisi.', readiness: null, wellnessScore: null, komponen: {} },
  { athleteId: 'a4', nama: 'Atlet Empat', kelompok: 'Counter Strike 2 Women', sudahCheckIn: true, status: 'kuning', statusReason: 'Readiness 41.0 di bawah ambang kuning (45).', readiness: 41, wellnessScore: 55, komponen: comp(-0.6, 310, 'garmin') },
];
const scores = [
  { athleteId: 'a1', kelompok: 'Dota 2', tanggal: '2026-11-07', readiness: 60 }, { athleteId: 'a2', kelompok: 'Mobile Legends: Bang Bang', tanggal: '2026-11-07', readiness: 40 },
  { athleteId: 'a1', kelompok: 'Dota 2', tanggal: '2026-11-08', readiness: 61.2 }, { athleteId: 'a2', kelompok: 'Mobile Legends: Bang Bang', tanggal: '2026-11-08', readiness: 31 },
];
const source = { papanTim: async () => rows, trenTim: async () => scores, konfigurasiSkor: async () => ({ ambangMerah: 35, ambangKuning: 45, formulaVersion: 'v1.1' }) };

test("Donny's titles map onto all seven hub titles", () => {
  assert.deepEqual(Object.values(NOMOR_TO_TITLE).sort(), TITLES.map((t) => t.id).sort());
});

test("his board → the hub's contract: statuses, components, his thresholds, most in need first", async () => {
  const p = donnyProvider(source);
  const day = await p.getTeamDay({ title: 'All titles', date: '2026-11-08' });
  assert.deepEqual(day.athletes.map((a) => [a.name, a.status]), [['Atlet Dua', 'red'], ['Atlet Empat', 'amber'], ['Atlet Tiga', 'none'], ['Atlet Satu', 'green']]);
  assert.deepEqual(day.thresholds, { red: 35, ready: 45, label: "Coach Donny's thresholds (formula v1.1)" });
  const a2 = day.athletes[0]; assert.equal(a2.title, 'MLBB'); assert.equal(a2.sleepZ, -1.8); assert.equal(a2.loadAU, 2600); assert.match(a2.reason, /ambang merah/);
  assert.equal(day.athletes[1].loadAU, null, 'Garmin minutes are not AU');
  const mlbb = await p.getTeamDay({ title: 'MLBB', date: '2026-11-08' });
  assert.deepEqual(mlbb.athletes.map((a) => a.id), ['a2', 'a3']);
  assert.equal(mapRow({ athleteId: 'x', status: '???' }).status, 'none');
});

test('trend and alerts from his scores; the hub view renders his data without the dummy label', async () => {
  const p = donnyProvider(source);
  const tr = await p.getTrend({ title: 'All titles', date: '2026-11-08', days: 3 });
  assert.deepEqual(tr, [{ date: '2026-11-06', avg: null, n: 0 }, { date: '2026-11-07', avg: 50, n: 2 }, { date: '2026-11-08', avg: 46.1, n: 2 }]);
  const al = await p.getAlerts({ title: 'All titles', date: '2026-11-08' });
  assert.deepEqual(al.map((a) => a.status), ['red', 'amber']);
  const data = await loadReadiness(p, { title: 'All titles', date: '2026-11-08' });
  const html = readinessView({ data, titles: ['All titles', 'MLBB'], title: 'All titles', date: '2026-11-08' });
  assert.match(html, /Atlet Dua/); assert.doesNotMatch(html, /Dummy data/);
});

test('proposed HTTP source: read-only calls with his sign-in token; refusals explained', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init.headers.authorization]); return url.includes('konfigurasi') ? { ok: false, status: 403 } : { ok: true, status: 200, json: async () => [] }; };
  const s = httpSource('https://donny.example/api/', { getToken: async () => 'T', fetchImpl });
  await s.papanTim('2026-11-08'); await s.trenTim({ dari: '2026-11-01', sampai: '2026-11-08' });
  assert.deepEqual(calls, [['https://donny.example/api/papan-tim?tanggal=2026-11-08', 'Bearer T'], ['https://donny.example/api/tren-tim?dari=2026-11-01&sampai=2026-11-08', 'Bearer T']]);
  await assert.rejects(s.konfigurasiSkor(), /refused access/);
});

test('website security headers allow framing only his site', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const csp = JSON.stringify(v); assert.match(csp, /frame-src https:\/\/donnyakusuma\.github\.io;/); assert.match(csp, /frame-ancestors 'none'/);
});
