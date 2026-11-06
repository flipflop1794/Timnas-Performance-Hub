// Supabase Edge Function "scrim-ai" (V1.13): reads scrim screenshots, splits dictated debriefs and
// writes pattern findings with the Claude API, as the signed-in coach. Logic: ../_shared/scrim_ai_handler.js.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   required; without it the hub falls back to typing by hand
//   ALLOWED_ORIGINS     comma-separated site origins, e.g. https://timnas-performance-hub-kappa.vercel.app
//   SCRIM_AI_MODEL      optional, default claude-sonnet-5-5
//   DAILY_CALL_CAP      optional, calls per person per day (WIB), default 300
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handle, corsHeaders } from '../_shared/scrim_ai_handler.js';
import { HEROES } from '../_shared/catalog.gen.js';

const env = {
  ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY') || '',
  SCRIM_AI_MODEL: Deno.env.get('SCRIM_AI_MODEL') || '',
  DAILY_CALL_CAP: Deno.env.get('DAILY_CALL_CAP') || '',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ALLOWED = Deno.env.get('ALLOWED_ORIGINS') || '';

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('origin') || '', ALLOWED);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const out = await handle(
    { method: req.method, headers: Object.fromEntries(req.headers), json: () => req.json() },
    {
      env, fetch, heroes: HEROES, now: () => new Date(), uuid: () => crypto.randomUUID(),
      clientFor: (authHeader: string) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
      }),
    },
  ).catch((e: Error) => ({ status: 500, body: { error: `Server error: ${e.message}` } }));
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { ...cors, 'content-type': 'application/json' } });
});
