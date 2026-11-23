// TEST BRANCH (test/wearables): WHOOP and Garmin connections with simulated WHOOP / Garmin servers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whoopDays, garminItemDay, garminItems, whoopSignatureOk, cleanDay, authorizeUrl } from '../supabase/functions/_shared/wearables.js';
import { handle } from '../supabase/functions/_shared/wearables_handler.js';

const NOW = new Date('2026-11-23T03:00:00Z');
const ENV = { WHOOP_CLIENT_ID: 'w-id', WHOOP_CLIENT_SECRET: 'w-secret', GARMIN_CLIENT_ID: 'g-id', GARMIN_CLIENT_SECRET: 'g-secret', GARMIN_WEBHOOK_KEY: 'gk-123',
  HUB_URL: 'https://hub.example.test', FUNCTION_URL: 'https://p.supabase.co/functions/v1/wearables' };

// WHOOP v2 sample records (shapes from developer.whoop.com/api), Jakarta time (+07:00).
const CYCLE = { id: 93845, start: '2026-11-21T22:30:00.000Z', end: '2026-11-22T22:00:00.000Z', timezone_offset: '+07:00', score_state: 'SCORED', score: { strain: 12.34, kilojoule: 9000, average_heart_rate: 72, max_heart_rate: 168 }, step_count: 8234 };
const RECOVERY = { cycle_id: 93845, sleep_id: 's1', score_state: 'SCORED', score: { recovery_score: 66, resting_heart_rate: 54, hrv_rmssd_milli: 61.27, spo2_percentage: 97.2, skin_temp_celsius: 33.7 } };
const SLEEP = { id: 's1', start: '2026-11-21T15:40:00.000Z', end: '2026-11-21T22:25:00.000Z', timezone_offset: '+07:00', nap: false, score_state: 'SCORED',
  score: { stage_summary: { total_light_sleep_time_milli: 3 * 3600000, total_slow_wave_sleep_time_milli: 1.5 * 3600000, total_rem_sleep_time_milli: 1.5 * 3600000 }, respiratory_rate: 16.1, sleep_performance_percentage: 88, sleep_efficiency_percentage: 91.7 } };

test('WHOOP v2 records become days in Coach Donny\'s format', () => {
  const days = whoopDays({ cycles: [CYCLE], recoveries: [RECOVERY], sleeps: [SLEEP, { ...SLEEP, id: 'nap', nap: true }] });
  const d = days.find((x) => x.day === '2026-11-22').data;
  assert.equal(d.langkah, 8234); assert.equal(d.kalori, 2151);
  assert.deepEqual(d.detakJantung, { istirahat: 54, rataRata: 72, maks: 168 });
  assert.equal(d.hrvRmssd, 61.3); assert.equal(d.spo2, 97.2);
  assert.deepEqual(d.tidur, { durasiMenit: 360, skor: 88, mulai: '22:40', bangun: '05:25' }, 'sleep counted on the wake-up day, local time, naps left out');
  assert.equal(d.respirasi, 16.1);
  assert.deepEqual(days.find((x) => x.day === '2026-11-22').extra, { strain: 12.3, recovery: 66, skinTempC: 33.7, sleepEfficiency: 91.7 });
});

test('values outside Coach Donny\'s ranges are dropped, never guessed', () => {
  assert.deepEqual(cleanDay({ langkah: -5, spo2: 30, hrvRmssd: 900, respirasi: 15, detakJantung: { istirahat: 300, maks: 180 } }), { respirasi: 15, detakJantung: { maks: 180 } });
});

