// TEST BRANCH (test/wearables) — the `wearables` server function's logic, tested in Node with fakes
// (tests/wearables.test.js) and run unchanged in the Supabase Edge Function (wearables/index.ts).
//
// Routes (after /functions/v1/wearables):
//   GET  /start?t=<invite>            athlete's personal link → WHOOP's or Garmin's own login page
//   GET  /callback/whoop|garmin       the provider sends the athlete back: keys saved, link marked used
//   POST /webhook/whoop               WHOOP v2 notification (signed) → that athlete's last days fetched again
//   POST /webhook/garmin/<key>        Garmin push/ping notification (secret key in the address) → days saved
//   POST /sync                        Coach Donny / admins: fetch WHOOP data again for everyone (also the daily job)
//   POST /disconnect                  Coach Donny / admins: end one athlete's connection on both sides
// The athlete's password never reaches the hub. Keys are kept in a table nobody signed in can read.
import { PROVIDERS, isProvider, randomToken, pkceChallenge, whoopSignatureOk, authorizeUrl, tokenBody, whoopDays, garminItems, garminItemDay, mergeDay } from './wearables.js';

const json = (status, body) => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const go = (url) => ({ status: 302, headers: { location: url }, body: '' });
const STATE_MS = 15 * 60 * 1000;

