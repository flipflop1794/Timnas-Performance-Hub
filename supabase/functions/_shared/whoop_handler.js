// V1.51 The "whoop" server function's logic, in plain JavaScript so it is tested in Node with fakes
// (tests/whoop_handler.test.js) and run unchanged in the Supabase Edge Function (whoop/index.ts).
// Ported from Coach Donny's whoop-esport server (OAuth 2.0, Whoop API v2), with the hub's own rules:
//
//   GET  ?go=<invite>          the athlete's link: sends them to Whoop's own login page
//   GET  ?code=…&state=…       Whoop sends them back: tokens saved (encrypted), last 30 days pulled
//   POST {action:'read'}       Coach Donny, Head Coach, admins: every number; a title's coaches: recovery and sleep only
//   POST {action:'invite'}     readers: a link for one athlete (7 days, once)
//   POST {action:'sync'}       readers: pull now
//   POST {action:'disconnect'} readers: revoke at Whoop, delete the tokens and that athlete's numbers
//   POST {action:'config'}     readers: the Whoop app's Client ID and Secret (from developer-dashboard.whoop.com)
//   POST {action:'sync_all'}   the database's 3-hourly job (x-cron-secret)
//
// The tables are closed to the website; this function uses the service role and checks who asks.
import { dailyFromWhoop } from './whoop_map.js';

export const WHOOP = { auth: 'https://api.prod.whoop.com/oauth/oauth2/auth', token: 'https://api.prod.whoop.com/oauth/oauth2/token', api: 'https://api.prod.whoop.com/developer' };
export const SCOPES = ['offline', 'read:recovery', 'read:cycles', 'read:sleep', 'read:profile'];
const COLLECTIONS = [['sleeps', '/v2/activity/sleep'], ['recoveries', '/v2/recovery'], ['cycles', '/v2/cycle']];
const json = (status, body) => ({ status, body });
const fail = (status, error) => json(status, { error });
const txt = (v, n) => String(v ?? '').trim().slice(0, n);
const VENDOR = 'whoop';

// ---------------------------------------------------------------- token encryption (AES-GCM, WebCrypto)
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyOf(secret) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`whoop-tokens:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(obj, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(secret), new TextEncoder().encode(JSON.stringify(obj))));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function open(s, secret) {
  const [iv, ct] = String(s).split('.');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await keyOf(secret), unb64(ct))));
}
// Whoop: the state parameter must be exactly 8 characters.
export const newState = () => b64(crypto.getRandomValues(new Uint8Array(6))).replace(/\+/g, '-').replace(/\//g, '_');
export const newNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (x) => x.toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- small pages for the athlete's phone
export function page(title, text, ok) {
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh}main{max-width:420px;padding:24px;text-align:center}
.i{font-size:48px;color:${ok ? '#3ecf8e' : '#e5484d'}}h1{font-size:22px;margin:8px 0}p{color:#bbb}</style></head>
<body><main><div class="i">${ok ? '✓' : '!'}</div><h1>${e(title)}</h1><p>${e(text)}</p><p style="font-size:13px">Timnas Performance Hub · PBESI</p></main></body></html>`;
}
const html = (status, title, text, ok = false) => ({ status, html: page(title, text, ok) });

