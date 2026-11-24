// Supabase Edge Function "whoop" (V1.51): athletes connect Whoop with Whoop's own login; the hub reads recovery,
// sleep, strain and HRV. Logic: ../_shared/whoop_handler.js. Deployed WITHOUT the platform's JWT check, because the
// athlete's phone opens the link without a hub account: the handler checks every signed-in action itself, and the
// 3-hourly database job carries its own secret.
//
// The Whoop app's Client ID and Secret are entered in the hub (Support staff → Whoop → Set up), or as the secrets
// WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET. Register this redirect URL in the Whoop app:
//   https://<project>.supabase.co/functions/v1/whoop
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handle } from '../_shared/whoop_handler.js';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timnas-performance-hub-kappa.vercel.app').split(',').map((s) => s.trim()).filter(Boolean);
const env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE, WHOOP_TOKEN_KEY: Deno.env.get('WHOOP_TOKEN_KEY') || '',
  WHOOP_CLIENT_ID: Deno.env.get('WHOOP_CLIENT_ID') || '', WHOOP_CLIENT_SECRET: Deno.env.get('WHOOP_CLIENT_SECRET') || '' };
const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const cors: Record<string, string> = { 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' };
  if (ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) cors['access-control-allow-origin'] = origin;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const u = new URL(req.url);
  const out = await handle(
    { method: req.method, query: Object.fromEntries(u.searchParams), headers: Object.fromEntries(req.headers), json: () => req.json() },
    { env, db, fetch, now: () => new Date(), redirectUri: Deno.env.get('WHOOP_REDIRECT_URI') || `${URL_}/functions/v1/whoop`,
      userClient: (auth: string) => createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } }) },
  ).catch((e: Error) => ({ status: 500, body: { error: `Server error: ${e.message}` } }));
  // deno-lint-ignore no-explicit-any
  const o = out as any;
  if (o.location) return new Response(null, { status: 302, headers: { location: o.location } });
  if (o.html) return new Response(o.html, { status: o.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  return new Response(JSON.stringify(o.body), { status: o.status, headers: { ...cors, 'content-type': 'application/json' } });
});
