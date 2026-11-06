// In-memory stand-in for the Supabase client, shared by several "devices", for the website UI tests.
// It mirrors the database rules in supabase/migrations (the real rules are tested on Postgres in tests/db/rls.test.js).
const WELL = new Set(['wellbeing_checkins', 'wellbeing_loads']);
const FIXED = { pubgm_logs: 'PUBG Mobile', dota_matches: 'Dota 2', dota_pools: 'Dota 2' };
const DOC_TABLES = ['scrim_sessions', 'scrim_reports', 'coaching_objectives', 'scouting_notes', 'rival_tiers', 'rival_rosters', 'rival_vods', 'opponent_cards',
  'sparring_partners', 'wec_matches', 'player_plans', 'pubgm_logs', 'dota_matches', 'dota_pools', 'wellbeing_checkins', 'wellbeing_loads',
  'scrim_games', 'scrim_captures', 'pattern_findings', 'player_aliases'];

export function backend() {
  const B = { users: [], tables: {}, channels: new Set(), log: [] };
  for (const t of [...DOC_TABLES, 'scrim_report_corrections', 'app_config', 'roster_players', 'profiles', 'user_roles', 'user_titles']) B.tables[t] = [];
  B.addUser = (u) => { B.users.push(u); B.tables.profiles.push({ id: u.id, email: u.email, display_name: u.name, staff_key: u.staffKey || null, created_at: new Date().toISOString() });
    for (const r of u.roles || []) B.tables.user_roles.push({ user_id: u.id, role: r }); for (const t of u.titles || []) B.tables.user_titles.push({ user_id: u.id, title: t }); };
  const roles = (id) => B.tables.user_roles.filter((r) => r.user_id === id).map((r) => r.role);
  const titles = (id) => B.tables.user_titles.filter((r) => r.user_id === id).map((r) => r.title);
  const has = (id, r) => roles(id).includes(r);
  const canRead = (id, t) => has(id, 'admin') || has(id, 'head_coach') || has(id, 'assistant_coach') || (roles(id).length > 0 && (t == null || titles(id).includes(t)));
  const canWrite = (id, t) => has(id, 'admin') || has(id, 'head_coach') || (roles(id).length > 0 && t != null && titles(id).includes(t));
  const canWell = (id) => has(id, 'admin') || has(id, 'readiness_owner');
  const deny = { code: '42501', message: 'new row violates row-level security policy' };
  B.readable = (uid, table, row) => {
    if (!uid) return false;
    if (WELL.has(table)) return canWell(uid);
    if (DOC_TABLES.includes(table)) return canRead(uid, row.title);
    if (table === 'scrim_report_corrections') { const r = B.tables.scrim_reports.find((x) => x.id === row.report_id); return !!r && canRead(uid, r.title); }
    return roles(uid).length > 0 || (table === 'profiles' && row.id === uid);
  };
  B.write = (uid, table, op, row, old) => {
    if (!uid) return deny;
    if (WELL.has(table)) return canWell(uid) ? null : deny;
    if (table === 'scrim_games' && op === 'update') return { code: '42501', message: 'Submitted records cannot be changed. Add a correction instead.' };
    if (table === 'scrim_games' && op === 'insert' && !B.tables.scrim_reports.some((r) => r.id === row.data?.reportId && r.title === row.data?.title)) return { code: '23503', message: 'The scrim report for this game was not found. Save the report first.' };
    if (table === 'scrim_reports' && op === 'update') return { code: '42501', message: 'Submitted records cannot be changed. Add a correction instead.' };
    if (DOC_TABLES.includes(table)) {
      if (row.data?.origin !== 'operational') return { code: '22023', message: 'Only operational records can be stored (origin must be "operational").' };
      if (old && !canWrite(uid, old.title)) return deny;
      return canWrite(uid, row.title) ? null : deny;
    }
    if (table === 'scrim_report_corrections') { const r = B.tables.scrim_reports.find((x) => x.id === row.report_id); return r && canWrite(uid, r.title) ? null : deny; }
    if (table === 'app_config') return has(uid, 'admin') || has(uid, 'head_coach') || (row.key === 'runbooks' && has(uid, 'assistant_coach')) ? null : deny;
    if (table === 'roster_players') return has(uid, 'admin') || has(uid, 'head_coach') || has(uid, 'readiness_owner') ? null : deny;
    if (table === 'user_roles' || table === 'user_titles') return has(uid, 'admin') ? null : deny;
    if (table === 'profiles') return has(uid, 'admin') || row.id === uid ? null : deny;
    return deny;
  };
  B.notify = (table) => { for (const ch of B.channels) for (const h of ch.handlers) if (h.table === table) setTimeout(h.cb, 0); };
  B.client = (sessionUserId) => client(B, sessionUserId);
  return B;
}

