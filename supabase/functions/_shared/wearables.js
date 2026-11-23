// TEST BRANCH (test/wearables) — WHOOP and Garmin: logins, data conversion, notification checks.
// Plain JavaScript with no imports, so it runs unchanged in the Supabase Edge Function (Deno) and in Node tests.
//
// WHOOP: official API v2 (developer.whoop.com/api): OAuth 2.0 authorization code, scopes read:recovery,
//   read:cycles, read:sleep, read:workout, read:profile, read:body_measurement (+ offline for a refresh token);
//   v2 webhooks signed with HMAC-SHA256 (X-WHOOP-Signature / X-WHOOP-Signature-Timestamp).
// Garmin: Health API (Garmin Connect Developer Program), OAuth 2.0 with PKCE, push or ping notifications per
//   summary type. Endpoint names and field names follow Garmin's published Health API; CHECK them against the
//   documentation Garmin gives at approval before going live (marked "Garmin: confirm" below).
//
// Every number is converted to Coach Donny's wearable format (DataWearable in vendor/donny-monitoring) and
// kept only when it is inside the ranges his system accepts; anything else is dropped, never guessed.

export const PROVIDERS = {
  whoop: {
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    api: 'https://api.prod.whoop.com/developer',
    scope: 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement',
    pkce: false,
  },
  garmin: {
    authUrl: 'https://connect.garmin.com/oauth2Confirm',                          // Garmin: confirm
    tokenUrl: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',          // Garmin: confirm
    api: 'https://apis.garmin.com/wellness-api/rest',                             // Garmin: confirm
    scope: '',
    pkce: true,
  },
};
export const isProvider = (p) => Object.prototype.hasOwnProperty.call(PROVIDERS, p);

// ---------------------------------------------------------------- random values, PKCE, HMAC
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function randomToken(n = 32) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b64url(b); }
export async function pkceChallenge(verifier) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}
// WHOOP v2 webhooks: base64(HMAC-SHA256(client secret, timestamp + raw body)). Old notifications are refused.
export async function whoopSignatureOk({ rawBody, timestamp, signature, secret, now = Date.now(), maxAgeMs = 10 * 60 * 1000 }) {
  if (!rawBody || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp); if (!Number.isFinite(ts) || Math.abs(now - ts) > maxAgeMs) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(timestamp) + rawBody)));
  const want = btoa(String.fromCharCode(...mac));
  if (want.length !== String(signature).length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ String(signature).charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------- login URLs and token requests
export function authorizeUrl(provider, { clientId, redirectUri, state, challenge }) {
  const P = PROVIDERS[provider]; const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, state });
  if (P.scope) q.set('scope', P.scope);
  if (P.pkce) { q.set('code_challenge', challenge); q.set('code_challenge_method', 'S256'); }
  return `${P.authUrl}?${q}`;
}
export function tokenBody(provider, { clientId, clientSecret, redirectUri, code, verifier, refreshToken }) {
  const q = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if (refreshToken) { q.set('grant_type', 'refresh_token'); q.set('refresh_token', refreshToken); if (provider === 'whoop') q.set('scope', 'offline'); }
  else { q.set('grant_type', 'authorization_code'); q.set('code', code); q.set('redirect_uri', redirectUri); if (PROVIDERS[provider].pkce) q.set('code_verifier', verifier); }
  return q;
}