test('Garmin Health API summaries become days (dailies, sleep, HRV, pulse ox, body battery, body composition)', () => {
  const dly = garminItemDay('dailies', { userId: 'g1', calendarDate: '2026-11-22', steps: 10400, activeKilocalories: 600, bmrKilocalories: 1700, moderateIntensityDurationInSeconds: 1200, vigorousIntensityDurationInSeconds: 600,
    restingHeartRateInBeatsPerMinute: 55, averageHeartRateInBeatsPerMinute: 70, maxHeartRateInBeatsPerMinute: 160, averageStressLevel: 31, bodyBatteryHighestValue: 88, bodyBatteryLowestValue: 22 });
  assert.deepEqual(dly.data, { langkah: 10400, menitIntensitas: 40, kalori: 2300, detakJantung: { istirahat: 55, rataRata: 70, maks: 160 }, stres: 31, bodyBattery: { tertinggi: 88, terendah: 22 } });
  const sl = garminItemDay('sleeps', { userId: 'g1', calendarDate: '2026-11-22', startTimeInSeconds: Date.parse('2026-11-21T15:30:00Z') / 1000, startTimeOffsetInSeconds: 25200, durationInSeconds: 25200,
    deepSleepDurationInSeconds: 5400, lightSleepDurationInSeconds: 12600, remSleepInSeconds: 5400, overallSleepScore: { value: 81 } });
  assert.deepEqual(sl.data.tidur, { durasiMenit: 390, skor: 81, mulai: '22:30', bangun: '05:30' });
  assert.equal(garminItemDay('hrv', { calendarDate: '2026-11-22', lastNightAvg: 48 }).data.hrvRmssd, 48);
  assert.equal(garminItemDay('pulseox', { calendarDate: '2026-11-22', timeOffsetSpo2Values: { 0: 96, 60: 98 } }).data.spo2, 97);
  assert.deepEqual(garminItemDay('stressDetails', { calendarDate: '2026-11-22', timeOffsetBodyBatteryValues: { 0: 40, 60: 90, 120: -1 } }).data, { bodyBattery: { tertinggi: 90, terendah: 40 } });
  assert.deepEqual(garminItemDay('bodyComps', { measurementTimeInSeconds: Date.parse('2026-11-22T01:00:00Z') / 1000, weightInGrams: 68500, bodyFatInPercent: 14.2 }).data, { komposisiTubuh: { beratKg: 68.5, lemakPersen: 14.2 } });
  const g = garminItems({ dailies: [{ userId: 'g1', calendarDate: '2026-11-22' }, { userId: 'g2', callbackURL: 'https://apis.garmin.com/x' }], deregistrations: [{ userId: 'g9' }] });
  assert.equal(g.items.length, 1); assert.equal(g.pings[0].userId, 'g2'); assert.deepEqual(g.gone, ['g9']);
});

async function sign(body, ts, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(ts) + body)))));
}
test('WHOOP notifications: the signature must match the app secret and be recent', async () => {
  const body = '{"user_id":10129,"id":"s1","type":"sleep.updated"}'; const ts = NOW.getTime();
  const sig = await sign(body, ts, 'w-secret');
  assert.equal(await whoopSignatureOk({ rawBody: body, timestamp: ts, signature: sig, secret: 'w-secret', now: ts }), true);
  assert.equal(await whoopSignatureOk({ rawBody: body, timestamp: ts, signature: sig, secret: 'other', now: ts }), false);
  assert.equal(await whoopSignatureOk({ rawBody: body.replace('s1', 's2'), timestamp: ts, signature: sig, secret: 'w-secret', now: ts }), false);
  assert.equal(await whoopSignatureOk({ rawBody: body, timestamp: ts, signature: sig, secret: 'w-secret', now: ts + 3600000 }), false, 'old notifications are refused');
});

