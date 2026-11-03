// Dota 2 draft intelligence. Rebuilt for Dota; nothing here reuses MLBB weights.
// A draft is scored on four separable terms so the coach can see WHY one draft beats another:
//   execution  - how comfortable OUR assigned player is on each hero (proficiency, not public WR)
//   structure  - composition requirements (initiation, disables, waveclear/push, carry, damage mix)
//   denial     - opponent players' comfort heroes we took or banned
//   matchup    - hero-vs-hero / pair data, ONLY when a matchup table is supplied (else 0 + flagged)

import { comfortOf } from './proficiency.js';

// Captains Mode order observed in two 7.41 tournament matches (OpenDota picks_bans order 0-23).
// 'A' = team with the first action. IESF WEC draft rules are not published: verify before use.
export const CM_ORDER = [
  ['ban', 'A'], ['ban', 'A'], ['ban', 'B'], ['ban', 'B'], ['ban', 'A'], ['ban', 'B'], ['ban', 'B'],
  ['pick', 'A'], ['pick', 'B'],
  ['ban', 'A'], ['ban', 'A'], ['ban', 'B'],
  ['pick', 'B'], ['pick', 'A'], ['pick', 'A'], ['pick', 'B'], ['pick', 'B'], ['pick', 'A'],
  ['ban', 'A'], ['ban', 'B'], ['ban', 'A'], ['ban', 'B'],
  ['pick', 'A'], ['pick', 'B'],
];
export const CM_ORDER_STATUS = 'Observed in 2 tournament matches on patch 7.41 (OpenDota picks_bans). IESF WEC 2026 draft rules: not yet published.';

// Check an observed picks_bans array follows CM_ORDER. Returns {ok, firstTeam, mismatches}.
export function checkOrder(picks) {
  const sorted = [...picks].sort((a, b) => a[3] - b[3]);
  if (sorted.length !== CM_ORDER.length) return { ok: false, mismatches: [`expected ${CM_ORDER.length} actions, got ${sorted.length}`] };
  const first = sorted[0][2];
  const mism = [];
  sorted.forEach(([isPick, , team], i) => {
    const [kind, side] = CM_ORDER[i];
    const expTeam = side === 'A' ? first : 1 - first;
    if ((kind === 'pick') !== (isPick === 1) || team !== expTeam) mism.push(`step ${i}`);
  });
  return { ok: !mism.length, firstTeam: first, mismatches: mism };
}

const has = (h, r) => h.roles.includes(r);

export function composition(heroIds, heroes) {
  const hs = heroIds.map((id) => heroes[id]).filter(Boolean);
  const c = (r) => hs.filter((h) => has(h, r)).length;
  return {
    initiators: c('Ini'), disablers: c('Dis'), durable: c('Dur'), pushers: c('Pus'), nukers: c('Nuk'),
    carries: hs.filter((h) => h.roles[0] === 'Car').length, escape: c('Esc'), supports: c('Sup'),
    melee: hs.filter((h) => h.attack === 'M').length, ranged: hs.filter((h) => h.attack === 'R').length,
  };
}

export function structureChecks(comp, n) {
  // Thresholds scale with how many heroes are locked (partial drafts are judged on what is possible).
  const issues = [];
  const done = n >= 5;
  if (done && comp.initiators === 0) issues.push({ sev: -2, text: 'No initiator: fights start on the opponent\'s terms.' });
  if (done && comp.disablers < 2) issues.push({ sev: -2, text: `Only ${comp.disablers} reliable disabler(s): weak pick-off and save potential.` });
  if (done && comp.carries === 0) issues.push({ sev: -2, text: 'No primary carry: late-game damage depends on mid/off.' });
  if (comp.carries >= 3) issues.push({ sev: -1, text: `${comp.carries} carry-first heroes: farm will be split thin.` });
  if (done && comp.pushers === 0 && comp.nukers < 2) issues.push({ sev: -1, text: 'Little waveclear or push: hard to take high ground or defend it.' });
  if (done && comp.durable === 0) issues.push({ sev: -1, text: 'No durable frontliner: the backline takes the first hit.' });
  if (comp.melee >= 4) issues.push({ sev: -1, text: `${comp.melee} melee heroes: vulnerable to kiting and high-ground defence.` });
  return issues;
}

