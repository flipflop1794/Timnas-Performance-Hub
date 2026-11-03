// Measurement framework: does the hub produce measurable competitive value?
// It compares a KPI between a baseline window and a later window of comparable scrims,
// and refuses to call a change "improvement" unless the interval excludes zero AND the
// comparison is fair (enough games, same patch, similar opponent strength).
// Even then it reports an indicator change, never a change in tournament win probability.

import { diffMeans, diffProportions, mean } from './stats.js';

export const KPIS = {
  dota: [
    { id: 'win', label: 'Scrim win rate', type: 'prop', better: 'up' },
    { id: 'nw10', label: 'Net worth lead at 10:00', type: 'mean', better: 'up' },
    { id: 'rosh_conv', label: 'Roshan taken → tower within 3 min', type: 'prop', better: 'up' },
    { id: 'tf_win', label: 'Teamfights won (by deaths)', type: 'prop', better: 'up' },
    { id: 'repeat_err', label: 'Repeated tagged mistakes per game', type: 'mean', better: 'down' },
    { id: 'draft_align', label: 'Draft executed as planned', type: 'prop', better: 'up' },
  ],
  pubgm: [
    { id: 'pts', label: 'Points per match', type: 'mean', better: 'up' },
    { id: 'place_pts', label: 'Placement points per match', type: 'mean', better: 'up' },
    { id: 'elim_pts', label: 'Elimination points per match', type: 'mean', better: 'up' },
    { id: 'top8', label: 'Top-8 finishes', type: 'prop', better: 'up' },
    { id: 'early_out', label: 'Out before zone 3', type: 'prop', better: 'down' },
    { id: 'kf_conv', label: 'Knock → finish conversion', type: 'prop', better: 'up' },
  ],
  shared: [
    { id: 'objective_done', label: 'Training objectives completed', type: 'prop', better: 'up' },
    { id: 'rec_adopted', label: 'Recommendations adopted by staff', type: 'prop', better: 'up' },
    { id: 'rec_useful', label: 'Coach rating of recommendations (1–5)', type: 'mean', better: 'up' },
    { id: 'scout_hit', label: 'Scouting: predicted bans/picks that happened', type: 'prop', better: 'up' },
  ],
};

// before/after: arrays of numbers (means) or of 0/1 (proportions).
// meta: { patchChanged, oppStrengthBefore, oppStrengthAfter, minN }
export function compareWindows(kpi, before, after, meta = {}) {
  const minN = meta.minN ?? 8;
  const flags = [];
  if (before.length < minN || after.length < minN) flags.push(`fewer than ${minN} games in a window (${before.length} vs ${after.length})`);
  if (meta.patchChanged) flags.push('patch changed between windows');
  if (meta.oppStrengthBefore != null && meta.oppStrengthAfter != null && Math.abs(meta.oppStrengthAfter - meta.oppStrengthBefore) > 0.5) {
    flags.push('scrim opponents were not of similar strength');
  }
  let r;
  if (kpi.type === 'prop') {
    const k1 = before.filter(Boolean).length, k2 = after.filter(Boolean).length;
    r = before.length && after.length ? diffProportions(k1, before.length, k2, after.length) : null;
  } else {
    r = before.length > 1 && after.length > 1 ? diffMeans(before, after) : null;
  }
  if (!r) return { kpi: kpi.id, label: kpi.label, status: 'insufficient', flags, before: mean(before), after: mean(after) };
  const dir = kpi.better === 'up' ? 1 : -1;
  const clear = dir * r.lo > 0 || dir * r.hi < 0 ? (dir * r.d > 0 ? 'better' : 'worse') : 'no clear change';
  const status = flags.length && clear !== 'no clear change' ? `${clear} (not a fair comparison yet)` : clear;
  return { kpi: kpi.id, label: kpi.label, status, d: r.d, lo: r.lo, hi: r.hi, before: kpi.type === 'prop' ? r.p1 : r.ma, after: kpi.type === 'prop' ? r.p2 : r.mb, flags,
    note: 'An indicator change. It does not show a change in tournament win probability.' };
}

// Scouting accuracy: share of predicted items that appeared in the actual record.
export function scoutingHitRate(predicted, actual) {
  const set = new Set(actual);
  const hits = predicted.filter((p) => set.has(p)).length;
  return { hits, n: predicted.length, rate: predicted.length ? hits / predicted.length : NaN };
}
