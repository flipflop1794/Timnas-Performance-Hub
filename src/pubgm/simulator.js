// PUBG Mobile tournament strategy simulator.
// Transparent Monte Carlo: each strategy is either (a) a bootstrap of the team's own logged
// matches played with that strategy tag, or (b) the team's overall history adjusted by
// explicit, editable assumptions. The output is a range (P10/P50/P90), never a single number.

import { rng, quantile, mean } from '../core/stats.js';

export const DEFAULT_ASSUMPTIONS = {
  aggressive: { label: 'Aggressive elimination focus', elimMult: 1.4, earlyExitAdd: 0.10, placeShift: +2 },
  balanced: { label: 'Balanced macro', elimMult: 1.0, earlyExitAdd: 0.0, placeShift: 0 },
  passive: { label: 'Conservative placement focus', elimMult: 0.6, earlyExitAdd: -0.07, placeShift: -2 },
};

// Build a sampler for one strategy.
export function strategySampler(rows, team, strategy, assumptions = DEFAULT_ASSUMPTIONS, minTagged = 6) {
  const mine = rows.filter((r) => r.team === team);
  const tagged = mine.filter((r) => r.strategy === strategy);
  if (tagged.length >= minTagged) {
    return { source: `bootstrap of ${tagged.length} logged "${strategy}" matches`, basis: 'data', draw: (r) => { const x = tagged[Math.floor(r() * tagged.length)]; return { placement: x.placement, elims: x.elims }; } };
  }
  const a = assumptions[strategy];
  if (!a) throw new Error(`unknown strategy ${strategy}`);
  if (!mine.length) throw new Error('no logged matches for this team');
  const earlyBase = mine.filter((r) => r.died_phase > 0 && r.died_phase <= 2).length / mine.length;
  const pEarly = Math.min(0.9, Math.max(0, earlyBase + a.earlyExitAdd));
  const late = mine.filter((r) => !(r.died_phase > 0 && r.died_phase <= 2));
  const early = mine.filter((r) => r.died_phase > 0 && r.died_phase <= 2);
  return {
    source: `${mine.length} logged matches adjusted by assumptions (elims ×${a.elimMult}, early-exit ${a.earlyExitAdd >= 0 ? '+' : ''}${Math.round(a.earlyExitAdd * 100)} pts, placement shift ${a.placeShift})`,
    basis: 'assumption',
    draw: (r) => {
      const pool = r() < pEarly ? (early.length ? early : mine) : (late.length ? late : mine);
      const x = pool[Math.floor(r() * pool.length)];
      const placement = Math.min(16, Math.max(1, x.placement + a.placeShift + Math.round((r() - 0.5) * 2)));
      const lam = x.elims * a.elimMult;
      const elims = Math.max(0, Math.round(lam + (r() - 0.5) * 2));
      return { placement, elims };
    },
  };
}

export function simulate({ rows, team, strategies = ['aggressive', 'balanced', 'passive'], matches = 6, sc, iters = 4000, seed = 7, assumptions = DEFAULT_ASSUMPTIONS, rival = null }) {
  const out = [];
  for (const s of strategies) {
    const smp = strategySampler(rows, team, s, assumptions);
    const r = rng(seed);
    const totals = [];
    let beatRival = 0;
    const rivalRows = rival ? rows.filter((x) => x.team === rival.team) : [];
    for (let i = 0; i < iters; i++) {
      let t = 0;
      for (let m = 0; m < matches; m++) { const d = smp.draw(r); t += sc.total(d); }
      totals.push(t);
      if (rival && rivalRows.length) {
        let rt = 0;
        for (let m = 0; m < matches; m++) { const x = rivalRows[Math.floor(r() * rivalRows.length)]; rt += sc.total(x); }
        if ((rival.ourPoints || 0) + t > (rival.theirPoints || 0) + rt) beatRival++;
      }
    }
    out.push({
      strategy: s, label: assumptions[s]?.label || s, basis: smp.basis, source: smp.source,
      mean: mean(totals), p10: quantile(totals, 0.1), p50: quantile(totals, 0.5), p90: quantile(totals, 0.9),
      pBelow: (x) => totals.filter((t) => t < x).length / totals.length,
      pBeatRival: rival ? beatRival / iters : null,
    });
  }
  return { matches, iters, results: out, caveat: 'Ranges come from past logged matches and the stated assumptions; lobby, circles and opponents at WEC will differ.' };
}
