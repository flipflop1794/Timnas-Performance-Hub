// Supabase-backed implementation of the small document interface the hub already uses
// (collection(name).doc(id).set / .add / .onSnapshot, doc('config/x').set / .onSnapshot).
// The app keeps its logic; this file maps each collection to its table and turns realtime
// changes into fresh snapshots. Permissions are enforced by the database (RLS), not here.
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export const TABLES: Record<string, string> = {
  scrims: 'scrim_sessions', scrim_reports: 'scrim_reports', cycle: 'coaching_objectives', rivals: 'scouting_notes',
  rival_tiers: 'rival_tiers', rival_rosters: 'rival_rosters', vods: 'rival_vods', opp_cards: 'opponent_cards',
  partners: 'sparring_partners', wec_matches: 'wec_matches', player_plans: 'player_plans', pubgm_logs: 'pubgm_logs',
  dota_matches: 'dota_matches', dota_pools: 'dota_pools', wellbeing_checkins: 'wellbeing_checkins', wellbeing_load: 'wellbeing_loads',
  // V1.13 AI capture
  scrim_games: 'scrim_games', scrim_captures: 'scrim_captures', pattern_findings: 'pattern_findings', player_aliases: 'player_aliases',
};
const WELLBEING = new Set(['wellbeing_checkins', 'wellbeing_load']);
const CONFIG_KEYS = new Set(['runbooks', 'rules']);
const PAGE = 1000;

type Doc = Record<string, unknown>;
type DocSnap = { id: string; exists: boolean; data: () => Doc | undefined };
type QuerySnap = { docs: DocSnap[] };
type Next<T> = (s: T) => void;
type Fail = (e: { code: string; message: string }) => void;

export interface HubDbOptions {
  canWellbeing: boolean;
  names?: Record<string, string>;      // profile id -> display name, for "entered by"
  debounceMs?: number;
}

// Plain-language errors. Database triggers already return readable sentences; RLS refusals do not.
export function friendlyError(e: { code?: string; message?: string } | null | undefined, action = 'save'): Error & { code: string } {
  const msg = e?.message || '';
  let text: string; let code = e?.code || 'unknown';
  if (/row-level security|permission denied|42501/.test(msg) || code === '42501') {
    text = /Only the Head Coach|cannot be changed|Only an admin|At least one admin/.test(msg) ? msg : `You don't have permission to ${action} this record. Ask the Head Coach or admin to assign you to this title.`;
    code = 'permission_denied';
  } else if (/JWT|session|not signed in/i.test(msg) || code === 'PGRST301') { text = 'Your session has ended. Sign in again; what you typed is kept on this device.'; code = 'unauthenticated'; }
  else if (/Failed to fetch|NetworkError|network|timeout/i.test(msg)) { text = 'Not saved: no connection. What you typed is still here; try again.'; code = 'network'; }
  else if (code === '23505') text = 'A record with this id already exists. Reload and try again.';
  else text = msg || `Could not ${action}.`;
  const err = new Error(text) as Error & { code: string }; err.code = code; return err;
}

async function selectAll(client: SupabaseClient, table: string, cols: string, since = '') {
  const out: Doc[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select(cols);
    if (since) q = q.gte('updated_at', since);
    const { data, error } = await q.order('created_at', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data || []) as unknown as Doc[]));
    if (!data || data.length < PAGE) return out;
  }
}

const INCREMENTAL = new Set(['scrim_games', 'scrim_captures', 'pattern_findings']);

