// V1.31 scrim results on competitive settings: one row per map (CS2), match (PUBG Mobile, eFootball) or game
// (MLBB, Dota 2), as the title is played in competition. The report's result is computed from the rows.
//
// Settings in use (confirmed with the staff, 18 Nov 2026; IESF has not published WEC rules per title):
// - CS2 Active Duty map pool: Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke (Cache replaced Overpass in
//   July 2026; Anubis replaced Train in January 2026).
// - PUBG Mobile: 10-6-5-4-3-2-1-1 placement points, 0 for 9th to 16th, 1 point per elimination (WEC 2026 per
//   Liquipedia; same as the official PUBG Mobile competition rulebook v1.7.0).
// - eFootball: Authentic mode, Superstar, 10-minute matches, injuries off, extra time and penalties on, 5 substitutions
//   in 3 windows.
// - MLBB: Draft Pick; Dota 2: Captains Mode.
import { MAPS as PUBGM_MAPS } from '../pubgm/screenshot.js';

export const CS2_MAPS = ['Ancient', 'Anubis', 'Cache', 'Dust II', 'Inferno', 'Mirage', 'Nuke'];
export const PUBGM_POINTS = [10, 6, 5, 4, 3, 2, 1, 1];
export const EFOOTBALL_SETTINGS = 'Authentic, Superstar, 10 min, injuries off, extra time and penalties on, 5 subs in 3 windows';
export const ROW_KIND = { CS2: 'cs', 'CS2 Women': 'cs', 'PUBG Mobile': 'br', eFootball: 'foot', MLBB: 'moba', 'MLBB Women': 'moba', 'Dota 2': 'moba' };
export const MOBA_SIDES = { MLBB: ['blue', 'red'], 'MLBB Women': ['blue', 'red'], 'Dota 2': ['radiant', 'dire'] };
export const DRAFT_MODE = { MLBB: 'Draft Pick', 'MLBB Women': 'Draft Pick', 'Dota 2': 'Captains Mode' };
// The one-tap "played as in competition?" question per title (CS2 and PUBG Mobile are covered by the map pool
// and the scoring table).
export const COMP_QUESTION = {
  eFootball: `Played on competitive settings (${EFOOTBALL_SETTINGS})?`,
  MLBB: 'Played in tournament draft (Draft Pick)?', 'MLBB Women': 'Played in tournament draft (Draft Pick)?', 'Dota 2': 'Played in tournament draft (Captains Mode)?',
};
export const rowKind = (title) => ROW_KIND[title] || null;
export const placementPoints = (place) => PUBGM_POINTS[place - 1] ?? 0;

const key = (s) => String(s || '').toLowerCase().replace(/^de_/, '').replace(/[^a-z0-9]/g, '');
const ALIAS = { dust2: 'Dust II', dustii: 'Dust II', dust: 'Dust II' };
// A map name as read or typed → the pool name, or '' when it is not an Active Duty map.
export function snapMap(s) { const k = key(s); if (!k) return ''; return ALIAS[k] || CS2_MAPS.find((m) => key(m) === k) || ''; }

const need = (c, m) => { if (!c) throw new Error(m); };
const blank = (v) => v === '' || v == null;
const whole = (v, label, hi, lo = 0) => { const n = Number(v); need(!blank(v) && Number.isInteger(n) && n >= lo && n <= hi, `${label} must be a whole number from ${lo} to ${hi}.`); return n; };

// Rows as typed → checked rows. Empty rows are dropped; a half-filled row is an error naming the row.
export function cleanRows(title, rows) {
  const kind = rowKind(title); if (!kind || !Array.isArray(rows)) return [];
  const out = [];
  rows.slice(0, 12).forEach((r, i) => {
    const n = i + 1; const x = r || {};
    if (kind === 'cs') {
      if ([x.map, x.us, x.them, x.ct].every(blank)) return;
      const map = snapMap(x.map); need(map, `Map ${n}: pick a map from the Active Duty pool.`);
      const us = whole(x.us, `Map ${n}: rounds won`, 40); const them = whole(x.them, `Map ${n}: rounds lost`, 40);
      const ct = blank(x.ct) ? null : whole(x.ct, `Map ${n}: CT rounds won`, us);
      out.push({ map, us, them, ...(ct != null ? { ct } : {}), ot: us + them > 24 });
    } else if (kind === 'br') {
      if ([x.place, x.kills].every(blank)) return;
      const place = whole(x.place, `Match ${n}: placement`, 16, 1); const kills = whole(x.kills, `Match ${n}: eliminations`, 80);
      const map = PUBGM_MAPS.includes(x.map) ? x.map : '';
      out.push({ ...(map ? { map } : {}), place, kills, pts: placementPoints(place) + kills });
    } else if (kind === 'foot') {
      if ([x.us, x.them].every(blank)) return;
      const us = whole(x.us, `Match ${n}: goals for`, 30); const them = whole(x.them, `Match ${n}: goals against`, 30);
      const extra = ['et', 'pk'].includes(x.extra) ? x.extra : '';
      const row = { us, them, ...(extra ? { extra } : {}) };
      if (extra === 'pk') {
        need(us === them, `Match ${n}: penalties only after a draw.`);
        row.penUs = whole(x.penUs, `Match ${n}: penalties scored`, 30); row.penThem = whole(x.penThem, `Match ${n}: penalties conceded`, 30);
        need(row.penUs !== row.penThem, `Match ${n}: a shoot-out has a winner.`);
      }
      out.push(row);
    } else {
      if ([x.side, x.res].every(blank)) return;
      need(['win', 'loss'].includes(x.res), `Game ${n}: pick win or loss.`);
      out.push({ ...(MOBA_SIDES[title]?.includes(x.side) ? { side: x.side } : {}), res: x.res });
    }
  });
  return out;
}

