// PUBG Mobile battle-royale intelligence: tournament analytics, drop/rotation, fights.
// Works from logged match rows (one per team per match) and annotated fight rows.
// Spatial analysis uses only what staff annotated (named drop spots, zone-entry tags):
// no coordinates or routes are inferred.

import { finding } from '../core/evidence.js';
import { mean, sd, wilson, round } from '../core/stats.js';

export function teamSummary(rows, team, sc) {
  const mine = rows.filter((r) => r.team === team);
  const pts = mine.map((r) => sc.total(r));
  const place = mine.map((r) => sc.placementPts(r.placement));
  const el = mine.map((r) => sc.elimPts(r.elims));
  const byMatch = {};
  for (const r of rows) (byMatch[r.match_id] ||= []).push(sc.total(r));
  const rel = mine.map((r) => sc.total(r) - mean(byMatch[r.match_id]));
  return {
    team, matches: mine.length, total: pts.reduce((a, b) => a + b, 0),
    ppm: mean(pts), placePPM: mean(place), elimPPM: mean(el), avgPlace: mean(mine.map((r) => r.placement)),
    avgSurvival: mean(mine.map((r) => r.survival_s)), sdPts: sd(pts), wwcd: mine.filter((r) => r.placement === 1).length,
    top8: mine.filter((r) => r.placement <= 8).length, relLobby: mean(rel),
    elimSplit: { early: sum(mine, 'elims_early'), mid: sum(mine, 'elims_mid'), late: sum(mine, 'elims_late') },
  };
}
const sum = (a, k) => a.reduce((s, r) => s + (+r[k] || 0), 0);

export function standings(rows, sc) {
  const teams = [...new Set(rows.map((r) => r.team))];
  return teams.map((t) => teamSummary(rows, t, sc)).sort((a, b) => b.total - a.total);
}