// ---------------------------------------------------------------- Coach Donny's ranges (validasiDataWearable)
const inR = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const one = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const avg = (xs) => { const n = xs.filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
// Keeps only what his validator accepts; drops empty parts so a partial day merges cleanly with the rest.
export function cleanDay(d) {
  const out = {};
  if (inR(d.langkah, 0, 100000) != null) out.langkah = int(d.langkah);
  if (inR(d.menitIntensitas, 0, 1440) != null) out.menitIntensitas = int(d.menitIntensitas);
  if (d.tidur && inR(d.tidur.durasiMenit, 0, 1440) != null) {
    const t = { durasiMenit: int(d.tidur.durasiMenit), skor: inR(d.tidur.skor, 0, 100) != null ? int(d.tidur.skor) : null };
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(d.tidur.mulai || '')) t.mulai = d.tidur.mulai;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(d.tidur.bangun || '')) t.bangun = d.tidur.bangun;
    out.tidur = t;
  }
  if (inR(d.kalori, 0, 15000) != null) out.kalori = int(d.kalori);
  if (d.detakJantung) {
    const h = { istirahat: inR(d.detakJantung.istirahat, 25, 230), rataRata: inR(d.detakJantung.rataRata, 25, 230), maks: inR(d.detakJantung.maks, 25, 230) };
    if (h.istirahat != null || h.rataRata != null || h.maks != null) out.detakJantung = Object.fromEntries(Object.entries(h).filter(([, v]) => v != null).map(([k, v]) => [k, int(v)]));
  }
  if (inR(d.stres, 0, 100) != null) out.stres = int(d.stres);
  if (inR(d.spo2, 50, 100) != null) out.spo2 = one(d.spo2);
  if (d.bodyBattery && inR(d.bodyBattery.tertinggi, 0, 100) != null && inR(d.bodyBattery.terendah, 0, 100) != null) out.bodyBattery = { tertinggi: int(d.bodyBattery.tertinggi), terendah: int(d.bodyBattery.terendah) };
  if (d.komposisiTubuh && inR(d.komposisiTubuh.beratKg, 20, 250) != null && inR(d.komposisiTubuh.lemakPersen, 2, 70) != null) out.komposisiTubuh = { beratKg: one(d.komposisiTubuh.beratKg), lemakPersen: one(d.komposisiTubuh.lemakPersen) };
  if (inR(d.respirasi, 4, 60) != null) out.respirasi = one(d.respirasi);
  if (d.tekananDarah && inR(d.tekananDarah.sistolik, 60, 260) != null && inR(d.tekananDarah.diastolik, 30, 160) != null) out.tekananDarah = { sistolik: int(d.tekananDarah.sistolik), diastolik: int(d.tekananDarah.diastolik) };
  if (inR(d.hrvRmssd, 5, 300) != null) out.hrvRmssd = one(d.hrvRmssd);
  if (inR(d.durasiDudukMenit, 0, 1440) != null) out.durasiDudukMenit = int(d.durasiDudukMenit);
  return out;
}
// A newer partial day on top of what is stored (heart rate parts merge; everything else is replaced).
export function mergeDay(old = {}, add = {}) {
  const out = { ...old, ...add };
  if (old.detakJantung && add.detakJantung) out.detakJantung = { ...old.detakJantung, ...add.detakJantung };
  return out;
}

// ---------------------------------------------------------------- time helpers
const offMin = (tz) => { const m = /^([+-])(\d\d):?(\d\d)$/.exec(String(tz || '')); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0; };
const local = (iso, tz) => new Date(Date.parse(iso) + offMin(tz) * 60000).toISOString();
const localDate = (iso, tz) => local(iso, tz).slice(0, 10);
const localHm = (iso, tz) => local(iso, tz).slice(11, 16);
const epoch = (sec, offSec = 0) => new Date((Number(sec) + Number(offSec || 0)) * 1000).toISOString();

// ---------------------------------------------------------------- WHOOP v2 → days
// cycles: day strain, energy, heart rate (day = the cycle's local start date); recoveries: recovery, HRV, resting
// heart rate, SpO2 (day of its cycle); sleeps: duration, performance, bed/wake time, breathing (day = local wake date).
export function whoopDays({ cycles = [], recoveries = [], sleeps = [] }) {
  const days = new Map(); const cycleDay = new Map();
  const put = (day, data, extra) => { const x = days.get(day) || { data: {}, extra: {} }; x.data = mergeDay(x.data, data); x.extra = { ...x.extra, ...extra }; days.set(day, x); };
  for (const c of cycles) {
    if (!c?.start) continue; const day = localDate(c.start, c.timezone_offset); cycleDay.set(c.id, day);
    if (c.score_state !== 'SCORED' || !c.score) continue;
    put(day, { kalori: c.score.kilojoule != null ? c.score.kilojoule / 4.184 : null, langkah: c.step_count ?? null,
      detakJantung: { rataRata: c.score.average_heart_rate, maks: c.score.max_heart_rate } }, { strain: one(c.score.strain) });
  }
  for (const r of recoveries) {
    if (r?.score_state !== 'SCORED' || !r.score) continue;
    const day = cycleDay.get(r.cycle_id) || (r.created_at ? localDate(r.created_at, r.timezone_offset) : null); if (!day) continue;
    put(day, { hrvRmssd: r.score.hrv_rmssd_milli, spo2: r.score.spo2_percentage, detakJantung: { istirahat: r.score.resting_heart_rate } },
      { recovery: int(r.score.recovery_score), skinTempC: one(r.score.skin_temp_celsius) });
  }
  for (const s of sleeps) {
    if (s?.nap || s?.score_state !== 'SCORED' || !s.score || !s.end) continue;
    const st = s.score.stage_summary || {};
    const asleep = ['total_light_sleep_time_milli', 'total_slow_wave_sleep_time_milli', 'total_rem_sleep_time_milli'].reduce((a, k) => a + (Number(st[k]) || 0), 0);
    put(localDate(s.end, s.timezone_offset), { tidur: { durasiMenit: asleep / 60000, skor: s.score.sleep_performance_percentage, mulai: localHm(s.start, s.timezone_offset), bangun: localHm(s.end, s.timezone_offset) },
      respirasi: s.score.respiratory_rate }, { sleepEfficiency: one(s.score.sleep_efficiency_percentage) });
  }
  return [...days.entries()].map(([day, x]) => ({ day, data: cleanDay(x.data), extra: x.extra }));
}