// ---------------------------------------------------------------- the handler
// deps: { env, fetch, db (service-role client), userClient(authHeader), now(), redirectUri }
export async function handle(req, deps) {
  const { env, db } = deps;
  const secret = env.WHOOP_TOKEN_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  const cfg = await config(db, secret, env);
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.go) return startLogin(q.go, deps, cfg);
    if (q.error) return html(400, 'Tidak tersambung', 'Login Whoop dibatalkan atau ditolak. Minta link baru ke Coach Donny bila ingin mencoba lagi.');
    if (q.code && q.state) return callback(q.code, q.state, deps, cfg, secret);
    return html(404, 'Link tidak dikenal', 'Buka link yang dikirim Coach Donny.');
  }
  if (req.method !== 'POST') return fail(405, 'Method not allowed');
  let body; try { body = await req.json(); } catch { return fail(400, 'Bad request'); }
  const action = body?.action;
  if (action === 'sync_all') {
    const row = await one(db.from('wearable_config').select('cron_secret').eq('id', 1));
    if (!row?.cron_secret || req.headers['x-cron-secret'] !== row.cron_secret) return fail(401, 'Not allowed');
    return json(200, await syncMany(await all(db.from('wearable_links').select('*').eq('vendor', VENDOR)), deps, cfg, secret, 3));
  }
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth) return fail(401, 'Sign in first.');
  const uc = deps.userClient(auth);
  const { data: u } = await uc.auth.getUser(); const uid = u?.user?.id;
  if (!uid) return fail(401, 'Sign in first.');
  const reader = !!(await uc.rpc('can_support_read')).data;
  if (action === 'read') return read(body, uc, reader, deps, cfg);
  if (!reader) return fail(403, 'Only Coach Donny, the Head Coach and admins manage Whoop links.');
  if (action === 'config') {
    const id = txt(body.clientId, 200); const sec = txt(body.clientSecret, 300);
    if (!id || !sec) return fail(400, 'Fill in both the Client ID and the Client Secret.');
    await db.from('wearable_config').update({ client_id: id, client_secret_enc: await seal({ s: sec }, secret), updated_by: uid, updated_at: deps.now().toISOString() }).eq('id', 1);
    return json(200, { ok: true });
  }
  const title = txt(body.title, 60); const athlete = txt(body.athlete, 120);
  if (action === 'invite') {
    if (!cfg.clientId) return fail(409, 'Set the Whoop app (Client ID and Secret) first.');
    if (!title || !athlete) return fail(400, 'Pick the athlete.');
    const nonce = newNonce();
    const { error } = await db.from('wearable_invites').insert({ nonce, title, athlete, created_by: uid });
    if (error) return fail(400, `Could not make the link: ${error.message}`);
    return json(200, { url: `${deps.redirectUri}?go=${nonce}`, expiresInDays: 7 });
  }
  if (action === 'sync') {
    let links = await all(db.from('wearable_links').select('*').eq('vendor', VENDOR));
    if (title && athlete) links = links.filter((l) => l.title === title && l.athlete === athlete);
    return json(200, await syncMany(links, deps, cfg, secret, Math.min(30, Math.max(1, Number(body.days) || 3))));
  }
  if (action === 'disconnect') {
    const link = (await all(db.from('wearable_links').select('*').eq('vendor', VENDOR))).find((l) => l.title === title && l.athlete === athlete);
    if (link) { try { const t = await open(link.tokens_enc, secret); await deps.fetch(`${WHOOP.api}/v2/user/access`, { method: 'DELETE', headers: { Authorization: `Bearer ${t.access}` } }); } catch { /* revoke is best effort */ } }
    await db.from('wearable_links').delete().eq('title', title).eq('athlete', athlete).eq('vendor', VENDOR);
    await db.from('wearable_days').delete().eq('title', title).eq('athlete', athlete).eq('vendor', VENDOR);
    return json(200, { ok: true });
  }
  return fail(400, 'Unknown action');
}

async function one(q) { const { data } = await q.maybeSingle(); return data || null; }
async function all(q) { const { data } = await q; return data || []; }
async function config(db, secret, env) {
  const row = await one(db.from('wearable_config').select('client_id, client_secret_enc').eq('id', 1));
  let clientSecret = env.WHOOP_CLIENT_SECRET || '';
  if (!clientSecret && row?.client_secret_enc) { try { clientSecret = (await open(row.client_secret_enc, secret)).s; } catch { clientSecret = ''; } }
  return { clientId: env.WHOOP_CLIENT_ID || row?.client_id || '', clientSecret };
}

// ---- the athlete's link → Whoop's login page
async function startLogin(nonce, deps, cfg) {
  const inv = await one(deps.db.from('wearable_invites').select('*').eq('nonce', txt(nonce, 80)));
  if (!inv || inv.used_at || Date.parse(inv.expires_at) < deps.now().getTime()) return html(410, 'Link sudah tidak berlaku', 'Link ini sudah dipakai atau lewat 7 hari. Minta link baru ke Coach Donny.');
  if (!cfg.clientId) return html(503, 'Belum siap', 'Koneksi Whoop belum diatur di hub. Hubungi Coach Donny.');
  const state = newState();
  await deps.db.from('wearable_invites').update({ state }).eq('nonce', inv.nonce);
  const url = new URL(WHOOP.auth);
  url.search = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: deps.redirectUri, scope: SCOPES.join(' '), state }).toString();
  return { status: 302, location: url.toString() };
}

// ---- Whoop sends the athlete back
async function callback(code, state, deps, cfg, secret) {
  const { db } = deps;
  const inv = await one(db.from('wearable_invites').select('*').eq('state', txt(state, 8)));
  if (!inv || inv.used_at || Date.parse(inv.expires_at) < deps.now().getTime()) return html(410, 'Link sudah tidak berlaku', 'Minta link baru ke Coach Donny.');
  let tok;
  try { tok = await token(deps, { grant_type: 'authorization_code', code: txt(code, 2000), client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: deps.redirectUri }); } catch {
    return html(502, 'Tidak tersambung', 'Whoop menolak login ini. Coba buka link sekali lagi, atau minta link baru ke Coach Donny.');
  }
  let who = '';
  try { const r = await deps.fetch(`${WHOOP.api}/v2/user/profile/basic`, { headers: { Authorization: `Bearer ${tok.access}` } }); if (r.ok) who = String((await r.json()).user_id ?? ''); } catch { /* optional */ }
  const link = { title: inv.title, athlete: inv.athlete, vendor: VENDOR, vendor_user: who || null, tokens_enc: await seal(tok, secret), access_expires_at: new Date(tok.exp).toISOString(),
    needs_reconnect: false, connected_at: deps.now().toISOString(), last_error: null };
  await db.from('wearable_links').upsert(link, { onConflict: 'title,athlete,vendor' });
  await db.from('wearable_invites').update({ used_at: deps.now().toISOString() }).eq('nonce', inv.nonce);
  await syncMany([link], deps, cfg, secret, 30);
  return html(200, 'Whoop tersambung', `Terima kasih, ${inv.athlete}. Data recovery, tidur dan strain Anda masuk ke hub tim secara otomatis. Halaman ini boleh ditutup.`, true);
}

