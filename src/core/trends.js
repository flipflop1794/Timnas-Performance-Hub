// Weekly trendlines (V1.16, audit C7): is practice turning into improvement? Built only from records the
// staff already keep: scrim reports (all titles), coach-confirmed scrim games (MOBA, per player) and the
// PUBG Mobile match log. No AI, nothing typed for it.
//
// Each measure keeps the raw values per week (one per game, match or report), so the verdict compares the
// last two weeks with the two before using the same intervals as "Is it working?" (core/measure.js):
// it says "better" or "worse" only when the 95% interval excludes no change and both sides have enough
// values. Weekly points are shown either way; a week with no values is a gap, not a zero.
import { shiftDay } from './dates.js';
import { compareWindows } from './measure.js';
import { mean } from './stats.js';
import { STAT_DEFS } from './capture.js';

export const VERDICT_WEEKS = 2;        // last N weeks vs the N before
export const MIN_VALUES = 6;           // values needed on each side before a verdict

// Rolling 7-day weeks ending on `asOf` (inclusive), oldest first.
export function weeks(asOf, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const to = shiftDay(asOf, -7 * (n - 1 - i)); return { from: shiftDay(to, -6), to };
  });
}
const weekOf = (W, date) => W.findIndex((w) => date >= w.from && date <= w.to);

// measure: { key, label, type: 'prop'|'mean', better: 'up'|'down', fmt } ; samples: [{ date, v }]
function series(measure, samples, W) {
  const per = W.map(() => []);
  for (const s of samples) { const i = weekOf(W, s.date); if (i >= 0 && s.v != null && Number.isFinite(s.v)) per[i].push(s.v); }
  const values = per.map((xs) => (xs.length ? mean(xs) : null));
  const k = Math.min(VERDICT_WEEKS, Math.floor(W.length / 2));
  const after = per.slice(-k).flat(); const before = per.slice(-2 * k, -k).flat();
  const c = compareWindows(measure, before, after, { minN: MIN_VALUES });
  const verdict = c.status === 'insufficient' || c.flags.length ? 'not enough data' : c.status;
  return { ...measure, values, counts: per.map((xs) => xs.length), verdict, before: before.length ? mean(before) : null, after: after.length ? mean(after) : null, nBefore: before.length, nAfter: after.length };
}

// Team measures for one title. ctx: { reports, games, pubgm: { rows, team, points(row) } }
export function teamTrends(title, ctx, W) {
  const reps = (ctx.reports || []).filter((r) => r.title === title);
  const out = [];
  const wl = reps.filter((r) => r.result?.mode === 'wl');
  if (wl.length) {
    // One value per game, map or match played (1 = won), so a 3-0 day weighs more than a 1-0 day.
    const s = wl.flatMap((r) => [...Array(r.result.won).fill(1), ...Array(r.result.lost + r.result.drawn).fill(0)].map((v) => ({ date: r.date, v })));
    out.push(series({ key: 'win', label: 'Scrim win rate', type: 'prop', better: 'up', unit: '%' }, s, W));
  }
  const pts = reps.filter((r) => r.result?.mode === 'points' && r.result.played);
  if (pts.length) out.push(series({ key: 'ppm', label: 'Points per match (reports)', type: 'mean', better: 'up' }, pts.map((r) => ({ date: r.date, v: r.result.points / r.result.played })), W));
  if (reps.length) out.push(series({ key: 'plan', label: 'Plan followed (1–5)', type: 'mean', better: 'up' }, reps.map((r) => ({ date: r.date, v: Number(r.progress) })), W));
  const P = ctx.pubgm;
  if (P && P.rows?.length && P.team) {
    const mine = P.rows.filter((r) => r.team === P.team && r.date);
    if (mine.length) {
      out.push(series({ key: 'place', label: 'Average placement (match log)', type: 'mean', better: 'down' }, mine.map((r) => ({ date: r.date, v: Number(r.placement) })), W));
      if (P.points) out.push(series({ key: 'logppm', label: 'Points per match (match log)', type: 'mean', better: 'up' }, mine.map((r) => ({ date: r.date, v: P.points(r) })), W));
      out.push(series({ key: 'early', label: 'Out before zone 3', type: 'prop', better: 'down', unit: '%' }, mine.map((r) => ({ date: r.date, v: Number(r.died_phase) > 0 && Number(r.died_phase) <= 2 ? 1 : 0 })), W));
    }
  }
  return out;
}

// Per-player measures from confirmed MOBA games (latest versions). One value per game.
export function playerTrends(games, W) {
  if (!games.length) return [];
  const defs = STAT_DEFS[games[0].game] || [];
  const pick = ['kills', 'deaths', 'assists'].map((k) => defs.find((d) => d.key === k)).filter(Boolean);
  const players = {};
  for (const g of games) for (const p of g.players || []) if (p.team === 'ours' && p.player && p.player !== 'stand-in') (players[p.player] ||= []).push({ g, p });
  return Object.entries(players).sort((a, b) => a[0].localeCompare(b[0])).map(([player, rows]) => {
    const st = (key) => rows.map(({ g, p }) => ({ date: g.date, v: p.stats?.[key] ?? null }));
    const kda = rows.map(({ g, p }) => {
      const { kills: k, deaths: d, assists: a } = p.stats || {};
      return { date: g.date, v: k == null || d == null || a == null ? null : (k + a) / Math.max(1, d) };
    });
    return {
      player, games: rows.length,
      measures: [
        series({ key: 'kda', label: 'KDA', type: 'mean', better: 'up' }, kda, W),
        ...pick.map((d) => series({ key: d.key, label: d.label, type: 'mean', better: d.higher ? 'up' : 'down' }, st(d.key), W)),
      ],
    };
  });
}
