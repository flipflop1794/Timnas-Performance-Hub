// V1.51 Whoop records → one row per athlete per day (the local date the main sleep ended, as in Coach Donny's
// harmonizer, docs: donnyakusuma/ESPORTSINDONESIAMONITORING web/src/lib/harmonizer.mjs). Naps are skipped; recovery
// and the day's strain are matched through the sleep's own ids, not by date. Plain JavaScript: runs in the Edge
// Function and in Node tests.
const scored = (r) => r && r.score_state === 'SCORED' && r.score;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
// "+07:00" → 420 minutes
export function offsetMin(s) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(s || '')); if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}
const localDate = (ms, tz) => new Date(ms + tz * 60000).toISOString().slice(0, 10);

export function dailyFromWhoop({ sleeps = [], recoveries = [], cycles = [] }) {
  const main = new Map();
  for (const s of sleeps) {
    if (!scored(s) || s.nap || !s.start || !s.end) continue;
    const startMs = Date.parse(s.start); const endMs = Date.parse(s.end); if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const tz = offsetMin(s.timezone_offset); const day = localDate(endMs, tz);
    const inBed = num(s.score.stage_summary?.total_in_bed_time_milli) ?? endMs - startMs;
    const old = main.get(day); if (!old || inBed > old.inBed) main.set(day, { s, tz, startMs, endMs, inBed });
  }
  const out = new Map(); const bySleep = new Map(); const byCycle = new Map();
  for (const [day, { s, tz, startMs, endMs, inBed }] of main) {
    const st = s.score.stage_summary || {};
    const parts = [st.total_light_sleep_time_milli, st.total_slow_wave_sleep_time_milli, st.total_rem_sleep_time_milli].map(num);
    // mid-sleep: minutes since 12:00 local the day before (Donny's TTT)
    const anchor = Date.parse(`${day}T00:00:00Z`) - 12 * 3600000 - tz * 60000;
    const row = { day, sleepMin: parts.every((x) => x != null) ? Math.round(parts.reduce((a, b) => a + b, 0) / 60000) : null, inBedMin: Math.round(inBed / 60000),
      sleepPerf: num(s.score.sleep_performance_percentage), resp: r1(num(s.score.respiratory_rate)), mid: Math.round(((startMs + endMs) / 2 - anchor) / 60000),
      recovery: null, hrv: null, rhr: null, spo2: null, strain: null, calibrating: false };
    out.set(day, row); bySleep.set(s.id, row); if (s.cycle_id != null) byCycle.set(s.cycle_id, row);
  }
  for (const r of recoveries) {
    if (!scored(r)) continue; const row = bySleep.get(r.sleep_id); if (!row) continue;
    Object.assign(row, { recovery: num(r.score.recovery_score), hrv: r1(num(r.score.hrv_rmssd_milli)), rhr: num(r.score.resting_heart_rate), spo2: r1(num(r.score.spo2_percentage)), calibrating: !!r.score.user_calibrating });
  }
  for (const c of cycles) { if (!scored(c)) continue; const row = byCycle.get(c.id); if (row) row.strain = r1(num(c.score.strain)); }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}
