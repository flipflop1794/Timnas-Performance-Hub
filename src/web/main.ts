// Website entry point: sign-in first, then the existing hub on top of Supabase.
// The hub itself (src/hub/app.js) is unchanged in how it stores data: it asks window.claude.use('db')
// for a database, and here that database is Supabase (src/web/db.ts).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHubDb } from './db';
import { T, lang, setLang } from './strings';

declare const __HUB_CONFIG__: { url: string; key: string };
declare const __TEST_HOOKS__: boolean;

export type Role = 'admin' | 'head_coach' | 'assistant_coach' | 'readiness_owner' | 'title_coach' | 'analyst';
export interface HubUser { id: string; email: string; name: string; staffKey: string | null; roles: Role[]; titles: string[]; isAdmin: boolean; canWellbeing: boolean; seesAllTitles: boolean }

const W = window as unknown as Record<string, any>;
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function shell(html: string) {
  $('#titles').innerHTML = `<button type="button" class="lang" id="authLang"><b${lang() === 'en' ? ' class="on"' : ''}>EN</b><b${lang() === 'id' ? ' class="on"' : ''}>ID</b></button>`;
  $('#tabs').innerHTML = '';
  $('#main').innerHTML = `<div class="panel auth">${html}</div>`;
}
const msg = (text: string, cls = '') => { const el = document.getElementById('authMsg'); if (el) { el.textContent = text; el.className = `msg ${cls}`; } };

function showLogin(client: SupabaseClient, note = '') {
  shell(`<h2>${T('Sign in')}</h2><p class="note">${T('Invite-only. Use the email your invitation was sent to.')}</p>
    <form id="loginForm" class="form1"><label class="field" for="authEmail">${T('Email')}<input type="email" id="authEmail" autocomplete="username" required></label>
    <label class="field" for="authPw">${T('Password')}<input type="password" id="authPw" autocomplete="current-password" required></label>
    <div class="toolbar"><button class="btn primary" type="submit">${T('Sign in')}</button><button class="linkbtn" type="button" id="forgotBtn">${T('Forgot password?')}</button></div>
    <p class="msg" id="authMsg" role="status">${esc(note)}</p></form>`);
  ($('#loginForm') as HTMLFormElement).onsubmit = async (e) => {
    e.preventDefault(); msg(T('Signing in…'));
    const email = ($('#authEmail') as HTMLInputElement).value.trim(); const password = ($('#authPw') as HTMLInputElement).value;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return msg(T('Email or password is not correct.'), 'err');
    await start(client, data.session.user.id);
  };
  $('#forgotBtn').onclick = async () => {
    const email = ($('#authEmail') as HTMLInputElement).value.trim();
    if (!email) return msg(T('Type your email first.'), 'err');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg(error ? T('Could not send the email. Try again in a few minutes.') : T('If that email has an account, a link to set a new password is on its way.'), error ? 'err' : 'ok');
  };
}

function showSetPassword(client: SupabaseClient, userId: string) {
  shell(`<h2>${T('Set your password')}</h2><p class="note">${T('At least 10 characters. You will use it to sign in from any device.')}</p>
    <form id="pwForm" class="form1"><label class="field" for="pw1">${T('New password')}<input type="password" id="pw1" autocomplete="new-password" minlength="10" required></label>
    <label class="field" for="pw2">${T('Repeat password')}<input type="password" id="pw2" autocomplete="new-password" minlength="10" required></label>
    <div class="toolbar"><button class="btn primary" type="submit">${T('Save password')}</button></div><p class="msg" id="authMsg" role="status"></p></form>`);
  ($('#pwForm') as HTMLFormElement).onsubmit = async (e) => {
    e.preventDefault();
    const a = ($('#pw1') as HTMLInputElement).value, b = ($('#pw2') as HTMLInputElement).value;
    if (a.length < 10) return msg(T('At least 10 characters.'), 'err');
    if (a !== b) return msg(T('The two passwords are different.'), 'err');
    const { error } = await client.auth.updateUser({ password: a });
    if (error) return msg(error.message, 'err');
    history.replaceState(null, '', location.pathname);
    await start(client, userId);
  };
}

