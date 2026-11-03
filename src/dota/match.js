// Dota 2 post-match analysis from a reduced OpenDota match record (see data.js).
// Every finding carries its kind (observed / inferred / hypothesis) and a timestamp when the
// replay-derived data supports one. Nothing here invents positions or events.

import { finding } from '../core/evidence.js';
import { mmss } from '../core/stats.js';

const isRad = (slot) => slot < 128;

export function detectSide(match, ourAccounts) {
  const set = new Set(ourAccounts.map(Number));
  let r = 0, d = 0;
  for (const p of match.pl) if (set.has(p.acc)) (isRad(p.slot) ? r++ : d++);
  if (!r && !d) return { side: null, count: 0 };
  return { side: r >= d ? 'radiant' : 'dire', count: Math.max(r, d), split: r > 0 && d > 0 };
}

// Position inside one match: lane pair split by farm (more last hits at 10 = core).
function positions(team) {
  const out = new Map();
  const farm = (p) => (p.lh10 ?? 0) * 1000 + (p.gpm ?? 0);
  for (const [lane, core, sup] of [[1, 1, 5], [3, 3, 4]]) {
    const pair = team.filter((p) => p.lane === lane).sort((a, b) => farm(b) - farm(a));
    if (pair[0]) out.set(pair[0], core);
    for (const p of pair.slice(1)) out.set(p, sup);
  }
  for (const p of team) if (p.lane === 2) out.set(p, 2);
  return out;
}