export function createHubDb(client: SupabaseClient, opts: HubDbOptions) {
  const names = opts.names || {};
  const wait = opts.debounceMs ?? 250;
  const reportNotes = new Map<string, number>();   // report id -> corrections already stored
  // Last known version (updated_at) of each record this device has loaded: a save based on an older
  // copy is refused instead of silently overwriting a colleague's change.
  const versions = new Map<string, string>();
  const loaded = new Set<string>();                 // tables whose rows have been loaded at least once
  let seq = 0;

  // One subscription per table, shared by every listener on it.
  function watch(tables: string[], reload: (full?: boolean) => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null; let full = false;
    const go = (f: boolean) => { full = full || f; if (timer) clearTimeout(timer); timer = setTimeout(() => { const x = full; full = false; reload(x); }, wait); };
    const kick = () => go(false);
    const ch: RealtimeChannel = client.channel(`hub-${tables.join('-')}-${++seq}`);
    for (const t of tables) ch.on('postgres_changes' as never, { event: '*', schema: 'public', table: t } as never, kick as never);
    ch.subscribe();
    const onFocus = () => go(true);
    if (typeof window !== 'undefined') { window.addEventListener('focus', onFocus); window.addEventListener('online', onFocus); }
    return () => { if (timer) clearTimeout(timer); client.removeChannel(ch); if (typeof window !== 'undefined') { window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); } };
  }

  async function loadReports(): Promise<QuerySnap> {
    const [reps, corr] = await Promise.all([
      selectAll(client, 'scrim_reports', 'id, data, created_by, created_at'),
      selectAll(client, 'scrim_report_corrections', 'report_id, text, by_name, created_by, created_at'),
    ]);
    const byReport = new Map<string, Doc[]>();
    for (const c of corr) { const k = String(c.report_id); if (!byReport.has(k)) byReport.set(k, []); byReport.get(k)!.push(c); }
    reportNotes.clear();
    return {
      docs: reps.map((r) => {
        const notes = (byReport.get(String(r.id)) || []).map((c) => ({ text: c.text, by: c.by_name, at: c.created_at }));
        reportNotes.set(String(r.id), notes.length);
        const data = { ...(r.data as Doc), notes, _entered: { by: names[String(r.created_by)] || '', at: r.created_at } };
        return { id: String(r.id), exists: true, data: () => data };
      }),
    };
  }
  // V1.13: tables that only grow (scrim games, screenshots, findings) are fetched in full once, then only
  // the rows changed since the newest one seen; every live update otherwise re-downloaded every game
  // (~3 KB each, ~1,000 games by WEC) to every open browser. A full reload still runs when the window
  // regains focus, so an admin's delete is picked up.
  const cache = new Map<string, { rows: Map<string, Doc>; newest: string }>();
  async function loadTable(table: string, full = true): Promise<QuerySnap> {
    const c = cache.get(table);
    // 5 s overlap: a save that committed a moment after a later-stamped one is not missed.
    const since = !full && c && c.newest ? new Date(Date.parse(c.newest) - 5000).toISOString() : '';
    const rows = await selectAll(client, table, 'id, data, updated_at', since);
    const keep = !full && c ? c.rows : new Map<string, Doc>();
    let newest = !full && c ? c.newest : '';
    for (const r of rows) { keep.set(String(r.id), r); versions.set(`${table}:${r.id}`, String(r.updated_at)); if (String(r.updated_at) > newest) newest = String(r.updated_at); }
    if (INCREMENTAL.has(table)) cache.set(table, { rows: keep, newest });
    loaded.add(table);
    const all = [...keep.values()].sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
    return { docs: all.map((r) => ({ id: String(r.id), exists: true, data: () => r.data as Doc })) };
  }

  async function writeReport(id: string, data: Doc) {
    const notes = Array.isArray(data.notes) ? (data.notes as Doc[]) : [];
    if (reportNotes.has(id)) {
      // Existing report: only new correction notes are written; the report itself never changes.
      const have = reportNotes.get(id)!;
      const fresh = notes.slice(have);
      if (!fresh.length) throw friendlyError({ message: 'Submitted records cannot be changed. Add a correction instead.' });
      const { error } = await client.from('scrim_report_corrections').insert(fresh.map((n) => ({ report_id: id, text: String(n.text || ''), by_name: String(n.by || '') })));
      if (error) throw friendlyError(error, 'correct');
      reportNotes.set(id, have + fresh.length);
      return;
    }
    const clean = { ...data, notes: [] as unknown[] }; delete (clean as Doc)._entered;
    const { error } = await client.from('scrim_reports').insert({ id, data: clean });
    if (error) throw friendlyError(error);
    reportNotes.set(id, 0);
  }
  async function conflict(table: string, keyCol: string, id: string): Promise<never> {
    const { data } = await client.from(table).select('updated_by, updated_at').eq(keyCol, id).maybeSingle();
    const who = data ? names[String((data as Doc).updated_by)] || 'A colleague' : 'A colleague';
    const at = data ? new Date(String((data as Doc).updated_at)).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '';
    const err = new Error(`Not saved: ${who} changed this record${at ? ` at ${at} WIB` : ''}, after you opened it. The page now shows their version; check it, then make your change again.`) as Error & { code: string };
    err.code = 'conflict'; throw err;
  }
  // Insert a new record, or update one only if it is still the version this device last saw.
  async function versionedWrite(table: string, keyCol: string, id: string, row: Doc) {
    const vkey = `${table}:${id}`; const known = versions.get(vkey);
    if (!loaded.has(table) && !known) {
      // Not loaded on this device (should not happen in the app): keep the plain upsert.
      const { data, error } = await client.from(table).upsert({ [keyCol]: id, ...row }, { onConflict: keyCol }).select('updated_at');
      if (error) throw friendlyError(error);
      if (data?.[0]) versions.set(vkey, String((data[0] as Doc).updated_at));
      return;
    }
    const res = known
      ? await client.from(table).update(row).eq(keyCol, id).eq('updated_at', known).select('updated_at')
      : await client.from(table).insert({ [keyCol]: id, ...row }).select('updated_at');
    if (res.error) { if (res.error.code === '23505') await conflict(table, keyCol, id); throw friendlyError(res.error); }
    if (!res.data?.length) await conflict(table, keyCol, id);
    versions.set(vkey, String((res.data![0] as Doc).updated_at));
  }
  async function writeRow(table: string, id: string, data: Doc) {
    const clean = { ...data }; delete clean._entered;
    await versionedWrite(table, 'id', id, { data: clean });
  }

  // ---- config documents: config/runbooks, config/rules (app_config) and config/roster (roster_players)
  function configDoc(key: string) {
    if (key === 'roster') {
      return {
        async set(d: Doc) { const { error } = await client.rpc('set_roster', { p: (d.roster || {}) as Doc }); if (error) throw friendlyError(error); },
        onSnapshot(next: Next<DocSnap>, fail?: Fail) {
          const load = async () => {
            try {
              const { data, error } = await client.from('roster_players').select('title, ign, sort_order').order('sort_order', { ascending: true });
              if (error) throw error;
              const roster: Record<string, string[]> = {};
              for (const r of (data || []) as Doc[]) (roster[String(r.title)] ||= []).push(String(r.ign));
              next({ id: 'roster', exists: !!data?.length, data: () => (data?.length ? { roster } : undefined) });
            } catch (e) { fail?.(friendlyError(e as Doc, 'read')); }
          };
          load(); return watch(['roster_players'], load);
        },
      };
    }
    if (!CONFIG_KEYS.has(key)) throw new Error(`Unknown config document: ${key}`);
    return {
      async set(d: Doc) { await versionedWrite('app_config', 'key', key, { data: d }); },
      onSnapshot(next: Next<DocSnap>, fail?: Fail) {
        const load = async () => {
          try {
            const { data, error } = await client.from('app_config').select('data, updated_at').eq('key', key).maybeSingle();
            if (error) throw error;
            loaded.add('app_config');
            if (data) versions.set(`app_config:${key}`, String((data as Doc).updated_at));
            next({ id: key, exists: !!data, data: () => (data ? (data as Doc).data as Doc : undefined) });
          } catch (e) { fail?.(friendlyError(e as Doc, 'read')); }
        };
        load(); return watch(['app_config'], load);
      },
    };
  }

  function collection(name: string) {
    if (name === 'config') return { doc: (id: string) => configDoc(id) };
    const table = TABLES[name];
    if (!table) throw new Error(`Unknown collection: ${name}`);
    const denied = WELLBEING.has(name) && !opts.canWellbeing;
    const load = name === 'scrim_reports' ? loadReports : (full = true) => loadTable(table, full);
    const set = (id: string, d: Doc) => (denied ? Promise.reject(friendlyError({ code: '42501', message: 'permission denied' })) : name === 'scrim_reports' ? writeReport(id, d) : writeRow(table, id, d));
    return {
      doc: (id: string) => ({ set: (d: Doc) => set(id, d) }),
      add: async (d: Doc) => { const id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`); await set(id, d); return { id }; },
      onSnapshot(next: Next<QuerySnap>, fail?: Fail) {
        // Wellbeing is refused up front for people without access (the database would also return nothing).
        if (denied) { setTimeout(() => fail?.({ code: 'permission_denied', message: 'Wellbeing records are limited to the readiness owner and admins.' }), 0); return () => {}; }
        const run = async (full = true) => { try { next(await load(full)); } catch (e) { fail?.(friendlyError(e as Doc, 'read')); } };
        run();
        return watch(name === 'scrim_reports' ? ['scrim_reports', 'scrim_report_corrections'] : [table], run);
      },
    };
  }
  return {
    collection,
    doc(path: string) { const [c, id] = path.split('/'); if (c !== 'config' || !id) throw new Error(`Unsupported document path: ${path}`); return configDoc(id); },
  };
}
