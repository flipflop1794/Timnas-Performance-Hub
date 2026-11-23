// TEST BRANCH (test/wearables) — Supabase Edge Function "wearables": WHOOP and Garmin connections for Coach Donny's
// readiness system. Logic: ../_shared/wearables_handler.js. Deploy with "Verify JWT" OFF: WHOOP and Garmin call it
// without a hub session (the WHOOP notification is checked by its signature, Garmin's by a secret key in its address;
// /sync and /disconnect check the hub session themselves).
//
// Secrets (Supabase → Edge Functions → Secrets), pasted by Coach Donny or an admin, never written in code:
//   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET     from the WHOOP developer dashboard (app)
//   GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET   from the Garmin Connect Developer Program, once approved
//   GARMIN_WEBHOOK_KEY                       any long random text; also put at the end of the Garmin notification address
//   HUB_URL                                  e.g. https://timnas-performance-hub-kappa.vercel.app (or the test site)
//   FUNCTION_URL                             https://<project>.supabase.co/functions/v1/wearables
//   SYNC_KEY                                 optional: lets a daily scheduled job call /sync
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handle } from '../_shared/wearables_handler.js';

const URL0 = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL0, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const env = Object.fromEntries(['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET', 'GARMIN_WEBHOOK_KEY', 'HUB_URL', 'FUNCTION_URL', 'SYNC_KEY']
  .map((k) => [k, Deno.env.get(k) || '']));

const one = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => { const { data, error } = await q; if (error) throw new Error(error.message); return data as any; };
const repo = {
  getInvite: (token: string) => one(admin.from('wearable_invites').select('*').eq('token', token).maybeSingle()),
  markInviteUsed: (token: string, at: string) => one(admin.from('wearable_invites').update({ used_at: at }).eq('token', token)),
  saveState: (row: unknown) => one(admin.from('wearable_oauth_state').insert(row)),
  takeState: async (state: string) => {
    const row = await one(admin.from('wearable_oauth_state').select('*').eq('state', state).maybeSingle());
    if (row) await one(admin.from('wearable_oauth_state').delete().eq('state', state));
    return row;
  },
  saveLink: (row: unknown) => one(admin.from('wearable_links').upsert(row, { onConflict: 'athlete_id,provider' })),
  setLink: (athleteId: string, provider: string, patch: unknown) => one(admin.from('wearable_links').update(patch).eq('athlete_id', athleteId).eq('provider', provider)),
  linksBy: (provider: string, uid: string) => one(admin.from('wearable_links').select('*').eq('provider', provider).eq('provider_user_id', uid)),
  listLinks: (provider: string) => one(admin.from('wearable_links').select('*').eq('provider', provider)),
  saveTokens: (row: unknown) => one(admin.from('wearable_tokens').upsert(row, { onConflict: 'athlete_id,provider' })),
  getTokens: (athleteId: string, provider: string) => one(admin.from('wearable_tokens').select('*').eq('athlete_id', athleteId).eq('provider', provider).maybeSingle()),
  deleteTokens: (athleteId: string, provider: string) => one(admin.from('wearable_tokens').delete().eq('athlete_id', athleteId).eq('provider', provider)),
  getDaily: (athleteId: string, provider: string, day: string) => one(admin.from('wearable_daily').select('data, extra').eq('athlete_id', athleteId).eq('provider', provider).eq('day', day).maybeSingle()),
  putDaily: (row: unknown) => one(admin.from('wearable_daily').upsert(row, { onConflict: 'athlete_id,provider,day' })),
};
// Coach Donny / admins: the caller's own session must pass the same check as the wellbeing tables.
async function canManage(authHeader: string) {
  if (!/^Bearer\s+\S+/.test(authHeader)) return false;
  const c = createClient(URL0, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data, error } = await c.rpc('can_wellbeing');
  return !error && data === true;
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const path = u.pathname.replace(/^.*?\/wearables/, '');
  const cors = { 'Access-Control-Allow-Origin': env.HUB_URL || '', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = await handle(
    { method: req.method, path, query: Object.fromEntries(u.searchParams), headers: Object.fromEntries(req.headers), rawBody: req.method === 'POST' ? await req.text() : '' },
    { env, fetch, repo, now: () => new Date(), canManage },
  ).catch((e: Error) => ({ status: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: `Server error: ${e.message}` }) }));
  return new Response(out.body || null, { status: out.status, headers: { ...cors, ...out.headers } });
});
