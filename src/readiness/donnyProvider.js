// Coach Donny's Athlete Readiness System → the hub's readiness contract (contract.js).
// Repository: github.com/donnyakusuma/esportsindonesiamonitoring (read 8 Nov 2026, main @ 56d88c2).
//
// His system owns check-ins, scoring (formula v1.1), thresholds and statuses. This file only translates
// his result shapes into the hub's; it computes no score and copies none of his code. Shapes used, from
// his src/domain/types.ts and src/service/monitoringService.ts:
//   BarisPapanTim { athleteId, nama, sudahCheckIn, status: hijau|kuning|merah|abu_abu, statusReason,
//                   readiness, wellnessScore, komponen: { wellness|tidur|reaksi|fisiologis|beban: { nilai, z, bobot, tersedia, sumber? } } }
//   DailyScore    { athleteId, tanggal, readiness, status, ... }
//   ScoreConfig   { ambangMerah, ambangKuning, ... }      Athlete.kelompok = his name for the title
//
// His Stage 1 runs entirely in the browser (no HTTP API, no stored data yet), so the data source is
// pluggable: httpSource() below is the API we propose to him; tests use a fixture source.

export const DONNY_REPO = 'https://github.com/donnyakusuma/esportsindonesiamonitoring';
export const DONNY_APP = 'https://donnyakusuma.github.io/esportsindonesiamonitoring/';

// His "nomor pertandingan" (Athlete.kelompok) → the hub's title names.
export const NOMOR_TO_TITLE = {
  'Mobile Legends: Bang Bang': 'MLBB', 'Mobile Legends: Bang Bang Women': 'MLBB Women', 'Dota 2': 'Dota 2', 'PUBG Mobile': 'PUBG Mobile',
  'Counter Strike 2': 'CS2', 'Counter Strike 2 Women': 'CS2 Women', eFootball: 'eFootball',
};
export const TITLE_TO_NOMOR = Object.fromEntries(Object.entries(NOMOR_TO_TITLE).map(([k, v]) => [v, k]));
const STATUS = { hijau: 'green', kuning: 'amber', merah: 'red', abu_abu: 'none' };
const NEED = { red: 0, amber: 1, none: 2, green: 3 };
const ALL = 'All titles';

const titleOf = (row) => NOMOR_TO_TITLE[row.kelompok] || null;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const dayAdd = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function mapRow(row) {
  const k = row.komponen || {};
  const status = STATUS[row.status] || 'none';
  return {
    id: String(row.athleteId), name: String(row.nama || row.athleteId), title: titleOf(row) || '—',
    checkedIn: !!row.sudahCheckIn, readiness: num(row.readiness), status,
    wellness: num(row.wellnessScore),
    sleepZ: k.tidur?.tersedia ? num(k.tidur.z) : null,
    // His load is training load in AU when it comes from sessions (RPE × minutes); Garmin minutes are not AU.
    loadAU: k.beban?.tersedia && k.beban.sumber !== 'garmin' ? num(k.beban.nilai) : null,
    reason: String(row.statusReason || ''),
  };
}

// source: { papanTim(date) → BarisPapanTim[] with kelompok, trenTim({ dari, sampai }) → (DailyScore & { kelompok })[],
//           konfigurasiSkor() → ScoreConfig & { formulaVersion? } }
export function donnyProvider(source, { label = "Coach Donny's Athlete Readiness System", preview = false } = {}) {
  const pick = (title) => (r) => title === ALL || titleOf(r) === title;
  async function getTeamDay({ title, date }) {
    const [rows, cfg] = await Promise.all([source.papanTim(date), source.konfigurasiSkor()]);
    const athletes = (rows || []).filter(pick(title)).map(mapRow)
      .sort((a, b) => NEED[a.status] - NEED[b.status] || a.name.localeCompare(b.name)); // most in need first, as his board
    return { date, title, athletes,
      thresholds: { red: num(cfg?.ambangMerah) ?? 35, ready: num(cfg?.ambangKuning) ?? 45, label: `Coach Donny's thresholds${cfg?.formulaVersion ? ` (formula ${cfg.formulaVersion})` : ''}` },
      scale: { min: 0, max: 100 } };
  }
  async function getTrend({ title, date, days }) {
    const dari = dayAdd(date, -(days - 1));
    const scores = (await source.trenTim({ dari, sampai: date })) || [];
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = dayAdd(dari, i);
      const v = scores.filter((s) => s.tanggal === d && pick(title)(s)).map((s) => num(s.readiness)).filter((x) => x != null);
      out.push({ date: d, avg: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null, n: v.length });
    }
    return out;
  }
  async function getAlerts({ title, date }) {
    const team = await getTeamDay({ title, date });
    return team.athletes.filter((a) => a.status === 'red' || a.status === 'amber')
      .map((a) => ({ athleteId: a.id, name: a.name, title: a.title, status: a.status, text: a.reason || (a.status === 'red' ? 'Below the red threshold.' : 'Below the amber threshold.'), action: 'Follow up in Coach Donny\'s system' }));
  }
  return { id: 'donny', label, kind: 'api', preview, getTeamDay, getTrend, getAlerts };
}

// The HTTP API we propose to Coach Donny (his Stage 1 has none yet). Read-only, his sign-in token.
//   GET {base}/papan-tim?tanggal=YYYY-MM-DD   → BarisPapanTim[] (+ kelompok)
//   GET {base}/tren-tim?dari=…&sampai=…       → DailyScore[] (+ kelompok)
//   GET {base}/konfigurasi-skor               → ScoreConfig (+ formulaVersion)
export function httpSource(base, { getToken = async () => '', fetchImpl = (...a) => fetch(...a) } = {}) {
  const get = async (path) => {
    const token = await getToken();
    const r = await fetchImpl(`${base.replace(/\/+$/, '')}${path}`, { headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Coach Donny's system refused access: sign in there or ask him for access." : `Coach Donny's system answered ${r.status}.`);
    return r.json();
  };
  return {
    papanTim: (tanggal) => get(`/papan-tim?tanggal=${encodeURIComponent(tanggal)}`),
    trenTim: ({ dari, sampai }) => get(`/tren-tim?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`),
    konfigurasiSkor: () => get('/konfigurasi-skor'),
  };
}