async function token(deps, params) {
  const r = await deps.fetch(WHOOP.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  if (!r.ok) throw Object.assign(new Error(`token ${r.status}`), { status: r.status });
  const j = await r.json();
  if (!j.refresh_token) throw new Error('no refresh token');
  return { access: j.access_token, refresh: j.refresh_token, exp: deps.now().getTime() + Math.max(0, Number(j.expires_in || 0) - 120) * 1000 };
}

// ---- pull the last few days for each link; one failure never stops the others
async function syncMany(links, deps, cfg, secret, days) {
  const out = { synced: 0, failed: 0, reconnect: 0 };
  for (const l of links) {
    try { await syncOne(l, deps, cfg, secret, l.last_sync ? days : 30); out.synced++; } catch (e) {
      const again = e.status === 400 || e.status === 401;
      await deps.db.from('wearable_links').update({ last_error: txt(e.message, 200), ...(again ? { needs_reconnect: true } : {}) }).eq('title', l.title).eq('athlete', l.athlete).eq('vendor', VENDOR);
      if (again) out.reconnect++; else out.failed++;
    }
  }
  return out;
}
async function syncOne(l, deps, cfg, secret, days) {
  const { db } = deps;
  let tok; try { tok = await open(l.tokens_enc, secret); } catch { throw Object.assign(new Error('saved login unreadable'), { status: 401 }); }
  if (deps.now().getTime() >= tok.exp) {
    tok = await token(deps, { grant_type: 'refresh_token', refresh_token: tok.refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: 'offline' });
    await db.from('wearable_links').update({ tokens_enc: await seal(tok, secret), access_expires_at: new Date(tok.exp).toISOString() }).eq('title', l.title).eq('athlete', l.athlete).eq('vendor', VENDOR);
  }
  // one extra day so the sleep that ended this morning has its evening start
  const start = new Date(deps.now().getTime() - (days + 1) * 86400000).toISOString();
  const raw = {};
  for (const [k, path] of COLLECTIONS) {
    raw[k] = []; let next = '';
    for (let p = 0; p < 20; p++) {
      const q = new URLSearchParams({ limit: '25', start }); if (next) q.set('nextToken', next);
      const r = await deps.fetch(`${WHOOP.api}${path}?${q}`, { headers: { Authorization: `Bearer ${tok.access}`, Accept: 'application/json' } });
      if (!r.ok) throw Object.assign(new Error(`${path} ${r.status}`), { status: r.status });
      const j = await r.json(); raw[k].push(...(j.records || [])); next = j.next_token || ''; if (!next) break;
    }
  }
  const rows = dailyFromWhoop(raw).map((d) => ({ title: l.title, athlete: l.athlete, vendor: VENDOR, day: d.day, data: d, updated_at: deps.now().toISOString() }));
  if (rows.length) await db.from('wearable_days').upsert(rows, { onConflict: 'title,athlete,vendor,day' });
  await db.from('wearable_links').update({ last_sync: deps.now().toISOString(), last_error: null, needs_reconnect: false }).eq('title', l.title).eq('athlete', l.athlete).eq('vendor', VENDOR);
}

// ---- what the hub shows. Readers: everything. A title's coaches: recovery % and sleep hours of their titles.
async function read(body, uc, reader, deps, cfg) {
  const { db } = deps;
  const days = Math.min(90, Math.max(7, Number(body.days) || 42));
  const from = new Date(deps.now().getTime() - days * 86400000).toISOString().slice(0, 10);
  let links = await all(db.from('wearable_links').select('title, athlete, vendor, needs_reconnect, connected_at, last_sync, last_error').eq('vendor', VENDOR));
  let rows = await all(db.from('wearable_days').select('title, athlete, day, data').eq('vendor', VENDOR).gte('day', from));
  if (!reader) {
    const want = [...new Set((Array.isArray(body.titles) ? body.titles : []).map((t) => txt(t, 60)).filter(Boolean))].slice(0, 12);
    const ok = []; for (const t of want) if ((await uc.rpc('can_read_title', { t })).data) ok.push(t);
    if (!ok.length) return fail(403, 'Not allowed');
    links = links.filter((l) => ok.includes(l.title)).map(({ title, athlete, last_sync, needs_reconnect }) => ({ title, athlete, last_sync, needs_reconnect }));
    rows = rows.filter((r) => ok.includes(r.title)).map((r) => ({ title: r.title, athlete: r.athlete, day: r.day, data: { recovery: r.data?.recovery ?? null, sleepMin: r.data?.sleepMin ?? null } }));
  }
  return json(200, { configured: !!(cfg.clientId && cfg.clientSecret), manage: reader, redirectUri: reader ? deps.redirectUri : undefined, links, days: rows });
}
