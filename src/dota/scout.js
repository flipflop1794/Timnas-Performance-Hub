// Opponent intelligence for Dota 2: pool-based scouting report.
// National teams rarely have team-level draft history together, so the report starts from
// each registered player's own tournament pool and is explicit about what it cannot see.

import { finding } from '../core/evidence.js';
import { shrink } from '../core/stats.js';
import { POS_LABEL } from './proficiency.js';

// Convert the compact aggregate format (opp_*.json) into pool objects compatible with draft.js.
export function poolsFromAggregate(agg, heroes) {
  return Object.entries(agg.players).map(([ign, p]) => {
    const base = p.n ? p.w / p.n : 0.5;
    const pool = p.heroes.map(([hero, g, w]) => {
      const sw = shrink(w, g, base, 8);
      return { hero, name: heroes[hero]?.name || `#${hero}`, games: g, wins: w, shrunkWR: sw, comfort: Math.log1p(g * 0.6) * (0.5 + sw), tier: g >= 6 ? 'Established' : g >= 3 ? 'Some' : 'Few', daysSince: null, lanes: {} };
    }).sort((a, b) => b.comfort - a.comfort);
    const lane = +Object.entries(p.lanes).sort((a, b) => b[1] - a[1])[0][0];
    return { player: ign, games: p.n, winRate: base, pool, lane, avgDur: p.avgdur };
  });
}

function guessPos(lane, pool, heroes) {
  const sup = pool.slice(0, 5).filter((e) => heroes[e.hero]?.roles[0] === 'Sup' || (heroes[e.hero]?.roles.includes('Sup') && !heroes[e.hero]?.roles.includes('Car'))).length;
  if (lane === 2) return 2;
  if (lane === 1) return sup >= 3 ? 5 : 1;
  if (lane === 3) return sup >= 3 ? 4 : 3;
  return null;
}

export function scoutingReport(agg, heroes, ourPools = []) {
  const pools = poolsFromAggregate(agg, heroes);
  const src = [agg._source];
  const F = [];
  const players = pools.map((p) => {
    const pos = guessPos(p.lane, p.pool, heroes);
    const top = [...p.pool].sort((a, b) => b.games - a.games)[0];
    const share = p.games ? top.games / p.games : 0;
    const depth = p.pool.filter((e) => e.games >= 5).length;
    return { ...p, pos, posLabel: POS_LABEL[pos] || 'Unknown', topHero: top, topShare: share, depth };
  });
  const missing = agg.roster.filter((r) => !r.account);
  for (const m of missing) F.push(finding({ title: `${m.ign} has no matched tournament account`, kind: 'observed', area: 'coverage', lens: 'risk', severity: -1, n: 0, confidence: 'Blocked', sources: src, tags: ['coverage'], detail: m.match_status }));
  for (const r of agg.roster.filter((x) => /ambiguous/i.test(x.match_status || ''))) F.push(finding({ title: `${r.ign}: account match is ambiguous`, kind: 'observed', area: 'coverage', lens: 'risk', severity: -1, n: null, confidence: 'Low', sources: src, tags: ['coverage'], detail: r.match_status }));

  for (const p of players) {
    const top3 = p.pool.slice(0, 3).map((e) => `${e.name} (${e.games}g, ${e.wins}w)`).join(', ');
    F.push(finding({ title: `${p.player} — ${p.posLabel}: ${top3}`, kind: 'inferred', area: 'pool', lens: 'strategic', severity: 0, n: p.games, sources: src, tags: ['club', 'pool'],
      detail: `${p.games} tournament games since 7.41, ${(p.winRate * 100).toFixed(0)}% won. ${p.depth} heroes with 5+ games.` }));
    if (p.games >= 15 && p.topShare >= 0.15) F.push(finding({ title: `${p.player} leans on ${p.topHero.name}: ${(p.topShare * 100).toFixed(0)}% of his games`, kind: 'inferred', area: 'ban', lens: 'risk', severity: -2, n: p.games, sources: src, tags: ['club', 'ban-target'], data: { hero: p.topHero.hero, player: p.player } }));
    if (p.games < 20) F.push(finding({ title: `${p.player}: thin sample (${p.games} games) — pool may be wider than shown`, kind: 'observed', area: 'coverage', lens: 'risk', severity: -1, n: p.games, sources: src, tags: ['coverage'] }));
  }

  // Ban plan: each player's most-played hero (presence, not win rate: small-sample win rates
  // are mostly noise - the Draft Lab S18 lesson), ordered by games.
  const banPlan = players.filter((p) => p.games >= 15).map((p) => {
    const top = [...p.pool].sort((a, b) => b.games - a.games)[0];
    return { hero: top.hero, name: top.name, player: p.player, games: top.games, wins: top.wins, share: top.games / p.games };
  }).sort((a, b) => b.games - a.games);
  // Contested heroes: in their top pools and ours.
  const contested = [];
  for (const op of players) for (const e of op.pool.slice(0, 6).filter((x) => x.games >= 4)) for (const us of ourPools) {
    const m = us.pool.find((x) => x.hero === e.hero && x.games >= 4);
    if (m) contested.push({ hero: e.hero, name: e.name, them: `${op.player} ${e.games}g`, us: `${us.player} ${m.games}g` });
  }
  if (contested.length) F.push(finding({ title: `${contested.length} heroes sit in both our and their comfort pools`, kind: 'inferred', area: 'draft', lens: 'strategic', severity: -1, n: contested.length, sources: src, tags: ['club', 'contested'],
    detail: contested.map((c) => `${c.name} (${c.us} / ${c.them})`).join('; '), data: contested }));
  // Tempo: average game length.
  const durs = players.filter((p) => p.games >= 15).map((p) => p.avgDur);
  if (durs.length) {
    const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
    F.push(finding({ title: `Their players' club games average ${Math.round(avg / 60)} min`, kind: 'inferred', area: 'tempo', lens: 'strategic', severity: 0, n: durs.length, sources: src, tags: ['club'], detail: 'Club tempo, not national-team tempo.' }));
  }
  const blocked = [
    'Team draft order preferences (first-phase bans, first pick) — no national-team draft data.',
    'Objective timing patterns (Roshan, towers) — needs their national-team or qualifier replays.',
    'Adaptation between games in a series — needs series data for this five.',
  ];
  return { nation: agg.nation, code: agg.code, coach: agg.coach, players, banPlan, contested, findings: F, blocked, notes: agg.notes };
}
