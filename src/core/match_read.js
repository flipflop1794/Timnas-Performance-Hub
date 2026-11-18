// V1.30 screenshot reading for the titles without the MOBA capture: eFootball (match stats) and CS2 / CS2 Women
// (scoreboard). The AI reads one screen (scrim-ai action "match_result"); the hub never trusts the answer: every
// value is range-checked, our side is matched from the roster (CS2) or picked by the coach, and the coach confirms
// before anything is kept. A confirmed screen becomes one game of the scrim report (stored with scrim_games when
// the report is saved), so the report's result fills itself and Trends can follow players over time.
import { readGameOf, FOOTBALL_STATS, CS_STATS } from '../../supabase/functions/_shared/scrim_spec.js';
import { matchPlayer } from './capture.js';
import { snapMap } from './comp_rows.js';

export { readGameOf };
export const FOOTBALL_LABEL = { possession: 'Possession %', shots: 'Shots', shots_on_target: 'Shots on target', passes: 'Passes', successful_passes: 'Successful passes',
  tackles: 'Tackles', interceptions: 'Interceptions', fouls: 'Fouls', offsides: 'Offsides', corners: 'Corners', free_kicks: 'Free kicks', saves: 'Saves' };
export const CS_LABEL = { kills: 'K', deaths: 'D', assists: 'A', adr: 'ADR', hs_pct: 'HS%', mvps: 'MVP', score: 'Score' };
const RANGE = { kills: [0, 80], deaths: [0, 80], assists: [0, 60], adr: [0, 400], hs_pct: [0, 100], mvps: [0, 40], score: [0, 400] };
const FOOT_RANGE = { possession: [0, 100], passes: [0, 1500], successful_passes: [0, 1500] };
const num = (v, lo, hi, dec = false) => { const n = Number(v); if (v == null || v === '' || !Number.isFinite(n) || n < 0) return null; if (n < lo || n > hi) return undefined; return dec ? Math.round(n * 10) / 10 : Math.round(n); };
const clip = (s, n = 40) => String(s ?? '').trim().slice(0, n);

// raw → what the check card shows. ourSide: 'home' | 'away' (eFootball) or 'a' | 'b' (CS2), '' when not known.
export function proposeMatch({ title, raw, roster = [], aliases = {} }) {
  const game = readGameOf(title);
  if (!game) throw new Error(`Screenshot reading is not set up for ${title}.`);
  const r = raw && typeof raw === 'object' ? raw : {};
  const issues = []; const check = (text) => issues.push({ level: 'check', text });
  if (game === 'efootball') {
    if (r.readable === false || !['match_stats', 'final_score'].includes(r.screen_kind)) issues.push({ level: 'block', text: 'This does not look like an eFootball result screen. Upload the match stats screen shown after the match.' });
    const goals = { home: num(r.home_goals, 0, 30), away: num(r.away_goals, 0, 30) };
    if (goals.home == null || goals.away == null || goals.home === undefined || goals.away === undefined) check('Score not read: type it in.');
    const pen = { home: num(r.penalties?.home, 0, 30), away: num(r.penalties?.away, 0, 30) };
    const stats = {}; let odd = false;
    for (const k of FOOTBALL_STATS) {
      const [lo, hi] = FOOT_RANGE[k] || [0, 200];
      const h = num(r.stats?.[k]?.home, lo, hi); const a = num(r.stats?.[k]?.away, lo, hi);
      if (h === undefined || a === undefined) odd = true;
      stats[k] = { home: h ?? null, away: a ?? null };
    }
    if (stats.possession.home != null && stats.possession.away != null && stats.possession.home + stats.possession.away !== 100) check('Possession does not add up to 100%: check it.');
    if (odd) check('Some statistics look out of range and were left empty: check them.');
    const names = { home: clip(r.home_name), away: clip(r.away_name) };
    const ourSide = /indonesia|\bina\b|timnas/i.test(names.home) ? 'home' : /indonesia|\bina\b|timnas/i.test(names.away) ? 'away' : '';
    if (!ourSide) check('Which side is ours? Pick it.');
    if (r.notes) check(clip(r.notes, 200));
    return { title, game, kind: r.screen_kind, names, goals: { home: goals.home ?? null, away: goals.away ?? null }, penalties: pen.home != null && pen.away != null ? pen : null, stats, ourSide, players: [], issues };
  }
  // CS2
  if (r.readable === false || r.screen_kind !== 'scoreboard') issues.push({ level: 'block', text: 'This does not look like a CS2 scoreboard. Upload the scoreboard shown at the end of the map.' });
  const players = (Array.isArray(r.players) ? r.players : []).slice(0, 10).map((p) => {
    const stats = {}; let unsure = !!p?.uncertain;
    for (const k of CS_STATS) { const [lo, hi] = RANGE[k]; const v = num(p?.[k], lo, hi, k === 'adr' || k === 'hs_pct'); if (v === undefined) unsure = true; stats[k] = v ?? null; }
    const nameSeen = clip(p?.name_seen);
    return { side: ['a', 'b'].includes(p?.team) ? p.team : '', nameSeen, player: matchPlayer(nameSeen, roster, aliases), stats, unsure };
  });
  const mine = { a: players.filter((p) => p.side === 'a' && p.player).length, b: players.filter((p) => p.side === 'b' && p.player).length };
  const ourSide = mine.a > mine.b ? 'a' : mine.b > mine.a ? 'b' : '';
  const rounds = { a: num(r.rounds_a, 0, 40) ?? null, b: num(r.rounds_b, 0, 40) ?? null };
  if (rounds.a == null || rounds.b == null) check('Rounds not read: type them in.');
  if (!ourSide) check('Which team is ours? None of the names matched the roster: pick it.');
  if (players.some((p) => p.unsure)) check('The AI was unsure about some player values (marked).');
  // V1.31: the map is snapped to the Active Duty pool; a map outside the pool is flagged.
  const map = snapMap(r.map);
  if (!map) check(r.map ? `"${clip(r.map, 30)}" is not in the Active Duty map pool: pick the map.` : 'Map not shown on this screen: pick it.');
  if (r.notes) check(clip(r.notes, 200));
  return { title, game, kind: r.screen_kind, map, names: { a: clip(r.team_a_name), b: clip(r.team_b_name) }, rounds, ourSide, players, issues };
}

