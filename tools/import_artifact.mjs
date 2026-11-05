// Turn an export of the Claude-artifact database into SQL for the Supabase SQL Editor.
//
//   node tools/import_artifact.mjs export.json <admin-user-uuid> > import.sql
//
// export.json: { "<collection>": [ { "id": "<doc id>", "data": { ...document fields } }, ... ], ... }
// (the shape Claude's artifact-database reader returns; collections as named in the app, e.g. scrim_reports).
// Every row is attributed to <admin-user-uuid> as importer (the original "written by" text stays in the record),
// keeps its original date where the record has one, and report notes become correction rows.
// Re-running is safe: existing ids are skipped.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export const TABLES = {
  scrims: 'scrim_sessions', scrim_reports: 'scrim_reports', cycle: 'coaching_objectives', rivals: 'scouting_notes',
  rival_tiers: 'rival_tiers', rival_rosters: 'rival_rosters', vods: 'rival_vods', opp_cards: 'opponent_cards',
  partners: 'sparring_partners', wec_matches: 'wec_matches', player_plans: 'player_plans', pubgm_logs: 'pubgm_logs',
  dota_matches: 'dota_matches', dota_pools: 'dota_pools', wellbeing_checkins: 'wellbeing_checkins', wellbeing_load: 'wellbeing_loads',
};

export function toSql(exp, adminId) {
  if (!/^[0-9a-f-]{36}$/i.test(adminId || '')) throw new Error('Give the admin user id (uuid) from Supabase → Authentication → Users.');
  const tag = `j${randomBytes(6).toString('hex')}`;
  const lit = (v) => `$${tag}$${typeof v === 'string' ? v : JSON.stringify(v)}$${tag}$`;
  const when = (d) => { const t = d.createdAt || d.at || (d.date && `${d.date}T12:00:00+07:00`); return t && !Number.isNaN(Date.parse(t)) ? `${lit(new Date(t).toISOString())}::timestamptz` : 'now()'; };
  const out = ['-- Timnas Performance Hub: import from the Claude artifact database', 'begin;'];
  const counts = {};
  for (const [col, docs] of Object.entries(exp)) {
    if (col === 'config') {
      for (const { id, data } of docs) {
        if (id === 'runbooks' || id === 'rules') out.push(`insert into public.app_config (key, data, updated_by) values (${lit(id)}, ${lit(data)}::jsonb, ${lit(adminId)}::uuid) on conflict (key) do nothing;`);
        if (id === 'roster') for (const [title, list] of Object.entries(data.roster || {})) list.forEach((ign, i) => out.push(`insert into public.roster_players (title, ign, sort_order, updated_by) values (${lit(title)}, ${lit(ign)}, ${i}, ${lit(adminId)}::uuid) on conflict do nothing;`));
      }
      continue;
    }
    const table = TABLES[col]; if (!table) throw new Error(`Unknown collection in export: ${col}`);
    for (const { id, data } of docs) {
      if (data?.origin !== 'operational') continue;           // demo / synthetic records are not imported
      const clean = col === 'scrim_reports' ? { ...data, notes: [] } : data;
      out.push(`insert into public.${table} (id, data, created_by, created_at) values (${lit(String(id))}, ${lit(clean)}::jsonb, ${lit(adminId)}::uuid, ${when(data)}) on conflict (id) do nothing;`);
      if (col === 'scrim_reports') for (const n of data.notes || []) out.push(`insert into public.scrim_report_corrections (report_id, text, by_name, created_by, created_at) select ${lit(String(id))}, ${lit(n.text)}, ${lit(n.by || 'unknown')}, ${lit(adminId)}::uuid, ${when({ at: n.at })} where not exists (select 1 from public.scrim_report_corrections where report_id = ${lit(String(id))} and text = ${lit(n.text)});`);
      counts[table] = (counts[table] || 0) + 1;
    }
  }
  out.push('commit;', `-- rows: ${JSON.stringify(counts)}`);
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, admin] = process.argv.slice(2);
  if (!file) { console.error('usage: node tools/import_artifact.mjs export.json <admin-user-uuid> > import.sql'); process.exit(1); }
  process.stdout.write(`${toSql(JSON.parse(readFileSync(file, 'utf8')), admin)}\n`);
}
