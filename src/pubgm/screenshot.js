// V1.20 PUBG Mobile results from screenshots: what the AI read from an end-of-match screen becomes a
// proposal the coach checks, then rows of the existing match log (one per team per match, MATCH_COLUMNS),
// so the PUBG Mobile analysis, Trends and the scrim report's points fill without pasting a CSV.
// The AI's answer is never trusted: every value is range-checked and flagged for the coach.
import { validateMatches } from './scoring.js';

export const MAPS = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'Rondo', 'Karakin', 'Nusa'];
const num = (v, lo, hi) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : Math.round(n); };
const mapOf = (s) => MAPS.find((m) => m.toLowerCase() === String(s || '').trim().toLowerCase()) || '';

// raw: scrim_spec.brResultSchema. Returns { kind, map, placement, kills, survivalS, players, lobby, issues }.
export function proposeBr(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const issues = [];
  if (r.readable === false || !['team_result', 'lobby_standings'].includes(r.screen_kind)) issues.push({ level: 'block', text: 'This does not look like a PUBG Mobile result screen. Upload the screen shown at the end of the match.' });
  const players = (Array.isArray(r.players) ? r.players : []).slice(0, 4).map((p) => ({
    name: String(p?.name_seen || '').slice(0, 40), kills: num(p?.kills, 0, 40), damage: num(p?.damage, 0, 10000), survivalS: num(p?.survived_seconds, 0, 3000), unsure: !!p?.uncertain,
  }));
  const lobby = (Array.isArray(r.lobby) ? r.lobby : []).slice(0, 25).map((t) => ({ rank: num(t?.rank, 1, 25), team: String(t?.team_name || '').slice(0, 40), kills: num(t?.kills, 0, 80), points: num(t?.points, 0, 200) }))
    .filter((t) => t.rank && t.team);
  const summed = players.length && players.every((p) => p.kills != null) ? players.reduce((a, p) => a + p.kills, 0) : null;
  const placement = num(r.placement, 1, 25);
  const kills = num(r.team_kills, 0, 80) ?? summed;
  const map = mapOf(r.map);
  if (r.screen_kind === 'team_result') {
    if (placement == null) issues.push({ level: 'check', text: 'Placement not read: type it in.' });
    if (kills == null) issues.push({ level: 'check', text: 'Team kills not read: type them in.' });
    if (players.some((p) => p.unsure)) issues.push({ level: 'check', text: 'The AI was unsure about some player values (marked).' });
  }
  if (!map) issues.push({ level: 'check', text: 'Map not shown on this screen: pick it.' });
  if (r.notes) issues.push({ level: 'check', text: String(r.notes).slice(0, 200) });
  return { kind: r.screen_kind, map, placement, kills, survivalS: players.length && players.every((p) => p.survivalS != null) ? Math.max(...players.map((p) => p.survivalS)) : null, players, lobby, issues };
}

// The coach's confirmed values → match-log rows. ours: { placement, kills, survivalS }, lobby rows optional.
export function brRows({ matchId, date, session = '', event = 'Scrim', map, team = 'INA', ours, lobby = [] }) {
  if (!map || !MAPS.includes(map)) throw new Error('Pick the map.');
  const p = Number(ours.placement); const k = Number(ours.kills);
  if (!Number.isInteger(p) || p < 1 || p > 16) throw new Error('Placement must be 1 to 16.');
  if (!Number.isInteger(k) || k < 0 || k > 80) throw new Error('Team kills must be a whole number from 0 to 80.');
  const row = (t, placement, elims, survival = '') => ({ match_id: matchId, date, session, event, map, lobby_strength: '', team: t, placement, elims,
    elims_early: '', elims_mid: '', elims_late: '', survival_s: survival, drop_spot: '', drop_contested: '', vehicle_by_3min: '', died_phase: '', zone_entry: '', position: '', strategy: '' });
  const rows = [row(team, p, k, ours.survivalS ?? '')];
  for (const t of lobby) if (t.rank !== p && t.rank <= 16 && t.kills != null) rows.push(row(t.team, t.rank, t.kills));
  const errors = validateMatches(rows);
  if (errors.length) throw new Error(`Check the values: ${errors[0]}.`);
  return rows;
}
