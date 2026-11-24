// V1.51 the "whoop" server function with a fake database and a fake Whoop: invite → Whoop login → callback saves
// encrypted tokens and 30 days → coaches see recovery and sleep only → sync refreshes an expired token → disconnect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, seal, open, newState } from '../supabase/functions/_shared/whoop_handler.js';
import { dailyFromWhoop, offsetMin } from '../supabase/functions/_shared/whoop_map.js';

// ---- a tiny stand-in for supabase-js (service role): select / eq / gte / maybeSingle / insert / update / upsert / delete
function fakeDb() {
  const T = { wearable_config: [{ id: 1, client_id: null, client_secret_enc: null, cron_secret: 'cron-123' }], wearable_invites: [], wearable_links: [], wearable_days: [] };
  const from = (t) => {
    const f = []; let op = 'select'; let payload = null; let conflict = '';
    const rows = () => T[t].filter((r) => f.every((fn) => fn(r)));
    const run = () => {
      if (op === 'select') return { data: rows().map((r) => ({ ...r })), error: null };
      if (op === 'insert') { T[t].push(...[].concat(payload).map((r) => ({ ...r }))); return { data: null, error: null }; }
      if (op === 'update') { rows().forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      if (op === 'delete') { const kill = new Set(rows()); T[t] = T[t].filter((r) => !kill.has(r)); return { data: null, error: null }; }
      if (op === 'upsert') { const keys = conflict.split(','); for (const r of [].concat(payload)) { const o = T[t].find((x) => keys.every((k) => x[k] === r[k])); if (o) Object.assign(o, r); else T[t].push({ ...r }); } return { data: null, error: null }; }
      return { data: null, error: null };
    };
    const q = {
      select: () => q, eq: (k, v) => { f.push((r) => r[k] === v); return q; }, gte: (k, v) => { f.push((r) => String(r[k]) >= v); return q; },
      insert: (p) => { op = 'insert'; payload = p; return q; }, update: (p) => { op = 'update'; payload = p; return q; },
      delete: () => { op = 'delete'; return q; }, upsert: (p, o) => { op = 'upsert'; payload = p; conflict = o.onConflict; return q; },
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] || null, error: null }; },
      then: (ok, bad) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { T, from };
}
const users = { donny: { reader: true, titles: [] }, indra: { reader: false, titles: ['MLBB Women'] }, other: { reader: false, titles: ['Dota 2'] } };
const userClient = (auth) => { const who = auth.replace('Bearer ', ''); const u = users[who];
  return { auth: { getUser: async () => ({ data: { user: u ? { id: `u-${who}` } : null } }) },
    rpc: async (name, args) => ({ data: name === 'can_support_read' ? !!u?.reader : name === 'can_read_title' ? !!(u?.reader || u?.titles.includes(args.t)) : null }) }; };

// ---- a fake Whoop: one athlete, three nights
const day = (d) => `2026-11-${String(d).padStart(2, '0')}`;
const sleeps = [21, 22, 23].map((d, i) => ({ id: `s${d}`, cycle_id: 100 + d, nap: false, score_state: 'SCORED', timezone_offset: '+07:00',
  start: `${day(d - 1)}T16:00:00.000Z`, end: `${day(d - 1)}T23:30:00.000Z`,
  score: { sleep_performance_percentage: 80 + i, respiratory_rate: 15.2, stage_summary: { total_in_bed_time_milli: 7.5 * 3600000, total_light_sleep_time_milli: 3 * 3600000, total_slow_wave_sleep_time_milli: 1.5 * 3600000, total_rem_sleep_time_milli: 2 * 3600000 } } }));
