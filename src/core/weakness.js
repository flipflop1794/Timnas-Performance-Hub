// V1.20 recurring-weakness tracker. Each scrim report gets up to 3 weakness labels (from the AI or the
// coach), from a fixed list per kind of game, kept as a separate record (reports themselves never change).
// The tracker counts labels over a window, compares with the window before, and flags a label that comes
// back 3 or more times so the staff can turn it into a coaching objective.
import { tagsOf } from '../../supabase/functions/_shared/scrim_spec.js';
import { shiftDay } from './dates.js';

export { tagsOf };
export const FLAG_AT = 3;
export const MAX_TAGS = 3;

export function cleanTags(title, tags) {
  const allowed = tagsOf(title);
  return [...new Set((Array.isArray(tags) ? tags : []).filter((t) => allowed.includes(t)))].slice(0, MAX_TAGS);
}
// One record per report: id 'WT-<report id>'.
export function tagRecord(report, tags, { by, source }) {
  return { id: `WT-${report.id}`, title: report.title, reportId: report.id, date: report.date, tags: cleanTags(report.title, tags), source, by, at: new Date().toISOString(), origin: 'operational' };
}
// Reports that have something failing and no labels yet.
export const untagged = (reports, tagRows, title) => {
  const done = new Set(tagRows.map((t) => t.reportId));
  return reports.filter((r) => r.title === title && !done.has(r.id) && String(r.failed || '').trim());
};

// [{ tag, n, prev, reports: [ids], flagged, rising }], most frequent first.
export function weaknessCounts(tagRows, title, asOf, days = 14) {
  const from = shiftDay(asOf, -(days - 1)); const prevFrom = shiftDay(from, -days);
  const mine = tagRows.filter((t) => t.title === title);
  const out = {};
  for (const t of mine) for (const tag of t.tags || []) {
    const o = (out[tag] ||= { tag, n: 0, prev: 0, reports: [] });
    if (t.date >= from && t.date <= asOf) { o.n++; o.reports.push(t.reportId); } else if (t.date >= prevFrom && t.date < from) o.prev++;
  }
  return Object.values(out).filter((o) => o.n || o.prev)
    .map((o) => ({ ...o, flagged: o.n >= FLAG_AT, rising: o.n > o.prev }))
    .sort((a, b) => b.n - a.n || b.prev - a.prev || a.tag.localeCompare(b.tag));
}