// Best assignment of heroes to players (max total comfort), brute force over permutations.
export function assign(heroIds, pools) {
  const players = pools.map((p) => p);
  let best = { total: -1, map: [] };
  const used = new Array(players.length).fill(false);
  const cur = [];
  (function rec(i, tot) {
    if (i === heroIds.length) { if (tot > best.total) best = { total: tot, map: [...cur] }; return; }
    for (let j = 0; j < players.length; j++) {
      if (used[j]) continue;
      used[j] = true; const c = comfortOf(players[j], heroIds[i]);
      cur.push({ hero: heroIds[i], player: players[j].player, comfort: c });
      rec(i + 1, tot + c);
      cur.pop(); used[j] = false;
    }
  })(0, 0);
  return best;
}

export function matchupTerm(ours, theirs, table) {
  if (!table) return { value: 0, available: false, notes: ['Hero matchup data not loaded: counterpick and synergy terms are switched off (not guessed).'] };
  let v = 0; const notes = [];
  for (const a of ours) for (const b of theirs) {
    const m = table[`${a}-${b}`];
    if (m && m.games >= 30) { const adv = m.wr - 0.5; v += adv; if (Math.abs(adv) >= 0.04) notes.push(`${a} vs ${b}: ${(m.wr * 100).toFixed(1)}% over ${m.games} games`); }
  }
  return { value: v, available: true, notes };
}

export function evaluateDraft({ ours, theirs = [], ourBans = [], theirBans = [] }, ctx) {
  const { heroes, pools, oppPools = [], matchups = null } = ctx;
  const asg = assign(ours, pools);
  const execution = asg.total / Math.max(1, ours.length);
  const comp = composition(ours, heroes);
  const issues = structureChecks(comp, ours.length);
  const structure = issues.reduce((a, i) => a + i.sev, 0);
  // Denial: opponent comfort on heroes we picked or banned.
  const denied = [];
  for (const h of [...ours, ...ourBans]) for (const op of oppPools) {
    const c = comfortOf(op, h); if (c >= 1.2) denied.push({ hero: h, player: op.player, comfort: c });
  }
  const denial = denied.reduce((a, d) => a + d.comfort, 0) * 0.3;
  // Vulnerabilities: our weak assignments, open opponent comfort heroes, structure gaps.
  const vulns = [];
  for (const a of asg.map) if (a.comfort < 0.8) vulns.push(`${heroes[a.hero]?.name} goes to ${a.player} with little tournament history on it.`);
  const taken = new Set([...ours, ...theirs, ...ourBans, ...theirBans]);
  for (const op of oppPools) {
    const top = op.pool.find((e) => e.tier === 'Established' && !taken.has(e.hero));
    if (top && ours.length < 5) vulns.push(`${op.player}'s comfort pick ${top.name} (${top.games} games) is still open.`);
  }
  for (const i of issues) vulns.push(i.text);
  const mu = matchupTerm(ours, theirs, matchups);
  const total = execution * 2 + structure * 0.6 + denial + mu.value * 10;
  return { total, terms: { execution, structure, denial, matchup: mu.value }, assignment: asg.map, comp, issues, denied, vulns, matchupNotes: mu.notes, matchupAvailable: mu.available };
}

// Explain why draft X is preferable to draft Y, term by term.
export function compareDrafts(x, y, ctx, labels = ['Draft A', 'Draft B']) {
  const ex = evaluateDraft(x, ctx), ey = evaluateDraft(y, ctx);
  const lines = [];
  const t = (name, a, b, unit, better) => {
    if (Math.abs(a - b) < 1e-9) return;
    const winner = (better === 'up' ? a > b : a < b) ? labels[0] : labels[1];
    lines.push(`${name}: ${labels[0]} ${a.toFixed(2)} vs ${labels[1]} ${b.toFixed(2)}${unit} → favours ${winner}.`);
  };
  t('Player comfort (execution)', ex.terms.execution, ey.terms.execution, '', 'up');
  t('Composition gaps (structure)', ex.terms.structure, ey.terms.structure, '', 'up');
  t('Opponent comfort denied', ex.terms.denial, ey.terms.denial, '', 'up');
  if (ex.matchupAvailable) t('Matchup data', ex.terms.matchup, ey.terms.matchup, '', 'up');
  const pick = ex.total >= ey.total ? labels[0] : labels[1];
  return { preferred: pick, margin: Math.abs(ex.total - ey.total), a: ex, b: ey, reasons: lines,
    caveat: ex.matchupAvailable ? null : 'Counterpick/synergy not scored: load matchup data to include it.' };
}

