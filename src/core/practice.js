// V1.26 Focus 1 — quality of practice. A session plan made of timed drills (each with an objective and a success
// criterion), a result per drill in the scrim report, and a weekly per-title trend built from the records.
// The AI may draft a plan or the weekly wording; the coach edits and approves. Counts carry their sample size.
import { weaknessCounts } from './weakness.js';
import { vodThemes } from './analyst.js';
import { shiftDay, localDay } from './dates.js';
import { hasContactNumber } from './pii.js';

const need = (c, m) => { if (!c) throw new Error(m); };
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
export const MAX_BLOCKS = 4;
export const DRILL_MET = ['yes', 'no', 'not tried'];
export const WEEK_MIN = 5;   // fewer reports than this in a fortnight = early sign only

// Timed drills of one session. Empty rows are dropped; a row with any text must be complete.
export function sessionBlocks(rows = []) {
  const out = [];
  for (const r of rows.slice(0, MAX_BLOCKS)) {
    const b = { name: norm(r.name).slice(0, 80), minutes: Number(r.minutes) || 0, objective: norm(r.objective).slice(0, 200), criterion: norm(r.criterion).slice(0, 200) };
    if (!b.name && !b.objective && !b.criterion && !b.minutes) continue;
    need(b.name, 'Each drill needs a name.');
    need(Number.isInteger(b.minutes) && b.minutes >= 5 && b.minutes <= 180, `"${b.name}": minutes must be a whole number from 5 to 180.`);
    need(b.objective, `"${b.name}": write its objective.`);
    need(b.criterion, `"${b.name}": write how we will know it worked (success criterion).`);
    need(!hasContactNumber(`${b.name} ${b.objective} ${b.criterion}`), 'Remove phone or ID numbers.');
    out.push(b);
  }
  return out;
}
export const blocksMinutes = (blocks) => (blocks || []).reduce((a, b) => a + (b.minutes || 0), 0);

// The coach's call per drill, kept with the scrim report.
export function drillResults(blocks = [], marks = []) {
  return blocks.map((b, i) => ({ name: b.name, criterion: b.criterion, met: DRILL_MET.includes(marks[i]) ? marks[i] : '' })).filter((d) => d.met);
}

// What the plan should start from: unfixed adjustments, recurring weaknesses, recurring VOD themes.
export function planMaterial(title, { reports = [], wtags = [], vods = [], asOf = localDay() } = {}) {
  const mine = reports.filter((r) => r.title === title).sort((a, b) => b.date.localeCompare(a.date));
  return {
    weaknesses: weaknessCounts(wtags, title, asOf, 14).slice(0, 6).map((w) => ({ label: w.tag, n: w.n, prev: w.prev, flagged: w.flagged })),
    themes: vodThemes(vods, title, asOf).filter((t) => t.recurring).slice(0, 4).map((t) => ({ player: t.player, label: t.tag, marks: t.n, games: t.games })),
    unfixed: mine.filter((r) => ['No change', 'Better, not fixed yet'].includes(r.fixCheck) && r.prevAdjust).slice(0, 4).map((r) => ({ id: r.id, date: r.date, adjustment: r.prevAdjust, check: r.fixCheck })),
  };
}