// ---------------------------------------------------------------- the server function, end to end, with fakes
function world() {
  const db = { invites: new Map(), states: new Map(), links: [], tokens: new Map(), daily: new Map() };
  const repo = {
    getInvite: async (t) => db.invites.get(t) || null,
    markInviteUsed: async (t, at) => { db.invites.get(t).used_at = at; },
    saveState: async (r) => { db.states.set(r.state, r); },
    takeState: async (s) => { const r = db.states.get(s) || null; db.states.delete(s); return r; },
    saveLink: async (r) => { db.links = db.links.filter((x) => !(x.athlete_id === r.athlete_id && x.provider === r.provider)); db.links.push({ ...r }); },
    setLink: async (a, p, patch) => { const l = db.links.find((x) => x.athlete_id === a && x.provider === p); if (l) Object.assign(l, patch); },
    linksBy: async (p, uid) => db.links.filter((x) => x.provider === p && x.provider_user_id === uid),
    listLinks: async (p) => db.links.filter((x) => x.provider === p),
    saveTokens: async (r) => { db.tokens.set(`${r.athlete_id}|${r.provider}`, r); },
    getTokens: async (a, p) => db.tokens.get(`${a}|${p}`) || null,
    deleteTokens: async (a, p) => { db.tokens.delete(`${a}|${p}`); },
    getDaily: async (a, p, d) => db.daily.get(`${a}|${p}|${d}`) || null,
    putDaily: async (r) => { db.daily.set(`${r.athlete_id}|${r.provider}|${r.day}`, r); },
  };
  const calls = [];
  const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => null } });
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith('/oauth/oauth2/token')) return reply({ access_token: `wa-${calls.length}`, refresh_token: 'wr-1', expires_in: 3600, scope: 'offline read:recovery' });
    if (u.includes('diauth.garmin.com')) return reply({ access_token: 'ga-1', refresh_token: 'gr-1', expires_in: 86400 });
    if (u.endsWith('/v2/user/profile/basic')) return reply({ user_id: 10129 });
    if (u.endsWith('/wellness-api/rest/user/id')) return reply({ userId: 'garmin-u1' });
    if (u.includes('/v2/cycle?')) return reply({ records: [CYCLE] });
    if (u.includes('/v2/recovery?')) return reply({ records: [RECOVERY] });
    if (u.includes('/v2/activity/sleep?')) return reply({ records: [SLEEP] });
    if (u.startsWith('https://apis.garmin.com/ping/')) return reply([{ userId: 'garmin-u1', calendarDate: '2026-11-22', lastNightAvg: 52 }]);
    if (init.method === 'DELETE') return reply({}, 204);
    return reply({ error: 'unexpected' }, 404);
  };
  let now = NOW;
  const deps = { env: ENV, repo, fetch, now: () => now, canManage: async (h) => h === 'Bearer donny' };
  const call = (method, path, { query = {}, headers = {}, rawBody = '' } = {}) => handle({ method, path, query, headers, rawBody }, deps);
  return { db, calls, call, setNow: (d) => { now = d; } };
}
const invite = (w, token, provider, athlete = 'ath-1') => w.db.invites.set(token, { token, athlete_id: athlete, athlete_name: 'Vivy Indrawaty', provider, expires_at: '2026-12-07T00:00:00Z', used_at: null });
const loc = (r) => new URL(r.headers.location);