// deps: { env, fetch, repo, now(), canManage(authHeader) → Promise<boolean> }
export async function handle(req, deps) {
  const { env } = deps; const path = req.path.replace(/^\/+|\/+$/g, '');
  const hub = String(env.HUB_URL || '').replace(/\/+$/, '');
  const back = (q) => go(`${hub}/connect.html?${new URLSearchParams(q)}`);
  const cfg = (p) => ({ clientId: env[`${p.toUpperCase()}_CLIENT_ID`] || '', clientSecret: env[`${p.toUpperCase()}_CLIENT_SECRET`] || '',
    redirectUri: `${String(env.FUNCTION_URL || '').replace(/\/+$/, '')}/callback/${p}` });

  // 1. The athlete's personal link.
  if (req.method === 'GET' && path === 'start') {
    const inv = await deps.repo.getInvite(String(req.query.t || ''));
    if (!inv) return back({ error: 'invalid' });
    if (inv.used_at) return back({ error: 'used' });
    if (Date.parse(inv.expires_at) < deps.now().getTime()) return back({ error: 'expired' });
    const c = cfg(inv.provider); if (!c.clientId) return back({ error: 'not_ready', p: inv.provider });
    const state = randomToken(24); const verifier = PROVIDERS[inv.provider].pkce ? randomToken(48) : '';
    await deps.repo.saveState({ state, invite_token: inv.token, provider: inv.provider, verifier, created_at: deps.now().toISOString() });
    return go(authorizeUrl(inv.provider, { clientId: c.clientId, redirectUri: c.redirectUri, state, challenge: verifier ? await pkceChallenge(verifier) : '' }));
  }

  // 2. Back from WHOOP / Garmin.
  const cb = /^callback\/(whoop|garmin)$/.exec(path);
  if (req.method === 'GET' && cb) {
    const p = cb[1];
    if (req.query.error) return back({ error: 'denied', p });
    const st = await deps.repo.takeState(String(req.query.state || ''));
    if (!st || st.provider !== p || deps.now().getTime() - Date.parse(st.created_at) > STATE_MS) return back({ error: 'expired', p });
    const inv = await deps.repo.getInvite(st.invite_token); if (!inv || inv.used_at) return back({ error: 'used', p });
    const c = cfg(p);
    const tok = await tokenCall(deps, p, tokenBody(p, { ...c, code: String(req.query.code || ''), verifier: st.verifier }));
    if (!tok) return back({ error: 'token', p });
    const uid = await providerUserId(deps, p, tok.access_token);
    const at = deps.now().toISOString();
    await deps.repo.saveTokens(tokenRow(deps, inv.athlete_id, p, tok));
    await deps.repo.saveLink({ athlete_id: inv.athlete_id, provider: p, athlete_name: inv.athlete_name, provider_user_id: uid, status: 'connected', connected_at: at, note: '' });
    await deps.repo.markInviteUsed(inv.token, at);
    if (p === 'whoop') { try { await syncWhoop(deps, inv.athlete_id, 7); } catch { /* the next notification or daily sync fills it */ } }
    return back({ done: p });
  }

  // 3. WHOOP notification: check the signature, then fetch that athlete's last days again.
  if (req.method === 'POST' && path === 'webhook/whoop') {
    const ok = await whoopSignatureOk({ rawBody: req.rawBody, timestamp: req.headers['x-whoop-signature-timestamp'], signature: req.headers['x-whoop-signature'],
      secret: env.WHOOP_CLIENT_SECRET, now: deps.now().getTime() });
    if (!ok) return json(401, { error: 'bad signature' });
    let body; try { body = JSON.parse(req.rawBody); } catch { return json(400, { error: 'bad body' }); }
    const links = await deps.repo.linksBy('whoop', String(body.user_id ?? ''));
    for (const l of links.filter((x) => x.status === 'connected')) await syncWhoop(deps, l.athlete_id, 3);
    return json(200, { ok: true, athletes: links.length });
  }

  // 4. Garmin notification (push carries the data; ping carries a link to fetch it).
  const gw = /^webhook\/garmin\/(.+)$/.exec(path);
  if (req.method === 'POST' && gw) {
    if (!env.GARMIN_WEBHOOK_KEY || gw[1] !== env.GARMIN_WEBHOOK_KEY) return json(404, { error: 'not found' });
    let body; try { body = JSON.parse(req.rawBody); } catch { return json(400, { error: 'bad body' }); }
    const { items, pings, gone, perms } = garminItems(body);
    const byUser = new Map();
    const linkOf = async (uid) => { if (!byUser.has(uid)) byUser.set(uid, (await deps.repo.linksBy('garmin', uid)).find((x) => x.status === 'connected') || null); return byUser.get(uid); };
    for (const p of pings) {
      const l = await linkOf(p.userId); if (!l) continue;
      const key = await accessKey(deps, l.athlete_id, 'garmin'); if (!key) continue;
      const r = await deps.fetch(p.url, { headers: { authorization: `Bearer ${key}` } });
      if (!r.ok) continue;
      for (const it of [].concat(await r.json().catch(() => []))) items.push({ type: p.type, userId: p.userId, item: it });
    }
    let saved = 0;
    for (const x of items) {
      const l = await linkOf(x.userId); if (!l) continue;
      const d = garminItemDay(x.type, x.item); if (!d) continue;
      await saveDay(deps, l.athlete_id, 'garmin', d); saved++;
    }
    for (const uid of gone) for (const l of await deps.repo.linksBy('garmin', uid)) {
      await deps.repo.setLink(l.athlete_id, 'garmin', { status: 'disconnected', note: 'Athlete removed the hub in Garmin Connect' }); await deps.repo.deleteTokens(l.athlete_id, 'garmin');
    }
    for (const x of perms) for (const l of await deps.repo.linksBy('garmin', x.userId)) await deps.repo.setLink(l.athlete_id, 'garmin', { note: `Garmin permissions: ${x.permissions.join(', ') || 'none'}` });
    return json(200, { ok: true, saved });
  }

  // 5. Coach Donny / admins only.
  if (req.method === 'POST' && (path === 'sync' || path === 'disconnect')) {
    const cron = env.SYNC_KEY && req.headers['x-sync-key'] === env.SYNC_KEY;
    if (!cron && !(await deps.canManage(req.headers.authorization || ''))) return json(403, { error: 'Only Coach Donny and admins.' });
    if (path === 'sync') {
      let n = 0; const errors = [];
      for (const l of (await deps.repo.listLinks('whoop')).filter((x) => x.status === 'connected')) {
        try { n += await syncWhoop(deps, l.athlete_id, 7); } catch (e) { errors.push(`${l.athlete_name || l.athlete_id}: ${e.message}`); }
      }
      return json(200, { ok: true, days: n, errors });
    }
    let b = {}; try { b = JSON.parse(req.rawBody || '{}'); } catch { /* */ }
    if (!isProvider(b.provider) || !b.athleteId) return json(400, { error: 'athleteId and provider are required.' });
    const key = await accessKey(deps, String(b.athleteId), b.provider).catch(() => null);
    if (key) {
      const url = b.provider === 'whoop' ? `${PROVIDERS.whoop.api}/v2/user/access` : `${PROVIDERS.garmin.api}/user/registration`; // Garmin: confirm
      await deps.fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${key}` } }).catch(() => null);
    }
    await deps.repo.deleteTokens(String(b.athleteId), b.provider);
    await deps.repo.setLink(String(b.athleteId), b.provider, { status: 'disconnected', note: 'Disconnected by staff' });
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
}

// ---------------------------------------------------------------- helpers
async function tokenCall(deps, p, body) {
  const r = await deps.fetch(PROVIDERS[p].tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!r.ok) return null;
  const t = await r.json().catch(() => null); return t?.access_token ? t : null;
}
function tokenRow(deps, athleteId, p, t, old = {}) {
  return { athlete_id: athleteId, provider: p, access_token: t.access_token, refresh_token: t.refresh_token || old.refresh_token || '',
    expires_at: t.expires_in ? new Date(deps.now().getTime() + Number(t.expires_in) * 1000).toISOString() : null, scope: t.scope || old.scope || '', updated_at: deps.now().toISOString() };
}
async function providerUserId(deps, p, key) {
  const url = p === 'whoop' ? `${PROVIDERS.whoop.api}/v2/user/profile/basic` : `${PROVIDERS.garmin.api}/user/id`; // Garmin: confirm
  const r = await deps.fetch(url, { headers: { authorization: `Bearer ${key}` } }).catch(() => null);
  const b = r?.ok ? await r.json().catch(() => ({})) : {};
  return String(b.user_id ?? b.userId ?? '');
}
// A valid key for one athlete: refreshed a minute before it runs out.
async function accessKey(deps, athleteId, p) {
  const t = await deps.repo.getTokens(athleteId, p); if (!t) return null;
  if (!t.expires_at || Date.parse(t.expires_at) - 60000 > deps.now().getTime() || !t.refresh_token) return t.access_token;
  const env = deps.env; const P = p.toUpperCase();
  const n = await tokenCall(deps, p, tokenBody(p, { clientId: env[`${P}_CLIENT_ID`], clientSecret: env[`${P}_CLIENT_SECRET`], refreshToken: t.refresh_token }));
  if (!n) { await deps.repo.setLink(athleteId, p, { note: 'Key could not be renewed: the athlete should connect again.' }); return null; }
  await deps.repo.saveTokens(tokenRow(deps, athleteId, p, n, t)); return n.access_token;
}
async function whoopGet(deps, key, path, sinceIso) {
  const out = []; let next = '';
  for (let page = 0; page < 4; page++) {
    const q = new URLSearchParams({ start: sinceIso, limit: '25' }); if (next) q.set('nextToken', next);
    const r = await deps.fetch(`${PROVIDERS.whoop.api}${path}?${q}`, { headers: { authorization: `Bearer ${key}` } });
    if (r.status === 429) throw new Error('WHOOP is busy (rate limit); it will be fetched again on the next sync.');
    if (!r.ok) throw new Error(`WHOOP answered ${r.status}.`);
    const b = await r.json(); out.push(...(b.records || [])); next = b.next_token || ''; if (!next) break;
  }
  return out;
}
// Fetches the last `days` days for one athlete and saves them; returns the number of days saved.
export async function syncWhoop(deps, athleteId, days = 3) {
  const key = await accessKey(deps, athleteId, 'whoop'); if (!key) return 0;
  const since = new Date(deps.now().getTime() - days * 86400000).toISOString();
  const [cycles, recoveries, sleeps] = [await whoopGet(deps, key, '/v2/cycle', since), await whoopGet(deps, key, '/v2/recovery', since), await whoopGet(deps, key, '/v2/activity/sleep', since)];
  const out = whoopDays({ cycles, recoveries, sleeps });
  for (const d of out) await saveDay(deps, athleteId, 'whoop', d, true);
  return out.length;
}
async function saveDay(deps, athleteId, p, d, replace = false) {
  const old = await deps.repo.getDaily(athleteId, p, d.day);
  const at = deps.now().toISOString();
  await deps.repo.putDaily({ athlete_id: athleteId, provider: p, day: d.day, data: replace ? d.data : mergeDay(old?.data, d.data), extra: { ...(replace ? {} : old?.extra), ...d.extra }, updated_at: at });
  await deps.repo.setLink(athleteId, p, { last_data_at: at });
}