export async function loadMe(client: SupabaseClient, id: string): Promise<HubUser> {
  const [p, r, t] = await Promise.all([
    client.from('profiles').select('id, email, display_name, staff_key').eq('id', id).maybeSingle(),
    client.from('user_roles').select('role').eq('user_id', id),
    client.from('user_titles').select('title').eq('user_id', id),
  ]);
  const roles = ((r.data || []) as { role: Role }[]).map((x) => x.role);
  const prof = (p.data || {}) as Record<string, string>;
  return {
    id, email: prof.email || '', name: prof.display_name || prof.email || '', staffKey: prof.staff_key || null, roles,
    titles: ((t.data || []) as { title: string }[]).map((x) => x.title),
    isAdmin: roles.includes('admin'), canWellbeing: roles.includes('admin') || roles.includes('readiness_owner'),
    seesAllTitles: roles.some((x) => ['admin', 'head_coach', 'assistant_coach'].includes(x)),
  };
}

function download({ filename, data }: { filename: string; data: BlobPart }) {
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve({ status: 'saved' as const });
}

// Admin: read and change roles and title assignments (the database allows this to admins only).
function adminApi(client: SupabaseClient) {
  return {
    async listUsers() {
      const [p, r, t] = await Promise.all([
        client.from('profiles').select('id, email, display_name, staff_key, created_at').order('created_at'),
        client.from('user_roles').select('user_id, role'), client.from('user_titles').select('user_id, title'),
      ]);
      const err = p.error || r.error || t.error; if (err) throw new Error(err.message);
      return ((p.data || []) as Record<string, string>[]).map((u) => ({ ...u,
        roles: ((r.data || []) as Record<string, string>[]).filter((x) => x.user_id === u.id).map((x) => x.role),
        titles: ((t.data || []) as Record<string, string>[]).filter((x) => x.user_id === u.id).map((x) => x.title) }));
    },
    async saveUser(id: string, want: { display_name: string; staff_key: string | null; roles: string[]; titles: string[] }, have: { roles: string[]; titles: string[] }) {
      const ops: PromiseLike<{ error: { message: string } | null }>[] = [];
      const add = (tb: string, col: string, vals: string[]) => vals.length && ops.push(client.from(tb).insert(vals.map((v) => ({ user_id: id, [col]: v }))));
      const del = (tb: string, col: string, vals: string[]) => vals.forEach((v) => ops.push(client.from(tb).delete().eq('user_id', id).eq(col, v)));
      add('user_roles', 'role', want.roles.filter((x) => !have.roles.includes(x)));
      add('user_titles', 'title', want.titles.filter((x) => !have.titles.includes(x)));
      ops.push(client.from('profiles').update({ display_name: want.display_name, staff_key: want.staff_key || null }).eq('id', id));
      const first = await Promise.all(ops); ops.length = 0;
      // Removals last, so an admin is never left without a role in between.
      del('user_titles', 'title', have.titles.filter((x) => !want.titles.includes(x)));
      del('user_roles', 'role', have.roles.filter((x) => !want.roles.includes(x)));
      const errs = [...first, ...(await Promise.all(ops))].map((x) => x.error).filter(Boolean);
      if (errs.length) throw new Error(errs[0]!.message);
    },
    // AI calls since a date (admins read every row), for the cost panel.
    async aiUsage(since: string) {
      const rows: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('ai_usage').select('at, title, action, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, attempts, ok').gte('at', since).order('at').range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data || [])); if (!data || data.length < 1000) break;
      }
      return rows;
    },
    // Everything this account can read, as one JSON file (admins can read every table).
    async exportAll() {
      const tables = ['profiles', 'user_roles', 'user_titles', 'disciplines', 'roster_players', 'app_config', 'scrim_sessions', 'scrim_reports', 'scrim_report_corrections',
        'coaching_objectives', 'scouting_notes', 'rival_tiers', 'rival_rosters', 'rival_vods', 'opponent_cards', 'sparring_partners', 'wec_matches', 'player_plans',
        'pubgm_logs', 'dota_matches', 'dota_pools', 'wellbeing_checkins', 'wellbeing_loads', 'scrim_games', 'scrim_captures', 'pattern_findings', 'player_aliases', 'ai_usage', 'draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games', 'readiness_store'];
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), note: 'Timnas Performance Hub export. Contains wellbeing data if exported by an admin: store securely.' };
      for (const tb of tables) {
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await client.from(tb).select('*').range(from, from + 999);
          if (error) throw new Error(`${tb}: ${error.message}`);
          rows.push(...(data || [])); if (!data || data.length < 1000) break;
        }
        out[tb] = rows;
      }
      return JSON.stringify(out, null, 1);
    },
  };
}