export function perfFindings(rows, team, sc) {
  const F = [];
  const mine = rows.filter((r) => r.team === team);
  if (!mine.length) return F;
  const src = ['Hub match log (staff-entered)'];
  const S = teamSummary(rows, team, sc);
  const all = standings(rows, sc);
  const rank = all.findIndex((x) => x.team === team) + 1;
  const n = mine.length;
  F.push(finding({ title: `${S.total} pts over ${n} matches (rank ${rank}/${all.length}): ${round(S.placePPM, 1)} placement + ${round(S.elimPPM, 1)} elimination per match`, kind: 'inferred', area: 'points', lens: 'strategic', severity: rank <= 3 ? 2 : rank > all.length / 2 ? -2 : 0, n, sources: src, tags: ['scoring-profile'] }));
  // Points mix vs lobby top-3.
  const top3 = all.slice(0, 3).filter((x) => x.team !== team);
  if (top3.length) {
    const tp = mean(top3.map((x) => x.placePPM)), te = mean(top3.map((x) => x.elimPPM));
    if (S.placePPM < tp - 1) F.push(finding({ title: `Placement points ${round(S.placePPM, 1)}/match vs ${round(tp, 1)} for the top teams`, kind: 'inferred', area: 'placement', lens: 'strategic', severity: -2, n, sources: src, tags: [] }));
    if (S.elimPPM < te - 1) F.push(finding({ title: `Elimination points ${round(S.elimPPM, 1)}/match vs ${round(te, 1)} for the top teams`, kind: 'inferred', area: 'elims', lens: 'strategic', severity: -2, n, sources: src, tags: [] }));
  }
  // Early exits / zone phase deaths.
  const out = mine.filter((r) => r.died_phase > 0);
  const early = mine.filter((r) => r.died_phase > 0 && r.died_phase <= 2).length;
  const p3 = mine.filter((r) => r.died_phase >= 3 && r.died_phase <= 4).length;
  const reached3 = mine.filter((r) => r.died_phase === 0 || r.died_phase >= 3).length;
  if (early / n >= 0.2) F.push(finding({ title: `Out before zone 3 in ${early}/${n} matches`, kind: 'inferred', area: 'survival', lens: 'execution', severity: -2, n, sources: src, tags: ['early-exit'] }));
  if (reached3 && p3 / reached3 >= 0.35) F.push(finding({ title: `Eliminated in zone 3–4 in ${p3} of ${reached3} matches that reached zone 3`, kind: 'inferred', area: 'survival', lens: 'strategic', severity: -2, n: reached3, sources: src, tags: ['zone34'] }));
  // Consistency.
  const cv = S.sdPts / S.ppm;
  F.push(finding({ title: `Consistency: ${S.top8}/${n} top-8 finishes, points SD ${round(S.sdPts, 1)}`, kind: 'inferred', area: 'consistency', lens: 'strategic', severity: cv > 1 ? -1 : cv < 0.6 && S.relLobby > 0 ? 1 : 0, n, sources: src, tags: [], detail: `${round(S.relLobby, 1)} pts/match vs the lobby average.` }));
  // Maps.
  const maps = [...new Set(mine.map((r) => r.map))];
  const byMap = maps.map((m) => { const rr = mine.filter((r) => r.map === m); return { map: m, n: rr.length, ppm: mean(rr.map((r) => sc.total(r))) }; }).sort((a, b) => a.ppm - b.ppm);
  if (byMap.length >= 2 && byMap[0].n >= 3 && byMap[byMap.length - 1].ppm - byMap[0].ppm >= 4) F.push(finding({ title: `Weakest map: ${byMap[0].map} (${round(byMap[0].ppm, 1)} pts/match over ${byMap[0].n}) vs ${byMap[byMap.length - 1].map} (${round(byMap[byMap.length - 1].ppm, 1)})`, kind: 'inferred', area: 'maps', lens: 'strategic', severity: -1, n: byMap[0].n, sources: src, tags: ['map'], data: byMap }));
  // Lobby strength.
  const strong = mine.filter((r) => r.lobby_strength >= 4), weak = mine.filter((r) => r.lobby_strength <= 2);
  if (strong.length >= 3 && weak.length >= 3) {
    const a = mean(strong.map((r) => sc.total(r))), b = mean(weak.map((r) => sc.total(r)));
    if (b - a >= 4) F.push(finding({ title: `${round(a, 1)} pts/match in strong lobbies vs ${round(b, 1)} in weak ones`, kind: 'inferred', area: 'lobby', lens: 'risk', severity: -1, n: strong.length, sources: src, tags: ['lobby'] }));
  }
  // Elimination timing.
  const es = S.elimSplit, et = es.early + es.mid + es.late;
  if (et) F.push(finding({ title: `Eliminations by phase: ${es.early} early, ${es.mid} mid, ${es.late} late`, kind: 'observed', area: 'elims', lens: 'execution', severity: es.late / et < 0.25 && S.elimPPM < 4 ? -1 : 0, n, sources: src, tags: [] }));
  return F;
}

export function dropFindings(rows, team, sc) {
  const F = [];
  const mine = rows.filter((r) => r.team === team);
  const src = ['Hub match log: drop spot and zone tags annotated by staff'];
  const spots = {};
  for (const r of mine) (spots[`${r.map} · ${r.drop_spot}`] ||= []).push(r);
  const table = Object.entries(spots).map(([k, rr]) => ({
    spot: k, n: rr.length, contested: rr.filter((r) => r.drop_contested === 1).length,
    earlyOut: rr.filter((r) => r.died_phase > 0 && r.died_phase <= 1).length,
    vehicle: rr.filter((r) => r.vehicle_by_3min === 1).length, ppm: mean(rr.map((r) => sc.total(r))),
  })).sort((a, b) => b.n - a.n);
  for (const s of table) {
    if (s.n >= 3 && s.contested / s.n >= 0.5) {
      const ci = wilson(s.earlyOut, s.n);
      F.push(finding({ title: `${s.spot}: contested in ${s.contested}/${s.n} drops, out in zone 1 ${s.earlyOut} times`, kind: 'inferred', area: 'drop', lens: 'risk', severity: s.earlyOut / s.n >= 0.3 ? -2 : -1, n: s.n, sources: src, tags: ['drop'], detail: `Avg ${round(s.ppm, 1)} pts/match from this drop. Zone-1 exit rate 95% range ${round(ci.lo * 100)}–${round(ci.hi * 100)}%.`, data: s }));
    }
    if (s.n >= 3 && s.vehicle / s.n < 0.5) F.push(finding({ title: `${s.spot}: vehicle secured by 3:00 in only ${s.vehicle}/${s.n} matches`, kind: 'observed', area: 'rotation', lens: 'execution', severity: -1, n: s.n, sources: src, tags: ['vehicle'] }));
  }
  // Zone entry timing.
  const late = mine.filter((r) => r.zone_entry === 'late' || r.zone_entry === 'forced');
  const lateOut = late.filter((r) => r.died_phase > 0 && r.died_phase <= 4).length;
  if (late.length >= 3) F.push(finding({ title: `Late/forced zone entries in ${late.length}/${mine.length} matches; ${lateOut} of those ended by zone 4`, kind: 'inferred', area: 'rotation', lens: 'strategic', severity: lateOut / late.length >= 0.5 ? -2 : -1, n: late.length, sources: src, tags: ['zone-entry'] }));
  const edge = mine.filter((r) => r.position === 'edge'), center = mine.filter((r) => r.position === 'center');
  if (edge.length >= 3 && center.length >= 3) {
    const a = mean(edge.map((r) => sc.total(r))), b = mean(center.map((r) => sc.total(r)));
    F.push(finding({ title: `Edge play ${round(a, 1)} pts/match (${edge.length}) vs centre ${round(b, 1)} (${center.length})`, kind: 'inferred', area: 'rotation', lens: 'strategic', severity: 0, n: Math.min(edge.length, center.length), sources: src, tags: ['edge-center'], detail: 'Correlation only: teams go centre when the circle favours them.' }));
  }
  return { findings: F, table };
}