sleeps.push({ id: 'nap', nap: true, score_state: 'SCORED', start: `${day(23)}T06:00:00Z`, end: `${day(23)}T06:30:00Z`, timezone_offset: '+07:00', score: { stage_summary: {} } });
const recoveries = [21, 22, 23].map((d, i) => ({ sleep_id: `s${d}`, cycle_id: 100 + d, score_state: 'SCORED', score: { recovery_score: [40, 70, 85][i], hrv_rmssd_milli: [40, 52, 56.1][i], resting_heart_rate: [66, 63, 64][i], spo2_percentage: 95.5, user_calibrating: false } }));
const cycles = [21, 22, 23].map((d) => ({ id: 100 + d, score_state: 'SCORED', score: { strain: 9.84 } }));
function fakeWhoop(state) {
  return async (url, init = {}) => {
    const u = new URL(url); const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    state.calls.push(`${init.method || 'GET'} ${u.pathname}`);
    if (u.pathname.endsWith('/oauth2/token')) {
      const p = new URLSearchParams(init.body); state.grants.push(p.get('grant_type'));
      if (p.get('client_secret') !== 'sec-xyz') return reply(401, {});
      return reply(200, { access_token: `acc-${state.grants.length}`, refresh_token: `ref-${state.grants.length}`, expires_in: 3600 });
    }
    if (u.pathname.endsWith('/profile/basic')) return reply(200, { user_id: 777 });
    if (u.pathname.endsWith('/user/access')) return reply(204, null);
    const pages = { '/developer/v2/activity/sleep': sleeps, '/developer/v2/recovery': recoveries, '/developer/v2/cycle': cycles }[u.pathname];
    if (!pages) return reply(404, {});
    // two pages, to exercise next_token
    return u.searchParams.get('nextToken') ? reply(200, { records: pages.slice(2) }) : reply(200, { records: pages.slice(0, 2), next_token: 'p2' });
  };
}
const REDIRECT = 'https://proj.supabase.co/functions/v1/whoop';
function setup() {
  const db = fakeDb(); const W = { calls: [], grants: [] }; let now = new Date('2026-11-24T02:00:00Z');
  const deps = { env: { SUPABASE_SERVICE_ROLE_KEY: 'service-key' }, db, fetch: fakeWhoop(W), userClient, now: () => now, redirectUri: REDIRECT };
  const post = (who, body, headers = {}) => handle({ method: 'POST', headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), ...headers }, json: async () => body, query: {} }, deps);
  const get = (query) => handle({ method: 'GET', headers: {}, query, json: async () => ({}) }, deps);
  return { db, W, deps, post, get, setNow: (d) => { now = d; } };
}

test('Whoop records → one row per wake-up day: naps skipped, recovery and strain matched through the sleep', () => {
  const rows = dailyFromWhoop({ sleeps, recoveries, cycles });
  assert.deepEqual(rows.map((r) => r.day), ['2026-11-21', '2026-11-22', '2026-11-23'], 'local date the sleep ended (+07:00)');
  const r = rows[2];
  assert.equal(r.sleepMin, 390); assert.equal(r.inBedMin, 450); assert.equal(r.recovery, 85); assert.equal(r.hrv, 56.1); assert.equal(r.rhr, 64); assert.equal(r.strain, 9.8);
  assert.equal(r.mid, 12 * 60 + 165, 'mid-sleep 02:45 local = 14 h 45 min after noon the day before');
  assert.equal(offsetMin('-03:30'), -210);
});

test('token sealing: round trip, wrong key fails, state is 8 characters', async () => {
  const s = await seal({ access: 'a', refresh: 'r' }, 'k1');
  assert.deepEqual(await open(s, 'k1'), { access: 'a', refresh: 'r' });
  assert.doesNotMatch(s, /refresh|"r"/);
  await assert.rejects(open(s, 'k2'));
  assert.equal(newState().length, 8);
});