// ---------------------------------------------------------------- Garmin Health API → days (Garmin: confirm)
// One notification can carry several summary types; each item names its user (userId). Ping notifications carry a
// callbackURL instead of the data (fetched by the handler with that user's key, then passed here as items).
export const GARMIN_TYPES = ['dailies', 'sleeps', 'hrv', 'pulseox', 'allDayRespiration', 'bodyComps', 'bloodPressures', 'stressDetails'];
export function garminItemDay(type, it) {
  const day = it.calendarDate || (it.startTimeInSeconds != null ? epoch(it.startTimeInSeconds, it.startTimeOffsetInSeconds).slice(0, 10)
    : it.measurementTimeInSeconds != null ? epoch(it.measurementTimeInSeconds, it.measurementTimeOffsetInSeconds).slice(0, 10) : null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
  const vals = (o) => Object.values(o || {}).map(Number);
  let data = {}; let extra = {};
  if (type === 'dailies') {
    data = { langkah: it.steps, kalori: (Number(it.activeKilocalories) || 0) + (Number(it.bmrKilocalories) || 0) || null,
      menitIntensitas: it.moderateIntensityDurationInSeconds != null || it.vigorousIntensityDurationInSeconds != null
        ? ((Number(it.moderateIntensityDurationInSeconds) || 0) + 2 * (Number(it.vigorousIntensityDurationInSeconds) || 0)) / 60 : null,
      detakJantung: { istirahat: it.restingHeartRateInBeatsPerMinute, rataRata: it.averageHeartRateInBeatsPerMinute, maks: it.maxHeartRateInBeatsPerMinute },
      stres: Number(it.averageStressLevel) >= 0 ? it.averageStressLevel : null,
      bodyBattery: it.bodyBatteryHighestValue != null ? { tertinggi: it.bodyBatteryHighestValue, terendah: it.bodyBatteryLowestValue } : null };
  } else if (type === 'sleeps') {
    const secs = ['deepSleepDurationInSeconds', 'lightSleepDurationInSeconds', 'remSleepInSeconds'].reduce((a, k) => a + (Number(it[k]) || 0), 0) || Number(it.durationInSeconds) || 0;
    const start = it.startTimeInSeconds != null ? epoch(it.startTimeInSeconds, it.startTimeOffsetInSeconds) : null;
    const end = start && it.durationInSeconds != null ? epoch(Number(it.startTimeInSeconds) + Number(it.durationInSeconds), it.startTimeOffsetInSeconds) : null;
    data = { tidur: { durasiMenit: secs / 60, skor: it.overallSleepScore?.value ?? null, mulai: start?.slice(11, 16), bangun: end?.slice(11, 16) } };
  } else if (type === 'hrv') data = { hrvRmssd: it.lastNightAvg };
  else if (type === 'pulseox') data = { spo2: avg(vals(it.timeOffsetSpo2Values)) };
  else if (type === 'allDayRespiration') data = { respirasi: avg(vals(it.timeOffsetEpochToBreaths)) };
  else if (type === 'bodyComps') data = { komposisiTubuh: { beratKg: Number(it.weightInGrams) / 1000, lemakPersen: it.bodyFatInPercent } };
  else if (type === 'bloodPressures') data = { tekananDarah: { sistolik: it.systolic, diastolik: it.diastolic } };
  else if (type === 'stressDetails') {
    const bb = vals(it.timeOffsetBodyBatteryValues).filter((v) => v >= 0);
    data = bb.length ? { bodyBattery: { tertinggi: Math.max(...bb), terendah: Math.min(...bb) } } : {};
    extra = it.averageStressLevel != null ? { stressAvg: it.averageStressLevel } : {};
  } else return null;
  return { day, data: cleanDay(data), extra };
}
// The items of one notification, by summary type, split into data items and ping callbacks.
export function garminItems(body) {
  const out = []; const pings = [];
  for (const type of GARMIN_TYPES) for (const it of Array.isArray(body?.[type]) ? body[type] : []) {
    if (!it?.userId) continue;
    if (it.callbackURL) pings.push({ type, userId: String(it.userId), url: String(it.callbackURL) }); else out.push({ type, userId: String(it.userId), item: it });
  }
  const gone = (Array.isArray(body?.deregistrations) ? body.deregistrations : []).map((x) => String(x?.userId || '')).filter(Boolean);
  const perms = (Array.isArray(body?.userPermissionsChange) ? body.userPermissionsChange : []).filter((x) => x?.userId).map((x) => ({ userId: String(x.userId), permissions: x.permissions || [] }));
  return { items: out, pings, gone, perms };
}