export function analyseMatch(match, ourAccounts, heroes, { teamName = 'Us' } = {}) {
  const sideInfo = detectSide(match, ourAccounts);
  if (!sideInfo.side) throw new Error('None of our players are in this match.');
  const rad = sideInfo.side === 'radiant';
  const sign = rad ? 1 : -1;
  const won = rad === match.rw;
  const ours = match.pl.filter((p) => isRad(p.slot) === rad);
  const theirs = match.pl.filter((p) => isRad(p.slot) !== rad);
  const oppName = rad ? match.dteam : match.rteam;
  const ourSet = new Set(ourAccounts.map(Number));
  const src = [`OpenDota match ${match.id}`];
  const F = [];
  const tags = ['single-match'];
  if (sideInfo.count < 5) tags.push('club');

  F.push(finding({ title: `${won ? 'Won' : 'Lost'} vs ${oppName || 'opponent'} in ${mmss(match.dur)}`, kind: 'observed', area: 'result', lens: 'strategic', severity: 0, n: 1, sources: src, tags,
    detail: `${sideInfo.count}/5 of our tracked players on the ${sideInfo.side} side.${match.parsed ? '' : ' Match is NOT replay-parsed: timelines and fights unavailable.'}` }));

  // Laning: gold at 10 vs the same-position opponent.
  const posO = positions(ours), posT = positions(theirs);
  const posOf = (p) => posO.get(p) ?? posT.get(p) ?? null;
  const pos = (m) => { const o = {}; for (const [p, k] of m) if (!o[k]) o[k] = p; return o; };
  const po = pos(posO), pt = pos(posT);
  for (const k of [1, 2, 3, 4, 5]) {
    const a = po[k], b = pt[k];
    if (!a || !b || a.g10 == null || b.g10 == null) continue;
    const diff = a.g10 - b.g10;
    const thr = k <= 3 ? 800 : 400;
    const sev = diff <= -thr ? -2 : diff >= thr ? 2 : 0;
    if (!sev || !ourSet.has(a.acc)) continue;
    const who = a.name;
    F.push(finding({ title: `Pos ${k} ${who} ${diff > 0 ? 'won' : 'lost'} the 10-minute gold race by ${Math.abs(diff)}`, kind: 'observed', area: 'laning', lens: 'execution', severity: sev, n: 1, at: 600, sources: src, tags: [...tags, 'lane-matchup'],
      detail: `${heroes[a.h]?.name} ${a.g10} gold, ${a.lh10 ?? '?'} LH vs ${heroes[b.h]?.name} ${b.g10} gold, ${b.lh10 ?? '?'} LH.`, data: { player: a.name, pos: k } }));
  }

  // Gold advantage timeline.
  if (match.gadv && match.gadv.length > 3) {
    const g = match.gadv.map((v) => v * sign);
    const at10 = g[10] ?? g[g.length - 1];
    F.push(finding({ title: `Net worth ${at10 >= 0 ? 'lead' : 'deficit'} of ${Math.abs(at10)} at 10:00`, kind: 'observed', area: 'laning', lens: 'strategic', severity: at10 <= -2000 ? -2 : at10 >= 2000 ? 2 : 0, n: 1, at: 600, sources: src, tags }));
    let worst = { d: 0 }, best = { d: 0 };
    for (let i = 3; i < g.length; i++) {
      const d = g[i] - g[i - 3];
      if (d < worst.d) worst = { d, from: i - 3, to: i };
      if (d > best.d) best = { d, from: i - 3, to: i };
    }
    if (worst.d <= -2500) F.push(finding({ title: `Biggest swing against us: ${worst.d} gold between ${worst.from}:00 and ${worst.to}:00`, kind: 'observed', area: 'midgame', lens: 'strategic', severity: -2, n: 1, at: worst.from * 60, sources: src, tags, data: worst }));
    const maxLead = Math.max(...g), maxIdx = g.indexOf(maxLead);
    if (!won && maxLead >= 5000) F.push(finding({ title: `Lost after leading by ${maxLead} at ${maxIdx}:00`, kind: 'observed', area: 'lategame', lens: 'strategic', severity: -3, n: 1, at: maxIdx * 60, sources: src, tags: [...tags, 'lead-conversion'] }));
    const minLead = Math.min(...g), minIdx = g.indexOf(minLead);
    if (won && minLead <= -4000) F.push(finding({ title: `Came back from ${Math.abs(minLead)} behind at ${minIdx}:00`, kind: 'observed', area: 'lategame', lens: 'strategic', severity: 2, n: 1, at: minIdx * 60, sources: src, tags }));
  }

  // Objectives: towers, Roshan, conversion.
  const ourBuildingPrefix = rad ? 'npc_dota_goodguys' : 'npc_dota_badguys';
  const buildings = match.obj.filter((o) => o[1] === 'building_kill');
  const lost = buildings.filter((o) => o[2].startsWith(ourBuildingPrefix));
  const taken = buildings.filter((o) => !o[2].startsWith(ourBuildingPrefix));
  const roshTeamOurs = rad ? 2 : 3;
  const roshes = match.obj.filter((o) => o[1] === 'CHAT_MESSAGE_ROSHAN_KILL').map((o) => ({ t: o[0], ours: +o[3] === roshTeamOurs }));
  const ourR = roshes.filter((r) => r.ours), theirR = roshes.filter((r) => !r.ours);
  if (roshes.length) {
    F.push(finding({ title: `Roshan: ${ourR.length} for us, ${theirR.length} for them`, kind: 'observed', area: 'objectives', lens: 'strategic', severity: ourR.length > theirR.length ? 1 : ourR.length < theirR.length ? -2 : 0, n: 1, at: roshes[0].t, sources: src, tags,
      detail: roshes.map((r) => `${mmss(r.t)} ${r.ours ? 'us' : 'them'}`).join(', ') }));
  }
  const conv = (rs, list) => rs.map((r) => ({ t: r.t, next: list.find((b) => b[0] > r.t && b[0] <= r.t + 180) }));
  const ourConv = conv(ourR, taken), theirConv = conv(theirR, lost);
  if (ourR.length) {
    const ok = ourConv.filter((c) => c.next).length;
    F.push(finding({ title: `Aegis converted to a building within 3 min in ${ok}/${ourR.length} of our Roshans`, kind: 'observed', area: 'objectives', lens: 'strategic', severity: ok < ourR.length ? -1 : 1, n: ourR.length, at: ourR[0].t, sources: src, tags: [...tags, 'post-objective'] }));
  }
  if (theirR.length) {
    const hit = theirConv.filter((c) => c.next).length;
    if (hit) F.push(finding({ title: `Lost a building within 3 min of ${hit}/${theirR.length} enemy Roshans`, kind: 'observed', area: 'objectives', lens: 'risk', severity: -2, n: theirR.length, at: theirConv.find((c) => c.next).next[0], sources: src, tags: [...tags, 'post-objective'],
      detail: theirConv.filter((c) => c.next).map((c) => `Rosh ${mmss(c.t)} → ${c.next[2].replace(/npc_dota_(good|bad)guys_/, '')} ${mmss(c.next[0])}`).join('; ') }));
  }
  const t1 = (list) => list.find((b) => /tower1/.test(b[2]));
  const ft = t1(lost), tt = t1(taken);
  if (ft && (!tt || ft[0] < tt[0])) F.push(finding({ title: `First tower lost at ${mmss(ft[0])}${tt ? `, first taken at ${mmss(tt[0])}` : ''}`, kind: 'observed', area: 'laning', lens: 'strategic', severity: -1, n: 1, at: ft[0], sources: src, tags }));
  const hg = lost.filter((b) => /tower3|rax|melee|range/.test(b[2]));
  if (hg.length) F.push(finding({ title: `High ground breached: ${hg.length} tier-3/barracks lost, first at ${mmss(hg[0][0])}`, kind: 'observed', area: 'lategame', lens: 'strategic', severity: -2, n: 1, at: hg[0][0], sources: src, tags }));

  // Teamfights.
  if (match.tf && match.tf.length) {
    const ri = rad ? 0 : 1, oi = rad ? 1 : 0;
    const res = match.tf.map((t) => ({ t: t[0], ours: t[3][ri], theirs: t[3][oi], res: t[3][ri] < t[3][oi] ? 'won' : t[3][ri] > t[3][oi] ? 'lost' : 'even' }));
    const w = res.filter((r) => r.res === 'won').length, l = res.filter((r) => r.res === 'lost').length;
    F.push(finding({ title: `Teamfights: ${w} won, ${l} lost, ${res.length - w - l} even (by deaths)`, kind: 'inferred', area: 'fights', lens: 'execution', severity: w > l ? 1 : w < l ? -2 : 0, n: res.length, at: res[0].t, sources: src, tags,
      detail: res.map((r) => `${mmss(r.t)} ${r.res} ${r.ours}-${r.theirs}`).join(' · '), data: res }));
    const bad = res.filter((r) => r.ours - r.theirs >= 3);
    for (const b of bad) F.push(finding({ title: `Fight at ${mmss(b.t)} lost ${b.ours}-${b.theirs}`, kind: 'observed', area: 'fights', lens: 'execution', severity: -2, n: 1, at: b.t, sources: src, tags }));
  }

  // Vision and smokes (support work).
  const sumF = (arr, k) => arr.reduce((a, p) => a + (p[k] || 0), 0);
  const oObs = sumF(ours, 'obs'), tObs = sumF(theirs, 'obs');
  if (ours.some((p) => p.obs != null)) {
    const perMin = (x) => x / (match.dur / 60);
    F.push(finding({ title: `Observer wards ${oObs} vs ${tObs}; sentries ${sumF(ours, 'sen')} vs ${sumF(theirs, 'sen')}`, kind: 'observed', area: 'vision', lens: 'execution', severity: oObs < tObs * 0.75 ? -1 : oObs > tObs * 1.25 ? 1 : 0, n: 1, sources: src, tags, detail: `${perMin(oObs).toFixed(2)} vs ${perMin(tObs).toFixed(2)} observers per minute.` }));
  }
  const oS = sumF(ours, 'smoke'), tS = sumF(theirs, 'smoke');
  if (ours.some((p) => p.smoke != null) && (oS || tS)) F.push(finding({ title: `Smokes used ${oS} vs ${tS}`, kind: 'observed', area: 'map', lens: 'strategic', severity: oS < tS - 3 ? -1 : 0, n: 1, sources: src, tags }));

  // Buybacks: timestamps, and whether a building fell to us within 60s (hypothesis-level link).
  for (const p of ours.filter((x) => ourSet.has(x.acc))) for (const t of p.bb || []) {
    const after = taken.find((b) => b[0] >= t && b[0] <= t + 60);
    const lostAfter = lost.find((b) => b[0] >= t && b[0] <= t + 60);
    F.push(finding({ title: `${p.name} bought back at ${mmss(t)}`, kind: after || lostAfter ? 'hypothesis' : 'observed', area: 'lategame', lens: 'execution', severity: lostAfter && !after ? -1 : 0, n: 1, at: t, sources: src, tags,
      detail: after ? 'A building was taken within 60 s: buyback may have enabled a push.' : lostAfter ? 'We still lost a building within 60 s: buyback did not save the structure.' : '' }));
  }

  // Item timings vs the same-position opponent (core items).
  const CORE = ['black_king_bar', 'blink', 'aghanims_shard', 'ultimate_scepter'];
  for (const k of [1, 2, 3]) {
    const a = po[k], b = pt[k]; if (!a || !b || !ourSet.has(a.acc)) continue;
    for (const it of CORE) {
      const ta = a.items.find((x) => x[1] === it)?.[0], tb = b.items.find((x) => x[1] === it)?.[0];
      if (ta && tb && ta - tb >= 240) F.push(finding({ title: `Pos ${k} ${a.name}: ${it.replace(/_/g, ' ')} at ${mmss(ta)}, ${Math.round((ta - tb) / 60)} min after the opposing pos ${k}`, kind: 'observed', area: 'items', lens: 'execution', severity: -1, n: 1, at: ta, sources: src, tags: [...tags, 'item-timing'] }));
    }
  }

  // Deaths concentration (who fed).
  const deaths = ours.filter((p) => ourSet.has(p.acc)).map((p) => ({ name: p.name, d: p.d, pos: posOf(p) })).sort((a, b) => b.d - a.d);
  if (deaths[0] && deaths[0].d >= 12) F.push(finding({ title: `${deaths[0].name} (pos ${deaths[0].pos}) died ${deaths[0].d} times`, kind: 'observed', area: 'fights', lens: 'execution', severity: -1, n: 1, sources: src, tags: [...tags, 'deaths'],
    detail: deaths[0].pos >= 4 ? 'High deaths on a support can be sacrificial positioning by design; review the VOD before treating it as an error.' : 'Check the VOD for the first death of each lost fight.' }));

  return { matchId: match.id, side: sideInfo.side, won, opponent: oppName, ourTeam: rad ? match.rteam : match.dteam, league: match.league, duration: match.dur, findings: F, tracked: sideInfo.count };
}