// The coach's checked values → one game of the report. edited: { ourSide, ours, theirs, penOurs?, penTheirs?, map? }
export function confirmMatch(p, edited, { gameNo = 1, captureIds = [] } = {}) {
  const side = edited.ourSide;
  const sides = p.game === 'efootball' ? ['home', 'away'] : ['a', 'b'];
  if (!sides.includes(side)) throw new Error(p.game === 'efootball' ? 'Pick which side is ours.' : 'Pick which team is ours.');
  const other = sides.find((s) => s !== side);
  const whole = (v, label, hi) => { const n = Number(v); if (v === '' || v == null || !Number.isInteger(n) || n < 0 || n > hi) throw new Error(`${label} must be a whole number from 0 to ${hi}.`); return n; };
  const hi = p.game === 'efootball' ? 30 : 40; const unit = p.game === 'efootball' ? 'Goals' : 'Rounds';
  const ours = whole(edited.ours, `${unit} (us)`, hi); const theirs = whole(edited.theirs, `${unit} (them)`, hi);
  let result = ours > theirs ? 'win' : ours < theirs ? 'loss' : 'draw';
  let penalties = null;
  if (p.game === 'efootball' && edited.penOurs !== '' && edited.penOurs != null && edited.penTheirs !== '' && edited.penTheirs != null) {
    penalties = { ours: whole(edited.penOurs, 'Penalties (us)', 30), theirs: whole(edited.penTheirs, 'Penalties (them)', 30) };
    if (result === 'draw' && penalties.ours !== penalties.theirs) result = penalties.ours > penalties.theirs ? 'win' : 'loss';
  }
  const base = { title: p.title, game: p.game, kind: 'match_result', gameNo, captureIds, score: { ours, theirs }, result, origin: 'operational' };
  if (p.game === 'efootball') {
    const stats = Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, { ours: v[side], theirs: v[other] }]));
    return { ...base, penalties, stats, teamNames: { ours: p.names[side], theirs: p.names[other] }, players: [] };
  }
  const map = snapMap(edited.map ?? p.map); if (!map) throw new Error('Pick the map (Active Duty pool).');
  return { ...base, map, teamNames: { ours: p.names[side], theirs: p.names[other] },
    players: p.players.map((x) => ({ team: x.side === side ? 'ours' : x.side === other ? 'partner' : 'unknown', player: x.side === side ? x.player : '', nameSeen: x.nameSeen, stats: x.stats })) };
}

// Confirmed games → the report's won / lost / drawn (one per map or match).
export function matchResult(games) {
  return { won: games.filter((g) => g.result === 'win').length, lost: games.filter((g) => g.result === 'loss').length, drawn: games.filter((g) => g.result === 'draw').length };
}
export const matchLine = (g) => (g.game === 'efootball'
  ? `${g.score.ours}-${g.score.theirs}${g.penalties ? ` (pen ${g.penalties.ours}-${g.penalties.theirs})` : ''}${g.stats?.possession?.ours != null ? ` · possession ${g.stats.possession.ours}%` : ''}${g.stats?.shots_on_target?.ours != null ? ` · on target ${g.stats.shots_on_target.ours}-${g.stats.shots_on_target.theirs ?? '?'}` : ''}`
  : `${g.map ? `${g.map} ` : ''}${g.score.ours}-${g.score.theirs}`);
