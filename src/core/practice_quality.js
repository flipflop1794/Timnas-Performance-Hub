// Practice quality across titles (V1.16, audit C8): how rigorously each title runs its practice, from the
// records the staff already keep. No AI and nothing typed for it. Every part is shown with its count, so
// management can see why a score is what it is; a part with no data is left out, never counted as zero.
//
// Parts (each a share from 0 to 1 over the window):
//   planKept     planned sessions dated in the window (before today) that took place
//   objective    sessions that took place with an objective written down
//   reported     sessions that took place with a scrim report or daily report
//   onTime       reports filed by the end of the day after the session (WIB)
//   followed     coaches' "plan followed" rating (1–5) on reports, as a share of the scale
//   followUps    follow-ups due in the window (before today) that are done
//   reviewed     coaching proposals made in the window that have been reviewed
import { shiftDay } from './dates.js';

export const PARTS = [
  ['planKept', 'Planned sessions held'], ['objective', 'Sessions with an objective'], ['reported', 'Sessions reported'],
  ['onTime', 'Reports filed by next day'], ['followed', 'Plan followed (coach rating)'], ['followUps', 'Follow-ups done on time'],
  ['reviewed', 'Proposals reviewed'],
];
export const MIN_SESSIONS = 3;

// WIB calendar day of an ISO time.
const wibDay = (iso) => (iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10) : '');
const share = (hit, n) => (n ? { value: hit / n, hit, n } : null);

export function titleQuality(title, { scrims = [], reports = [], cycle = [] }, from, to) {
  const inWin = (d) => d >= from && d <= to;
  const mine = scrims.filter((s) => s.title === title && s.origin !== 'demo');
  const reps = reports.filter((r) => r.title === title && inWin(r.date));
  const due = mine.filter((s) => inWin(s.date) && s.date < to);                      // sessions that should have happened
  const held = mine.filter((s) => s.status === 'done' && inWin(s.date));
  const reportFor = new Set(reports.filter((r) => r.scrimId).map((r) => r.scrimId));
  const filed = [
    ...reps.map((r) => ({ date: r.date, at: r.createdAt })),
    // A daily report made from a scrim report (V1.16 one form) is the same filing: counted once, as the report.
    ...held.filter((s) => s.dailyReport && !s.dailyReport.fromReport).map((s) => ({ date: s.date, at: s.dailyReport.filedAt })),
  ];
  const fu = mine.filter((s) => s.followUp && inWin(s.followUp.due) && s.followUp.due < to);
  const props = cycle.filter((o) => o.title === title && inWin(wibDay(o.createdAt)));
  const parts = {
    planKept: share(due.filter((s) => s.status === 'done').length, due.length),   // cancelled or never closed = not held
    objective: share(held.filter((s) => (s.objectives || []).length || s.dailyReport?.objective).length, held.length),
    reported: share(held.filter((s) => s.dailyReport || reportFor.has(s.id)).length, held.length),
    onTime: share(filed.filter((f) => f.at && wibDay(f.at) <= shiftDay(f.date, 1)).length, filed.length),
    followed: reps.length ? { value: (reps.reduce((a, r) => a + Number(r.progress || 0), 0) / reps.length - 1) / 4, hit: null, n: reps.length } : null,
    followUps: share(fu.filter((s) => s.followUp.status === 'Done').length, fu.length),
    reviewed: share(props.filter((o) => (o.reviews || []).length).length, props.length),
  };
  const have = Object.values(parts).filter(Boolean);
  const sessions = held.length + reps.filter((r) => !r.scrimId || !held.some((s) => s.id === r.scrimId)).length;
  const days = new Set([...held.map((s) => s.date), ...reps.map((r) => r.date)]).size;
  return {
    title, parts, sessions, days,
    score: have.length ? Math.round((have.reduce((a, p) => a + p.value, 0) / have.length) * 100) : null,
    lowSample: sessions < MIN_SESSIONS,
  };
}

// One row per title for the window ending `asOf` (inclusive), with the previous window for comparison.
export function practiceQuality(titles, data, asOf, windowDays = 7) {
  const from = shiftDay(asOf, -(windowDays - 1));
  const prevTo = shiftDay(from, -1); const prevFrom = shiftDay(prevTo, -(windowDays - 1));
  return titles.map((title) => {
    const now = titleQuality(title, data, from, asOf);
    const prev = titleQuality(title, data, prevFrom, prevTo);
    const change = now.score != null && prev.score != null && !now.lowSample && !prev.lowSample ? now.score - prev.score : null;
    return { ...now, prevScore: prev.score, change, from, to: asOf };
  });
}
