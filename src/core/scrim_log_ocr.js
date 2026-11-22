// Adapter between Scrim Log's local result scanner and the Hub's MLBB game record.
// The scanner never receives or saves the screenshot in Supabase.
import { parseDuration } from './capture.js';

const key = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const statFields = { kills: 'kills', deaths: 'deaths', assists: 'assists', gold: 'gold', damage: 'hero_damage', damageTaken: 'damage_taken' };

export function scannerGame(proposal, id = 'pending') {
  const ours = proposal.players.filter((p) => p.side === proposal.ourSide);
  return {
    id,
    duration: proposal.durationS == null ? '' : `${Math.floor(proposal.durationS / 60)}:${String(proposal.durationS % 60).padStart(2, '0')}`,
    ourPicks: ours.map((p) => ({ hero: p.hero, player: p.player, playerId: p.player, ir: p.stats?.rating ?? '' })),
  };
}

export function applyLocalScan(proposal, scan) {
  const next = structuredClone(proposal);
  const ours = next.players.filter((p) => p.side === next.ourSide);
  if (ours.length !== 5) throw new Error('Set five players on our team before scanning.');
  if (!Array.isArray(scan.rows) || scan.rows.length !== 5) throw new Error('Review all five player rows before applying the scan.');
  const seen = new Set();
  for (const row of scan.rows || []) {
    const index = Number(row.pickIndex);
    const player = ours[index];
    if (!Number.isInteger(index) || index < 0 || index >= 5 || seen.has(index) || !player) throw new Error('Scanner row does not match this game. Scan again.');
    seen.add(index);
    if (key(row.hero) !== key(player.hero) || key(row.player) !== key(player.player)) throw new Error('The draft changed while scanning. Scan this game again.');
    for (const [from, to] of Object.entries(statFields)) {
      const value = row.values?.[from];
      if (value !== '' && value != null) player.stats[to] = Number(value);
    }
    if (row.ir !== '' && row.ir != null) player.stats.rating = Number(row.ir);
  }
  if (scan.duration) next.durationS = parseDuration(scan.duration);
  if (scan.result) next.result = scan.result.toLowerCase() === 'win' ? 'win' : 'loss';
  if (scan.mvp) {
    next.players.forEach((p) => { p.mvp = p.side === next.ourSide && key(p.player) === key(scan.mvp); });
  }
  if (scan.teamKills != null) next.teamKills = Number(scan.teamKills);
  if (scan.opponentTeamKills != null) next.opponentTeamKills = Number(scan.opponentTeamKills);
  next.scanReview = scan.scanReview || null;
  return next;
}

export function sameReviewedResult(a, b) {
  const number = (value) => value === '' || value == null ? null : Number(value);
  const summary = (game) => JSON.stringify({
    result: game.result, durationS: number(game.durationS), teamKills: number(game.teamKills), opponentTeamKills: number(game.opponentTeamKills),
    players: game.players.filter((p) => p.side === game.ourSide).map((p) => [key(p.hero), key(p.player), !!p.mvp,
      ...['kills', 'deaths', 'assists', 'gold', 'hero_damage', 'damage_taken', 'rating'].map((field) => number(p.stats?.[field]))]),
  });
  return summary(a) === summary(b);
}