test('WHOOP: personal link → WHOOP login → back to the hub: keys kept server-side, link used once, data fetched', async () => {
  const w = world(); invite(w, 'tok-whoop-aaaaaaaaaaaaaaaaaaaa', 'whoop');
  const s = await w.call('GET', '/start', { query: { t: 'tok-whoop-aaaaaaaaaaaaaaaaaaaa' } });
  assert.equal(s.status, 302); const a = loc(s);
  assert.equal(a.origin + a.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.equal(a.searchParams.get('client_id'), 'w-id'); assert.match(a.searchParams.get('scope'), /offline read:recovery read:cycles read:sleep/);
  assert.equal(a.searchParams.get('redirect_uri'), 'https://p.supabase.co/functions/v1/wearables/callback/whoop');
  const cb = await w.call('GET', '/callback/whoop', { query: { code: 'c1', state: a.searchParams.get('state') } });
  assert.equal(cb.headers.location, 'https://hub.example.test/connect.html?done=whoop');
  assert.equal(w.db.links[0].provider_user_id, '10129'); assert.equal(w.db.links[0].status, 'connected');
  assert.ok(w.db.tokens.get('ath-1|whoop').access_token.startsWith('wa-'));
  assert.ok(w.db.invites.get('tok-whoop-aaaaaaaaaaaaaaaaaaaa').used_at, 'the link works once');
  assert.equal(w.db.daily.get('ath-1|whoop|2026-11-22').data.hrvRmssd, 61.3, 'the last days are fetched right away');
  const tokenCall = w.calls.find((c) => c.url.endsWith('/oauth/oauth2/token'));
  assert.match(tokenCall.init.body, /grant_type=authorization_code/); assert.match(tokenCall.init.body, /client_secret=w-secret/);
  // The same link again: refused. A wrong or unknown link: refused.
  assert.equal(loc(await w.call('GET', '/start', { query: { t: 'tok-whoop-aaaaaaaaaaaaaaaaaaaa' } })).searchParams.get('error'), 'used');
  assert.equal(loc(await w.call('GET', '/start', { query: { t: 'nope' } })).searchParams.get('error'), 'invalid');
  // A replayed login state is refused.
  assert.equal(loc(await w.call('GET', '/callback/whoop', { query: { code: 'c1', state: a.searchParams.get('state') } })).searchParams.get('error'), 'expired');
});

test('WHOOP notification (signed) fetches that athlete again; a bad signature is refused', async () => {
  const w = world(); invite(w, 'tok-whoop-bbbbbbbbbbbbbbbbbbbb', 'whoop');
  const a = loc(await w.call('GET', '/start', { query: { t: 'tok-whoop-bbbbbbbbbbbbbbbbbbbb' } }));
  await w.call('GET', '/callback/whoop', { query: { code: 'c1', state: a.searchParams.get('state') } });
  w.db.daily.clear();
  const body = '{"user_id":10129,"id":"s1","type":"recovery.updated","trace_id":"t"}'; const ts = String(NOW.getTime());
  const bad = await w.call('POST', '/webhook/whoop', { rawBody: body, headers: { 'x-whoop-signature': 'xxx', 'x-whoop-signature-timestamp': ts } });
  assert.equal(bad.status, 401); assert.equal(w.db.daily.size, 0);
  const ok = await w.call('POST', '/webhook/whoop', { rawBody: body, headers: { 'x-whoop-signature': await sign(body, ts, 'w-secret'), 'x-whoop-signature-timestamp': ts } });
  assert.equal(ok.status, 200); assert.equal(w.db.daily.get('ath-1|whoop|2026-11-22').data.tidur.durasiMenit, 360);
});

test('Garmin: login with PKCE; push and ping notifications save days; a wrong address key is refused; deregistration disconnects', async () => {
  const w = world(); invite(w, 'tok-garmin-cccccccccccccccccccc', 'garmin', 'ath-2');
  const a = loc(await w.call('GET', '/start', { query: { t: 'tok-garmin-cccccccccccccccccccc' } }));
  assert.equal(a.origin + a.pathname, 'https://connect.garmin.com/oauth2Confirm');
  assert.equal(a.searchParams.get('code_challenge_method'), 'S256'); assert.ok(a.searchParams.get('code_challenge').length >= 43);
  await w.call('GET', '/callback/garmin', { query: { code: 'g1', state: a.searchParams.get('state') } });
  const tokenCall = w.calls.find((c) => c.url.includes('diauth.garmin.com'));
  assert.match(tokenCall.init.body, /code_verifier=/, 'the PKCE verifier goes with the code');
  assert.equal(w.db.links[0].provider_user_id, 'garmin-u1');
  const push = JSON.stringify({ dailies: [{ userId: 'garmin-u1', calendarDate: '2026-11-22', steps: 9000, restingHeartRateInBeatsPerMinute: 52 }], sleeps: [{ userId: 'someone-else', calendarDate: '2026-11-22', durationInSeconds: 20000 }] });
  assert.equal((await w.call('POST', '/webhook/garmin/wrong', { rawBody: push })).status, 404);
  const r = await w.call('POST', '/webhook/garmin/gk-123', { rawBody: push });
  assert.equal(JSON.parse(r.body).saved, 1, 'only connected athletes are saved');
  assert.equal(w.db.daily.get('ath-2|garmin|2026-11-22').data.langkah, 9000);
  // Ping: Garmin sends a link; the server fetches it with the athlete's key and merges it into the same day.
  await w.call('POST', '/webhook/garmin/gk-123', { rawBody: JSON.stringify({ hrv: [{ userId: 'garmin-u1', callbackURL: 'https://apis.garmin.com/ping/1' }] }) });
  const day = w.db.daily.get('ath-2|garmin|2026-11-22').data;
  assert.equal(day.hrvRmssd, 52); assert.equal(day.langkah, 9000, 'merged, not replaced');
  assert.equal(w.calls.find((c) => c.url.startsWith('https://apis.garmin.com/ping/')).init.headers.authorization, 'Bearer ga-1');
  await w.call('POST', '/webhook/garmin/gk-123', { rawBody: JSON.stringify({ deregistrations: [{ userId: 'garmin-u1' }] }) });
  assert.equal(w.db.links[0].status, 'disconnected'); assert.equal(w.db.tokens.has('ath-2|garmin'), false);
});

test('Sync now and disconnect: Coach Donny and admins only; an expired key is renewed first', async () => {
  const w = world(); invite(w, 'tok-whoop-dddddddddddddddddddd', 'whoop');
  const a = loc(await w.call('GET', '/start', { query: { t: 'tok-whoop-dddddddddddddddddddd' } }));
  await w.call('GET', '/callback/whoop', { query: { code: 'c1', state: a.searchParams.get('state') } });
  assert.equal((await w.call('POST', '/sync', { headers: { authorization: 'Bearer coach-indra' } })).status, 403);
  w.setNow(new Date(NOW.getTime() + 2 * 3600000));          // the 1-hour key has run out
  const before = w.calls.filter((c) => c.url.endsWith('/oauth/oauth2/token')).length;
  const s = await w.call('POST', '/sync', { headers: { authorization: 'Bearer donny' } });
  assert.equal(s.status, 200); assert.ok(JSON.parse(s.body).days >= 1);
  const refresh = w.calls.filter((c) => c.url.endsWith('/oauth/oauth2/token')).slice(before)[0];
  assert.match(refresh.init.body, /grant_type=refresh_token/); assert.match(refresh.init.body, /refresh_token=wr-1/);
  const d = await w.call('POST', '/disconnect', { headers: { authorization: 'Bearer donny' }, rawBody: JSON.stringify({ athleteId: 'ath-1', provider: 'whoop' }) });
  assert.equal(d.status, 200); assert.equal(w.db.links[0].status, 'disconnected'); assert.equal(w.db.tokens.size, 0);
  assert.ok(w.calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('/v2/user/access')), 'WHOOP is told too');
});

test('a link for a provider whose keys are not set yet says "not switched on", without leaving the hub', async () => {
  const w = world(); invite(w, 'tok-garmin-eeeeeeeeeeeeeeeeeeee', 'garmin');
  const r = await handle({ method: 'GET', path: '/start', query: { t: 'tok-garmin-eeeeeeeeeeeeeeeeeeee' }, headers: {}, rawBody: '' },
    { env: { ...ENV, GARMIN_CLIENT_ID: '' }, repo: { getInvite: async () => ({ token: 'x', provider: 'garmin', expires_at: '2026-12-07T00:00:00Z' }) }, now: () => NOW });
  assert.equal(loc(r).searchParams.get('error'), 'not_ready');
  assert.match(authorizeUrl('whoop', { clientId: 'a', redirectUri: 'https://x', state: 'abcdefgh' }), /^https:\/\/api\.prod\.whoop\.com\/oauth\/oauth2\/auth\?/);
});