export function rowResult(title, r) {
  const kind = rowKind(title);
  if (kind === 'moba') return r.res;
  if (kind === 'br') return r.place === 1 ? 'win' : 'loss';
  if (kind === 'foot' && r.extra === 'pk') return r.penUs > r.penThem ? 'win' : 'loss';
  return r.us > r.them ? 'win' : r.us < r.them ? 'loss' : 'draw';
}
// Checked rows → the report's result fields (strings, as the form holds them).
export function rowsFields(title, rows) {
  if (!rows.length) return null;
  if (rowKind(title) === 'br') {
    const played = rows.length; const points = rows.reduce((a, r) => a + r.pts, 0);
    const avg = Math.round((rows.reduce((a, r) => a + r.place, 0) / played) * 10) / 10;
    return { played: String(played), points: String(points), avg: String(avg), chicken: String(rows.filter((r) => r.place === 1).length) };
  }
  const res = rows.map((r) => rowResult(title, r));
  return { won: String(res.filter((x) => x === 'win').length), lost: String(res.filter((x) => x === 'loss').length), drawn: res.includes('draw') ? String(res.filter((x) => x === 'draw').length) : '' };
}
export function rowLine(title, r) {
  const kind = rowKind(title);
  if (kind === 'cs') return `${r.map} ${r.us}-${r.them}${r.ct != null ? ` (CT ${r.ct})` : ''}${r.ot ? ' OT' : ''}`;
  if (kind === 'br') return `#${r.place} · ${r.kills} elim · ${r.pts} pts${r.map ? ` · ${r.map}` : ''}`;
  if (kind === 'foot') return `${r.us}-${r.them}${r.extra === 'et' ? ' (ET)' : r.extra === 'pk' ? ` (pen ${r.penUs}-${r.penThem})` : ''}`;
  return `${r.res}${r.side ? ` (${r.side})` : ''}`;
}
// eFootball ties are best of 3: matches in order, a tie ends when one side has 2 wins or after 3 matches
// (level after 3 = drawn tie). Fewer than 2 matches, or a last tie not finished, is not counted.
export function tiesOf(title, rows) {
  if (title !== 'eFootball' || rows.length < 2) return null;
  const t = { won: 0, lost: 0, drawn: 0, open: 0 }; let w = 0; let l = 0; let n = 0;
  for (const r of rows) {
    const res = rowResult(title, r); n++; if (res === 'win') w++; else if (res === 'loss') l++;
    if (w === 2 || l === 2 || n === 3) { if (w > l) t.won++; else if (l > w) t.lost++; else t.drawn++; w = 0; l = 0; n = 0; }
  }
  if (n) t.open = 1;
  return t.won + t.lost + t.drawn ? t : null;
}
export const tiesText = (t) => `Ties (best of 3): ${t.won} won, ${t.lost} lost${t.drawn ? `, ${t.drawn} drawn` : ''}${t.open ? ' (last tie unfinished)' : ''}`;
export const rowsText = (title, rows) => (rows || []).map((r) => rowLine(title, r)).join('; ');

// CS2 map pool over a period: per map played, won-lost, rounds, last played; maps not played for `idleDays`.
export function mapPool(reports, title, { from, to, asOf, idleDays = 14 }) {
  const rows = reports.filter((r) => r.title === title).flatMap((r) => (r.rows || []).map((x) => ({ ...x, date: r.date })));
  const idleFrom = shiftIso(asOf, -(idleDays - 1));
  return CS2_MAPS.map((map) => {
    const all = rows.filter((x) => x.map === map); const inP = all.filter((x) => x.date >= from && x.date <= to);
    const last = all.map((x) => x.date).sort().at(-1) || null;
    return { map, played: inP.length, won: inP.filter((x) => x.us > x.them).length, lost: inP.filter((x) => x.us < x.them).length,
      roundsFor: inP.reduce((a, x) => a + x.us, 0), roundsAgainst: inP.reduce((a, x) => a + x.them, 0), last, idle: !last || last < idleFrom };
  });
}
function shiftIso(day, n) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
