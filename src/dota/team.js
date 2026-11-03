// Dota 2 team overview: strengths and weaknesses of the national five from their pools,
// plus the recurring patterns across analysed matches. Club data is labelled as club data.

import { finding } from '../core/evidence.js';
import { wilson } from '../core/stats.js';
import { heroPool, inferPosition, flexPicks, banDepth, POS_LABEL } from './proficiency.js';

export function buildPools(players, heroes, asOf) {
  return Object.values(players).map((p) => {
    const pool = heroPool(p, heroes, { asOf });
    const pos = inferPosition(p.games, heroes);
    return { ...pool, pos: pos.pos, posLabel: POS_LABEL[pos.pos], laneShare: pos.laneShare };
  }).sort((a, b) => (a.pos || 9) - (b.pos || 9));
}

export function teamFindings(pools, players, asOf) {
  const F = [];
  const src = ['OpenDota player tournament matches since 7.41 (club games)'];
  const tags = ['club'];
  // Role coverage.
  const posSet = new Set(pools.map((p) => p.pos));
  const missing = [1, 2, 3, 4, 5].filter((k) => !posSet.has(k));
  F.push(finding({ title: missing.length ? `Positions not covered by club history: ${missing.join(', ')}` : 'All five positions covered by a player who plays that role for his club', kind: 'inferred', area: 'roles', lens: 'strategic', severity: missing.length ? -3 : 2, n: pools.reduce((a, p) => a + p.games, 0), sources: src, tags }));
  for (const p of pools) {
    const ready = p.pool.filter((e) => e.tier === 'Established');
    const recent = players[p.player].games.filter((g) => (asOf - g.start) / 86400 <= 45);
    const rw = recent.filter((g) => g.win).length;
    const ci = wilson(rw, recent.length);
    F.push(finding({ title: `${p.player} (${p.posLabel}): ${ready.length} established heroes (club) — ${ready.slice(0, 4).map((e) => e.name).join(', ')}`, kind: 'inferred', area: 'pool', lens: 'strategic', severity: ready.length >= 6 ? 1 : ready.length <= 3 ? -2 : 0, n: p.games, sources: src, tags, data: { player: p.player } }));
    if (recent.length >= 8) {
      const delta = rw / recent.length - p.winRate;
      if (Math.abs(delta) >= 0.12) F.push(finding({ title: `${p.player}: ${rw}/${recent.length} wins in the last 45 days (${delta > 0 ? 'up' : 'down'} from ${(p.winRate * 100).toFixed(0)}% season)`, kind: 'inferred', area: 'form', lens: 'execution', severity: delta > 0 ? 1 : -1, n: recent.length, sources: src, tags: [...tags, 'form'], detail: `95% range ${(ci.lo * 100).toFixed(0)}–${(ci.hi * 100).toFixed(0)}%.` }));
    }
    const lastGame = Math.max(...players[p.player].games.map((g) => g.start));
    const idle = Math.round((asOf - lastGame) / 86400);
    if (idle >= 30) F.push(finding({ title: `${p.player} has no tournament game in ${idle} days`, kind: 'observed', area: 'form', lens: 'risk', severity: -2, n: null, confidence: 'High', sources: src, tags: ['idle'], detail: 'Fact about tournament lobbies only: pubs, ranked and private scrims are not in this data — ask the player.' }));
    // Ban vulnerability: top-3 banned -> what is left.
    const topReady = p.pool.filter((e) => e.tier === 'Established').slice(0, 3).map((e) => e.hero);
    const dep = banDepth(p, topReady);
    if (topReady.length === 3 && dep.left <= 2) F.push(finding({ title: `If his top 3 are banned, ${p.player} has ${dep.left} established hero${dep.left === 1 ? '' : 'es'} left`, kind: 'inferred', area: 'draft', lens: 'risk', severity: -2, n: p.games, sources: src, tags: [...tags, 'ban-vulnerable'], detail: `Lost: ${dep.lost.join(', ')}. Next: ${dep.fallback || 'none'}.`, data: { player: p.player, lost: dep.lost } }));
  }
  // Flex picks.
  const flex = flexPicks(pools).filter((f) => f.players.length >= 2);
  F.push(finding({ title: flex.length ? `${flex.length} flex heroes two of our players can take` : 'No flex heroes across two players', kind: 'inferred', area: 'draft', lens: 'strategic', severity: flex.length >= 3 ? 1 : 0, n: flex.length, sources: src, tags, data: flex }));
  // Shared club games: who has played together.
  const byMatch = {};
  for (const p of Object.values(players)) for (const g of p.games) (byMatch[g.match] ||= []).push(p.ign);
  const pairs = {};
  for (const ids of Object.values(byMatch)) if (ids.length >= 2) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = [ids[i], ids[j]].sort().join(' + '); pairs[k] = (pairs[k] || 0) + 1; }
  const pairList = Object.entries(pairs).sort((a, b) => b[1] - a[1]);
  const max5 = Math.max(0, ...Object.values(byMatch).map((x) => x.length));
  F.push(finding({ title: `Most games shared by two of the five: ${pairList[0] ? `${pairList[0][0]} (${pairList[0][1]})` : 'none'}; never all five together in these tournament games`, kind: 'observed', area: 'synergy', lens: 'risk', severity: max5 < 5 ? -2 : 1, n: pairList[0]?.[1] ?? 0, sources: src, tags,
    detail: `Max tracked players in one match: ${max5}. Note these appearances include games on opposite sides. Team synergy has to be built in pelatnas scrims.`, data: pairList }));
  return F;
}