// Next-pick / next-ban suggestions for the current draft state.
export function suggest(state, ctx, { kind = 'pick', top = 5 } = {}) {
  const { heroes, pools, oppPools = [] } = ctx;
  const taken = new Set([...(state.ours || []), ...(state.theirs || []), ...(state.ourBans || []), ...(state.theirBans || [])]);
  const cands = Object.keys(heroes).map(Number).filter((h) => !taken.has(h));
  if (kind === 'ban') {
    return cands.map((h) => {
      const threats = oppPools.map((op) => ({ p: op.player, c: comfortOf(op, h), e: op.pool.find((x) => x.hero === h) })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
      const t = threats[0];
      return { hero: h, name: heroes[h].name, score: t ? t.c : 0, reasons: t ? [`${t.p}: ${t.e.games} tournament games${t.e.daysSince != null ? `, last ${t.e.daysSince} days ago` : ''}`] : [] };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, top);
  }
  const base = evaluateDraft(state, ctx);
  return cands.map((h) => {
    const next = { ...state, ours: [...(state.ours || []), h] };
    const ev = evaluateDraft(next, ctx);
    const reasons = [];
    const who = ev.assignment.find((a) => a.hero === h);
    if (who && who.comfort > 0) {
      const e = pools.find((p) => p.player === who.player).pool.find((x) => x.hero === h);
      reasons.push(`${who.player}: ${e.games} tournament games, ${e.tier}`);
    }
    if (ev.terms.structure > base.terms.structure) reasons.push('fills a composition gap');
    const deny = oppPools.map((op) => ({ p: op.player, c: comfortOf(op, h) })).filter((x) => x.c >= 1.2);
    if (deny.length) reasons.push(`denies ${deny.map((d) => d.p).join(', ')}`);
    const flexers = pools.filter((p) => (p.pool.find((x) => x.hero === h)?.games || 0) >= 2).length;
    if (flexers >= 2) reasons.push(`flex: ${flexers} of our players can take it`);
    return { hero: h, name: heroes[h].name, score: ev.total - base.total + (flexers >= 2 ? 0.3 : 0), reasons };
  }).filter((x) => x.reasons.length).sort((a, b) => b.score - a.score).slice(0, top);
}

// Opponent draft-pattern recognition from picks_bans records of a team.
// drafts: [{picks:[[isPick,hero,team,order]], side: 0|1 (that team's side), win}]
export function draftPatterns(drafts, heroes) {
  const firstBans = {}, firstPicks = {}, allPicks = {}, byGame = [];
  let firstPhaseCount = 0;
  for (const d of drafts) {
    const s = [...d.picks].sort((a, b) => a[3] - b[3]);
    const mine = s.filter((x) => x[2] === d.side);
    const bans = mine.filter((x) => !x[0]).map((x) => x[1]);
    const picks = mine.filter((x) => x[0]).map((x) => x[1]);
    if (s[0][2] === d.side) firstPhaseCount++;
    bans.slice(0, bans.length >= 3 ? 3 : bans.length).forEach((h) => (firstBans[h] = (firstBans[h] || 0) + 1));
    if (picks[0]) firstPicks[picks[0]] = (firstPicks[picks[0]] || 0) + 1;
    picks.forEach((h) => (allPicks[h] = (allPicks[h] || 0) + 1));
    byGame.push({ bans, picks, win: d.win });
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, c]) => ({ hero: +h, name: heroes[h]?.name, count: c }));
  // Adaptation inside a series: heroes picked after a loss that were not picked before.
  const adapt = [];
  for (let i = 1; i < byGame.length; i++) if (byGame[i - 1].win === false) {
    const prev = new Set(byGame[i - 1].picks); const newp = byGame[i].picks.filter((h) => !prev.has(h));
    adapt.push({ game: i + 1, newPicks: newp.map((h) => heroes[h]?.name) });
  }
  return { games: drafts.length, firstActionShare: drafts.length ? firstPhaseCount / drafts.length : NaN, firstBans: top(firstBans), firstPicks: top(firstPicks), mostPicked: top(allPicks), adaptationAfterLoss: adapt };
}