function client(B, sessionUserId) {
  let session = sessionUserId ? { user: { id: sessionUserId } } : null;
  const listeners = [];
  const uid = () => session?.user.id || null;
  let tick = 0;
  const stamp = (table, row, old) => {
    const now = new Date(Date.now() + ++tick).toISOString();
    if (DOC_TABLES.includes(table)) return { ...row, title: FIXED[table] || row.data?.title || null, created_by: old ? old.created_by : uid(), created_at: old ? old.created_at : now, updated_by: uid(), updated_at: now };
    if (table === 'scrim_report_corrections') return { ...row, id: B.tables[table].length + 1, created_by: uid(), created_at: now };
    return { ...row, updated_by: uid(), updated_at: now };
  };
  function query(table) {
    let returning = false; const written = [];
    const filters = []; let range = null; let single = false; let action = 'select'; let payload = null; let conflict = 'id';
    const q = {
      select() { if (action !== 'select') returning = true; return q; }, order() { return q; },
      eq(c, v) { filters.push([c, v]); return q; },
      range(a, b) { range = [a, b]; return q; },
      maybeSingle() { single = true; return q; },
      insert(rows) { action = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return q; },
      upsert(row, o) { action = 'upsert'; payload = Array.isArray(row) ? row : [row]; conflict = o?.onConflict || 'id'; return q; },
      update(v) { action = 'update'; payload = v; return q; },
      delete() { action = 'delete'; return q; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    const match = (r) => filters.every(([c, v]) => r[c] === v);
    function run() {
      const T = B.tables[table]; const id = uid();
      if (action === 'select') {
        let rows = T.filter((r) => match(r) && B.readable(id, table, r)).map((r) => structuredClone(r));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return { data: single ? rows[0] || null : rows, error: null };
      }
      if (action === 'insert' || action === 'upsert') {
        for (const row of payload) {
          const old = action === 'upsert' ? T.find((r) => r[conflict] === row[conflict]) : null;
          if (action === 'insert' && row.id != null && T.some((r) => r.id === row.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          const err = B.write(id, table, old ? 'update' : 'insert', { ...row, title: FIXED[table] || row.data?.title || null }, old);
          if (err) return { data: null, error: err };
        }
        for (const row of payload) {
          const i = action === 'upsert' ? T.findIndex((r) => r[conflict] === row[conflict]) : -1;
          const s = stamp(table, structuredClone(row), i >= 0 ? T[i] : null);
          if (i >= 0) T[i] = s; else T.push(s);
          B.log.push({ table, action, by: id, row: s }); written.push(s);
        }
        B.notify(table); return { data: returning ? written.map((x) => structuredClone(x)) : null, error: null };
      }
      if (action === 'update') {
        const rows = T.filter(match);
        for (const r of rows) { const err = B.write(id, table, 'update', { ...r, ...payload }, r); if (err) return { data: null, error: err }; }
        for (const r of rows) { Object.assign(r, payload); if (DOC_TABLES.includes(table) || table === 'app_config') { r.updated_by = id; r.updated_at = new Date(Date.now() + ++tick).toISOString(); } }
        B.notify(table); return { data: returning ? rows.map((x) => structuredClone(x)) : null, error: null };
      }
      if (action === 'delete') {
        const rows = T.filter(match);
        for (const r of rows) { const err = B.write(id, table, 'delete', r, r); if (err) return { data: null, error: err }; }
        B.tables[table] = T.filter((r) => !rows.includes(r)); B.notify(table); return { data: null, error: null };
      }
      return { data: null, error: { message: 'unsupported' } };
    }
    return q;
  }
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async ({ email, password }) => {
        const u = B.users.find((x) => x.email === email && x.password === password);
        if (!u) return { data: { session: null }, error: { message: 'Invalid login credentials' } };
        session = { user: { id: u.id } }; return { data: { session }, error: null };
      },
      signOut: async () => { session = null; listeners.forEach((cb) => cb('SIGNED_OUT', null)); return { error: null }; },
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async ({ password }) => { const u = B.users.find((x) => x.id === uid()); if (u) u.password = password; return { error: null }; },
    },
    from: (t) => query(t),
    // The scrim-ai server function: tests set B.ai = async (body, userId) => ({ data } | { status, error }).
    functions: { invoke: async (name, { body }) => {
      if (name !== 'scrim-ai' || !B.ai) return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 404, json: async () => ({}) } }) };
      const out = await B.ai(structuredClone(body), uid());
      if (out.error) return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: out.status || 400, json: async () => ({ error: out.error }) } }) };
      return { data: out.data, error: null };
    } },
    rpc: async (name, args) => {
      if (name !== 'set_roster') return { error: { message: 'unknown rpc' } };
      const err = B.write(uid(), 'roster_players', 'insert', {}); if (err) return { error: err };
      for (const [title, list] of Object.entries(args.p)) { B.tables.roster_players = B.tables.roster_players.filter((r) => r.title !== title); list.forEach((ign, i) => B.tables.roster_players.push({ title, ign, sort_order: i })); }
      B.notify('roster_players'); return { error: null };
    },
    channel: () => { const ch = { handlers: [], on(_t, f, cb) { ch.handlers.push({ table: f.table, cb }); return ch; }, subscribe() { B.channels.add(ch); return ch; } }; return ch; },
    removeChannel: (ch) => { B.channels.delete(ch); },
  };
}