// V1.13: the scrim-ai server function (screenshots, debrief, patterns). Errors come back as plain sentences.
function aiApi(client: SupabaseClient) {
  return {
    async call(body: Record<string, unknown>) {
      const { data, error } = await client.functions.invoke('scrim-ai', { body });
      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        let msg = error.message;
        try { const j = await ctx?.json?.(); if (j?.error) msg = j.error; } catch { /* not JSON */ }
        if (ctx?.status === 404) msg = 'AI capture is not set up on the server yet. Enter the values by hand.';
        else if (/Failed to send|Failed to fetch|NetworkError/i.test(msg)) msg = 'Could not reach the AI service. Check your connection, or enter the values by hand.';
        throw new Error(msg);
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
  };
}

// V1.15: which newer parts the live database and server already have. The website can be updated before the
// database: anything not switched on yet stays hidden instead of failing (Staff → Users & access lists them).
export type Features = { capture: boolean; draftRoom: boolean; donny: boolean; ai: boolean };
export async function probeFeatures(client: SupabaseClient): Promise<Features> {
  const has = async (table: string) => {
    try {
      const { error, status } = await client.from(table).select('id').limit(1);
      return !error || !(status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(`${(error as { code?: string }).code || ''} ${error.message || ''}`));
    } catch { return false; }
  };
  const ai = async () => {
    try { const { data, error } = await client.functions.invoke('scrim-ai', { body: { action: 'ping' } }); return !error && !!(data as { ai?: boolean })?.ai; } catch { return false; }
  };
  const [capture, draftRoom, donny, aiOn] = await Promise.all([has('scrim_games'), has('draft_books'), has('readiness_store'), ai()]);
  return { capture, draftRoom, donny, ai: aiOn };
}

async function start(client: SupabaseClient, userId: string) {
  shell(`<p>${T('Loading the hub…')}</p>`);
  let me: HubUser;
  try { me = await loadMe(client, userId); } catch { return showLogin(client, T('Could not reach the database. Check your connection and sign in again.')); }
  if (!me.roles.length) {
    shell(`<h2>${T('No access yet')}</h2><p>${T('Signed in as')} <b>${esc(me.email)}</b>. ${T('Your account has no role yet. Ask the admin to grant access, then reload this page.')}</p>
      <div class="toolbar"><button class="btn" type="button" id="noAccessOut">${T('Sign out')}</button></div>`);
    $('#noAccessOut').onclick = () => client.auth.signOut();
    return;
  }
  const { data: people } = await client.from('profiles').select('id, display_name');
  const names = Object.fromEntries(((people || []) as Record<string, string>[]).map((p) => [p.id, p.display_name]));
  const db = createHubDb(client, { canWellbeing: me.canWellbeing, names });
  W.claude = { use: async (n: string) => (n === 'db' ? db : n === 'downloads' ? { save: download } : null) };
  W.__HUB_USER__ = me;
  const features = await probeFeatures(client);
  W.__HUB_PLATFORM__ = { signOut: () => client.auth.signOut(), admin: me.isAdmin ? adminApi(client) : null, download, ai: aiApi(client), features };
  // @ts-ignore -- the hub is plain JavaScript; importing it starts it.
  await import('../hub/app.js');
}

export async function boot() {
  const client: SupabaseClient = __TEST_HOOKS__ && W.__HUB_TEST_CLIENT__ ? W.__HUB_TEST_CLIENT__
    : createClient(__HUB_CONFIG__.url, __HUB_CONFIG__.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('#authLang')) { setLang(lang() === 'id' ? 'en' : 'id'); location.reload(); } });
  const linkType = /type=(recovery|invite)/.exec(location.hash)?.[1];
  let started = false;
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { location.hash = ''; location.reload(); }
    if (event === 'PASSWORD_RECOVERY' && session && !started) { started = true; showSetPassword(client, session.user.id); }
  });
  const { data } = await client.auth.getSession();
  if (started) return;
  if (!data.session) return showLogin(client);
  started = true;
  if (linkType) return showSetPassword(client, data.session.user.id);   // invite or reset link: set a password first
  await start(client, data.session.user.id);
}

boot();