// For the review: what came back compared with earlier sessions (deterministic, shown next to the report form).
export function cameBack(title, { reports = [], wtags = [], asOf = localDay() } = {}) {
  const flagged = weaknessCounts(wtags, title, asOf, 14).filter((w) => w.flagged).map((w) => ({ label: w.tag, n: w.n }));
  const unfixed = reports.filter((r) => r.title === title && r.fixCheck === 'No change' && r.prevAdjust).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((r) => ({ date: r.date, adjustment: r.prevAdjust }));
  const lastDrills = reports.filter((r) => r.title === title && (r.drills || []).length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    .flatMap((r) => r.drills.filter((d) => d.met === 'no').map((d) => ({ date: r.date, name: d.name })));
  const missed = {}; for (const d of lastDrills) missed[d.name] = (missed[d.name] || 0) + 1;
  return { flagged, unfixed, drillsMissedTwice: Object.entries(missed).filter(([, n]) => n >= 2).map(([name, n]) => ({ name, n })) };
}

// Weekly trend per title: last 14 days against the 14 before.
export function weeklyTrend(title, { reports = [], wtags = [], asOf = localDay() } = {}) {
  const from = shiftDay(asOf, -13); const prevFrom = shiftDay(from, -14);
  const mine = reports.filter((r) => r.title === title);
  const now = mine.filter((r) => r.date >= from && r.date <= asOf); const prev = mine.filter((r) => r.date >= prevFrom && r.date < from);
  const counts = weaknessCounts(wtags, title, asOf, 14);
  const fixed = counts.filter((c) => c.prev >= 2 && c.n === 0).map((c) => ({ label: c.tag, prev: c.prev }));
  const persisting = counts.filter((c) => c.n > 0 && c.prev > 0).map((c) => ({ label: c.tag, n: c.n, prev: c.prev }));
  const fresh = counts.filter((c) => c.n > 0 && c.prev === 0).map((c) => ({ label: c.tag, n: c.n }));
  // Which partner exposed what: labels on reports against each partner in the last 14 days.
  const tagsOfReport = Object.fromEntries(wtags.filter((t) => t.title === title).map((t) => [t.reportId, t.tags || []]));
  const ex = {}; for (const r of now) for (const g of tagsOfReport[r.id] || []) { const k = `${r.partner}|${g}`; ex[k] = (ex[k] || 0) + 1; }
  const exposedBy = Object.entries(ex).filter(([, n]) => n >= 2).map(([k, n]) => { const [partner, label] = k.split('|'); return { partner, label, n }; }).sort((a, b) => b.n - a.n).slice(0, 5);
  const drills = { yes: 0, no: 0, 'not tried': 0 }; for (const r of now) for (const d of r.drills || []) if (drills[d.met] != null) drills[d.met]++;
  return { title, from, to: asOf, reports: now.length, reportsPrev: prev.length, lowSample: now.length < WEEK_MIN, fixed, persisting, fresh, exposedBy, drills };
}
export function weeklyText(w, lang = 'en') {
  const id = lang === 'id'; const L = [];
  L.push(id ? `${w.title}: ${w.from} – ${w.to} (${w.reports} laporan; 14 hari sebelumnya ${w.reportsPrev})` : `${w.title}: ${w.from} – ${w.to} (${w.reports} report(s); previous 14 days ${w.reportsPrev})`);
  if (w.lowSample) L.push(id ? `Sampel kecil (di bawah ${WEEK_MIN} laporan): baca sebagai tanda awal, bukan kesimpulan.` : `Small sample (under ${WEEK_MIN} reports): read as early signs, not conclusions.`);
  const list = (xs, f) => xs.map(f).join(', ');
  if (w.fixed.length) L.push(`${id ? 'Tidak muncul lagi' : 'No longer showing'}: ${list(w.fixed, (x) => `${x.label} (${id ? 'sebelumnya' : 'before'} ${x.prev})`)}`);
  if (w.persisting.length) L.push(`${id ? 'Masih muncul' : 'Persisting'}: ${list(w.persisting, (x) => `${x.label} ${x.n} (${id ? 'sebelumnya' : 'before'} ${x.prev})`)}`);
  if (w.fresh.length) L.push(`${id ? 'Baru' : 'New'}: ${list(w.fresh, (x) => `${x.label} ${x.n}`)}`);
  if (w.exposedBy.length) L.push(`${id ? 'Terlihat saat melawan' : 'Exposed by'}: ${list(w.exposedBy, (x) => `${x.partner} → ${x.label} (${x.n})`)}`);
  const d = w.drills; if (d.yes + d.no + d['not tried']) L.push(`${id ? 'Drill' : 'Drills'}: ${id ? 'tercapai' : 'met'} ${d.yes}, ${id ? 'tidak' : 'not met'} ${d.no}, ${id ? 'tidak dicoba' : 'not tried'} ${d['not tried']}`);
  if (L.length === 1 || (L.length === 2 && w.lowSample)) L.push(id ? 'Belum ada label kelemahan di periode ini.' : 'No weakness labels in this period yet.');
  return L.join('\n');
}
// What the AI weekly draft receives: the computed trend only (every number comes from here).
export const weeklyMaterial = (w) => ({ TITLE: w.title, PERIOD: { from: w.from, to: w.to }, REPORTS: { now: w.reports, previous: w.reportsPrev, low_sample: w.lowSample },
  FIXED: w.fixed, PERSISTING: w.persisting, NEW: w.fresh, EXPOSED_BY: w.exposedBy, DRILLS: w.drills });