test('setup → invite → the athlete logs in at Whoop → tokens sealed, 30 days pulled; coaches see recovery and sleep only', async () => {
  const { db, W, post, get } = setup();
  assert.equal((await post(null, { action: 'read' })).status, 401, 'signed in only');
  assert.equal((await post('indra', { action: 'invite', title: 'MLBB Women', athlete: 'Vivy Indrawaty' })).status, 403, 'a title coach cannot make links');
  assert.equal((await post('donny', { action: 'invite', title: 'MLBB Women', athlete: 'Vivy Indrawaty' })).status, 409, 'set up the Whoop app first');
  assert.equal((await post('donny', { action: 'config', clientId: 'cid-1', clientSecret: 'sec-xyz' })).status, 200);
  assert.ok(db.T.wearable_config[0].client_secret_enc && !db.T.wearable_config[0].client_secret_enc.includes('sec-xyz'), 'secret stored sealed');
  const inv = await post('donny', { action: 'invite', title: 'MLBB Women', athlete: 'Vivy Indrawaty' });
  assert.equal(inv.status, 200); assert.match(inv.body.url, /^https:\/\/proj\.supabase\.co\/functions\/v1\/whoop\?go=[0-9a-f]{36}$/);
  const go = new URL(inv.body.url).searchParams.get('go');
  const r1 = await get({ go });
  assert.equal(r1.status, 302); const auth = new URL(r1.location);
  assert.equal(auth.origin + auth.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth'); assert.equal(auth.searchParams.get('client_id'), 'cid-1');
  assert.equal(auth.searchParams.get('redirect_uri'), REDIRECT); assert.match(auth.searchParams.get('scope'), /offline/); assert.equal(auth.searchParams.get('state').length, 8);
  const back = await get({ code: 'abc', state: auth.searchParams.get('state') });
  assert.equal(back.status, 200); assert.match(back.html, /Whoop tersambung/); assert.match(back.html, /Vivy Indrawaty/);
  const link = db.T.wearable_links[0]; assert.equal(link.athlete, 'Vivy Indrawaty'); assert.equal(link.vendor_user, '777');
  assert.doesNotMatch(link.tokens_enc, /acc-|ref-/, 'tokens are sealed'); assert.equal((await open(link.tokens_enc, 'service-key')).refresh, 'ref-1');
  assert.equal(db.T.wearable_days.length, 3); assert.ok(link.last_sync);
  assert.ok(W.calls.filter((c) => c.endsWith('/v2/recovery')).length === 2, 'followed next_token');
  assert.equal((await get({ go })).status, 410, 'a link works once');
  // reading: Donny gets every number; Indra (MLBB Women coach) recovery + sleep only; another title's coach nothing
  const d = (await post('donny', { action: 'read' })).body;
  assert.equal(d.manage, true); assert.equal(d.configured, true); assert.equal(d.days.find((x) => x.day === '2026-11-23').data.hrv, 56.1);
  const i = (await post('indra', { action: 'read', titles: ['MLBB Women', 'MLBB'] })).body;
  assert.equal(i.manage, false); assert.deepEqual(Object.keys(i.days[0].data).sort(), ['recovery', 'sleepMin']); assert.equal(i.redirectUri, undefined);
  assert.equal((await post('other', { action: 'read', titles: ['MLBB Women'] })).status, 403);
});

test('sync refreshes an expired token; a refused refresh asks for a new link; the cron needs its secret; disconnect deletes', async () => {
  const { db, W, post, get, setNow } = setup();
  await post('donny', { action: 'config', clientId: 'cid-1', clientSecret: 'sec-xyz' });
  const go = new URL((await post('donny', { action: 'invite', title: 'MLBB Women', athlete: 'Vivy Indrawaty' })).body.url).searchParams.get('go');
  const st = new URL((await get({ go })).location).searchParams.get('state'); await get({ code: 'abc', state: st });
  setNow(new Date('2026-11-24T05:00:00Z'));   // an hour later: the access token is out of date
  assert.equal((await post(null, { action: 'sync_all' }, { 'x-cron-secret': 'wrong' })).status, 401);
  const s = await post(null, { action: 'sync_all' }, { 'x-cron-secret': 'cron-123' });
  assert.deepEqual(s.body, { synced: 1, failed: 0, reconnect: 0 }); assert.deepEqual(W.grants, ['authorization_code', 'refresh_token']);
  assert.equal((await open(db.T.wearable_links[0].tokens_enc, 'service-key')).refresh, 'ref-2', 'the new refresh token is kept');
  // Whoop refuses the refresh (athlete removed access): the hub shows "needs a new link"
  setNow(new Date('2026-11-24T09:00:00Z')); db.T.wearable_config[0].client_secret_enc = await seal({ s: 'changed' }, 'service-key');
  const s2 = await post('donny', { action: 'sync' });
  assert.equal(s2.body.reconnect, 1); assert.equal(db.T.wearable_links[0].needs_reconnect, true);
  assert.equal((await post('donny', { action: 'disconnect', title: 'MLBB Women', athlete: 'Vivy Indrawaty' })).status, 200);
  assert.equal(db.T.wearable_links.length, 0); assert.equal(db.T.wearable_days.length, 0, "the athlete's numbers go too");
});

test('unknown or expired links show a page in Bahasa, not an error', async () => {
  const { get, db, post, setNow } = setup();
  assert.match((await get({})).html, /Link tidak dikenal/);
  assert.match((await get({ error: 'access_denied' })).html, /dibatalkan/);
  await post('donny', { action: 'config', clientId: 'cid-1', clientSecret: 'sec-xyz' });
  const go = new URL((await post('donny', { action: 'invite', title: 'MLBB Women', athlete: 'Vivy Indrawaty' })).body.url).searchParams.get('go');
  db.T.wearable_invites[0].expires_at = '2026-11-20T00:00:00Z'; setNow(new Date('2026-11-24T00:00:00Z'));
  const r = await get({ go }); assert.equal(r.status, 410); assert.match(r.html, /tidak berlaku/);
});
