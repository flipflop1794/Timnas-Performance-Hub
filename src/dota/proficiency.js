// Player hero proficiency for Dota 2.
// Deliberately NOT a public hero win rate: it measures how much and how recently THIS player
// has played a hero in tournament games, with the win rate shrunk hard toward the player's
// own average (small samples say little about hero strength).

import { recencyWeight, shrink, wilson } from '../core/stats.js';

export const POS_LABEL = { 1: 'Pos 1 Carry', 2: 'Pos 2 Mid', 3: 'Pos 3 Offlane', 4: 'Pos 4 Soft support', 5: 'Pos 5 Hard support' };

// Infer a player's position from lane use and hero roles.
export function inferPosition(games, heroes) {
  const lanes = {};
  let support = 0, n = 0;
  for (const g of games) {
    lanes[g.lane] = (lanes[g.lane] || 0) + 1;
    const h = heroes[g.hero];
    if (h) { n++; if (h.roles[0] === 'Sup' || (h.roles.includes('Sup') && !h.roles.includes('Car'))) support++; }
  }
  const lane = +Object.entries(lanes).sort((a, b) => b[1] - a[1])[0]?.[0];
  const supShare = n ? support / n : 0;
  let pos;
  if (lane === 2) pos = 2;
  else if (lane === 1) pos = supShare > 0.5 ? 5 : 1;
  else if (lane === 3) pos = supShare > 0.5 ? 4 : 3;
  else pos = null;
  return { pos, lane, laneShare: lane ? lanes[lane] / games.length : 0, supportShare: supShare };
}

export function heroPool(player, heroes, { asOf, halfLife = 60, prior = 8 } = {}) {
  const now = asOf ?? Math.max(...player.games.map((g) => g.start));
  const tot = player.games.length, totW = player.games.filter((g) => g.win).length;
  const base = tot ? totW / tot : 0.5;
  const by = {};
  for (const g of player.games) {
    const e = by[g.hero] || (by[g.hero] = { hero: g.hero, games: 0, wins: 0, wGames: 0, last: 0, k: 0, d: 0, a: 0, lanes: {} });
    e.games++; if (g.win) e.wins++;
    e.wGames += recencyWeight((now - g.start) / 86400, halfLife);
    e.last = Math.max(e.last, g.start);
    e.k += g.k; e.d += g.d; e.a += g.a;
    e.lanes[g.lane] = (e.lanes[g.lane] || 0) + 1;
  }
  const pool = Object.values(by).map((e) => {
    const sw = shrink(e.wins, e.games, base, prior);
    const ci = wilson(e.wins, e.games);
    const daysSince = (now - e.last) / 86400;
    const tier = e.games >= 6 && daysSince <= 120 ? 'Established' : e.games >= 3 ? 'Some' : 'Few';
    return {
      ...e, name: heroes[e.hero]?.name || `#${e.hero}`, shrunkWR: sw, ci,
      daysSince: Math.round(daysSince), stale: daysSince > 45,
      kda: (e.k + e.a) / Math.max(1, e.d),
      comfort: Math.log1p(e.wGames) * (0.5 + sw),
      tier,
    };
  }).sort((a, b) => b.comfort - a.comfort);
  return { player: player.ign, account: player.account, games: tot, winRate: base, pool };
}

export function comfortOf(poolObj, heroId) {
  const e = poolObj.pool.find((x) => x.hero === heroId);
  return e ? e.comfort : 0;
}

// Heroes at least two of our players can field (>=2 games each), or one player in 2+ lanes.
export function flexPicks(pools) {
  const map = {};
  for (const p of pools) for (const e of p.pool) if (e.games >= 2) (map[e.hero] ||= []).push({ player: p.player, games: e.games, lanes: Object.keys(e.lanes).map(Number) });
  const out = [];
  for (const [hero, who] of Object.entries(map)) {
    const lanes = new Set(who.flatMap((w) => w.lanes));
    if (who.length >= 2 || lanes.size >= 2) out.push({ hero: +hero, players: who, lanes: [...lanes] });
  }
  return out.sort((a, b) => b.players.length - a.players.length || b.lanes.length - a.lanes.length);
}

// How deep is a player's pool once given heroes are banned?
export function banDepth(poolObj, banned) {
  const set = new Set(banned);
  const ready = poolObj.pool.filter((e) => e.tier === 'Established');
  const left = ready.filter((e) => !set.has(e.hero));
  return { ready: ready.length, left: left.length, lost: ready.filter((e) => set.has(e.hero)).map((e) => e.name), fallback: left[0]?.name || null };
}
