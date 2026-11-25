// V1.59 streaks and milestones (owner's ask, 25 Nov 2026: daily login, gamification, milestones for the support staff
// and the coaches, on their own tab). Personal: no points, no levels, no ranking between people.
// - A streak counts the days with activity: a saved report (support staff: their own; coaches: their title's scrim
//   reports) or opening the hub (the daily login). Up to two days off in a calendar week (Mon–Sun) never break it,
//   and today without activity yet does not break it either (the day is not over).
// - Road to WEC: no break from the day this went live until the day before WEC.
import { shiftDay } from './dates.js';
import { EVENT } from './matchday.js';

export const DAYS_OFF = 2;
export const ROAD_FROM = '2026-11-26';
export const ROAD_TO = shiftDay(EVENT.start, -1);
const dayN = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
const weekOf = (d) => { const n = dayN(d); return n - ((n + 3) % 7); };   // the Monday of d's week (1970-01-01 was a Thursday)
const asSet = (days) => (days instanceof Set ? days : new Set(days || []));

// The current streak: { n, first } (first = the earliest day with activity in it).
export function streak(days, asOf, off = DAYS_OFF) {
  const S = asSet(days); const used = {}; let n = 0; let first = null;
  let d = S.has(asOf) ? asOf : shiftDay(asOf, -1);
  for (let i = 0; i < 500; i++, d = shiftDay(d, -1)) {
    if (S.has(d)) { n++; first = d; continue; }
    const w = weekOf(d); used[w] = (used[w] || 0) + 1;
    if (used[w] > off) break;
  }
  return { n, first };
}
// The longest streak ever (the milestones are kept once reached).
export function bestStreak(days, asOf, off = DAYS_OFF) {
  const S = asSet(days); let best = 0;
  for (const d of S) if (d <= asOf) best = Math.max(best, streak(S, d, off).n);
  return best;
}
// The most active days in one calendar week.
export function bestWeek(days, asOf) {
  const per = {}; for (const d of asSet(days)) if (d <= asOf) per[weekOf(d)] = (per[weekOf(d)] || 0) + 1;
  return Math.max(0, ...Object.values(per));
}
// Road to WEC: every week from ROAD_FROM to ROAD_TO with at most two days off (today does not count yet).
export function roadToWec(days, asOf, off = DAYS_OFF) {
  const S = asSet(days); const total = dayN(ROAD_TO) - dayN(ROAD_FROM) + 1;
  if (asOf < ROAD_FROM) return { state: 'soon', day: 0, total };
  const used = {}; let broken = false; let active = 0;
  for (let d = ROAD_FROM; d <= ROAD_TO && d <= asOf; d = shiftDay(d, 1)) {
    if (S.has(d)) { active++; continue; }
    if (d === asOf) continue;
    const w = weekOf(d); used[w] = (used[w] || 0) + 1; if (used[w] > off) broken = true;
  }
  const day = Math.min(total, dayN(asOf) - dayN(ROAD_FROM) + 1);
  return { state: broken ? 'broken' : asOf > ROAD_TO ? 'earned' : 'on', day, total, active };
}
export const daysToWec = (asOf) => dayN(EVENT.start) - dayN(asOf);

const L = (en, id) => ({ en, id });
// Count milestones in tiers: the first not reached yet is the next goal (50 visits, then 100).
const tier = (id, have, steps, label) => {
  const next = steps.find((s) => have < s);
  const top = [...steps].reverse().find((s) => have >= s);
  const done = top ? [{ id: `${id}${top}`, label: label(top), earned: true }] : [];
  return next ? [...done, { id: `${id}${next}`, label: label(next), earned: false, have, need: next }] : done;
};
const road = (r) => ({ id: 'wec', label: L('Road to WEC', 'Road to WEC'), earned: r.state === 'earned', lost: r.state === 'broken', have: r.day, need: r.total });
const login7 = (loginDays, asOf) => (loginDays ? [{ id: 'login7', label: L('Logged in 7 days in a row', 'Login 7 hari beruntun'), earned: bestStreak(loginDays, asOf) >= 7, have: Math.min(7, streak(loginDays, asOf).n), need: 7 }] : []);

// Support staff: their own report days, visits and follow-ups closed (soFar), and their login days (null = not
// available yet: the login milestone is left out).
// V1.60 balance (live numbers, 26 Nov): physios log 4-5 visits a day; psychologists, the doctor and the physical coach
// about one. Their visit goals are smaller, so everyone can reach one before WEC.
export const VISIT_STEPS = { physio: [50, 100], other: [15, 30] };
// Days with activity in the current calendar week (the progress towards "Full week").
const thisWeek = (R, asOf) => { let n = 0; for (let d = asOf; weekOf(d) === weekOf(asOf); d = shiftDay(d, -1)) if (R.has(d)) n++; return n; };
export function supportBadges({ reportDays, visits = 0, closed = 0, loginDays = null, asOf, disc = '' }) {
  const R = asSet(reportDays); const best = bestStreak(R, asOf);
  return [
    { id: 'first', label: L('First report', 'Laporan pertama'), earned: R.size > 0 },
    { id: 'streak7', label: L('7 days in a row', '7 hari beruntun'), earned: best >= 7, have: Math.min(7, streak(R, asOf).n), need: 7 },
    { id: 'week5', label: L('Full week (5 days)', 'Minggu penuh (5 hari)'), earned: bestWeek(R, asOf) >= 5, have: thisWeek(R, asOf), need: 5 },
    tier('visits', visits, VISIT_STEPS[disc === 'physio' ? 'physio' : 'other'], (n) => L(`${n} visits`, `${n} kunjungan`)),
    tier('closed', closed, [5, 15], (n) => L(`${n} follow-ups closed`, `${n} tindak lanjut tuntas`)),
    ...login7(loginDays, asOf),
    road(roadToWec(R, asOf)),
  ].flat();
}
// Coaches: their title's scrim report days and count, and their own login days.
export function coachBadges({ reportDays, reports = 0, loginDays = null, asOf }) {
  const R = asSet(reportDays); const best = bestStreak(R, asOf);
  return [
    { id: 'first', label: L('First scrim report', 'Laporan scrim pertama'), earned: R.size > 0 },
    { id: 'streak5', label: L('5 days in a row', '5 hari beruntun'), earned: best >= 5, have: Math.min(5, streak(R, asOf).n), need: 5 },
    { id: 'week5', label: L('Full week (5 days)', 'Minggu penuh (5 hari)'), earned: bestWeek(R, asOf) >= 5, have: thisWeek(R, asOf), need: 5 },
    tier('reports', reports, [15, 30], (n) => L(`${n} scrim reports`, `${n} laporan scrim`)),
    ...login7(loginDays, asOf),
    road(roadToWec(R, asOf)),
  ].flat();
}
// Milestones reached by a change (e.g. the report just saved): the ids in after that were not earned before.
export const newlyEarned = (before, after) => after.filter((b) => b.earned && !before.some((x) => x.id === b.id && x.earned));