// Engagement classification from annotated fights.
export function classifyFight(f) {
  const won = f.finishes_for > 0 && f.team_deaths === 0 || f.knocks_for - f.knocks_against >= 2 && f.team_deaths <= 1;
  const lost = f.team_deaths >= 2 || f.knocks_against - f.knocks_for >= 2;
  if (f.zone_forced === 1) return lost ? 'necessary-lost' : 'necessary';
  if (won) return 'favourable';
  if (lost && (f.initiator === 'us' || f.third_party === 1)) return 'avoidable';
  if (lost) return 'unfavourable';
  return 'even';
}

export function fightFindings(fights, team) {
  const mine = fights.filter((f) => f.team === team);
  const F = [];
  if (!mine.length) return { findings: F, rows: [] };
  const src = ['Hub fight log (staff-annotated from VOD)'];
  const rows = mine.map((f) => ({ ...f, cls: classifyFight(f) }));
  const cnt = (c) => rows.filter((r) => r.cls === c).length;
  const knocks = mine.reduce((a, f) => a + f.knocks_for, 0), fin = mine.reduce((a, f) => a + f.finishes_for, 0);
  const conv = knocks ? fin / knocks : NaN;
  F.push(finding({ title: `${rows.length} fights: ${cnt('favourable')} favourable, ${cnt('unfavourable')} unfavourable, ${cnt('avoidable')} avoidable, ${cnt('necessary') + cnt('necessary-lost')} zone-forced`, kind: 'inferred', area: 'fights', lens: 'execution', severity: cnt('avoidable') >= 3 ? -2 : 0, n: rows.length, sources: src, tags: ['fight-class'] }));
  if (knocks >= 10) F.push(finding({ title: `Knock → finish conversion ${round(conv * 100)}% (${fin}/${knocks})`, kind: 'inferred', area: 'fights', lens: 'execution', severity: conv < 0.6 ? -2 : conv > 0.8 ? 1 : 0, n: knocks, sources: src, tags: ['conversion'] }));
  const tp = rows.filter((r) => r.third_party === 1);
  if (tp.length >= 3) F.push(finding({ title: `Third-partied in ${tp.length} fights; ${tp.filter((r) => r.team_deaths >= 2).length} cost 2+ players`, kind: 'inferred', area: 'fights', lens: 'risk', severity: -2, n: tp.length, sources: src, tags: ['third-party'] }));
  const initLost = rows.filter((r) => r.initiator === 'us' && r.cls === 'avoidable');
  if (initLost.length >= 2) F.push(finding({ title: `${initLost.length} fights we started ended with 2+ of us down`, kind: 'inferred', area: 'fights', lens: 'execution', severity: -2, n: rows.filter((r) => r.initiator === 'us').length, sources: src, tags: ['fight-selection'] }));
  return { findings: F, rows };
}
