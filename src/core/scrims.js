import { localDay } from './dates.js';
// Scrim / practice planner and log, shared by all titles. A scrim can carry the accepted objectives it
// is meant to practise; completing it logs a session on each of those objectives (core/cycle.js).

export const FORMATS = ['Bo1', 'Bo2', 'Bo3', 'Bo5', 'Lobby (BR)', 'Custom scenario', 'Internal (5v5 / split)'];
export const KINDS = ['scrim', 'scenario drill', 'review', 'individual practice', 'physical / recovery', 'team practice'];

const need = (c, m) => { if (!c) throw new Error(m); };

export function planScrim(x) {
  need(x.title, 'Title is required.');
  need(/^\d{4}-\d{2}-\d{2}$/.test(x.date || ''), 'Date is required (YYYY-MM-DD).');
  need(KINDS.includes(x.kind), `Kind must be one of: ${KINDS.join(', ')}.`);
  if (x.kind === 'scrim') need(x.partner && x.partner.trim(), 'Name the sparring partner.');
  need(x.owner && x.owner.trim(), 'Owner is required.');
  return {
    id: `SC-${x.date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`,
    title: x.title, date: x.date, time: x.time || '', kind: x.kind, format: x.format || '', partner: (x.partner || '').trim(),
    partnerLevel: x.partnerLevel || '', mirrors: (x.mirrors || '').trim(), owner: x.owner.trim(),
    objectives: x.objectives || [], status: 'planned', result: null, origin: 'operational', createdAt: new Date().toISOString(),
  };
}

// result: { score (e.g. "2-1", or PUBGM points), matchIds: [], notes, perObjective: {objId: {result, measure}} }
export function completeScrim(s, r) {
  need(s.status === 'planned', 'This scrim is already closed.');
  need(r.by && r.by.trim(), 'Who logged it is required.');
  if (s.kind === 'scrim') need(r.score && String(r.score).trim(), 'Record the score (e.g. 2-1) or points.');
  return { ...s, status: r.cancelled ? 'cancelled' : 'done', result: { score: (r.score || '').trim(), matchIds: r.matchIds || [], notes: (r.notes || '').trim(), by: r.by.trim(), at: new Date().toISOString(), perObjective: r.perObjective || {}, cancelledWhy: r.cancelledWhy || '' } };
}

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export function summary(scrims, title, today = localDay()) {
  const mine = scrims.filter((s) => s.title === title);
  const upcoming = mine.filter((s) => s.status === 'planned' && s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const overdue = mine.filter((s) => s.status === 'planned' && s.date < today);
  const done = mine.filter((s) => s.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
  const last7 = done.filter((s) => days(s.date, today) <= 7);
  const partners = {};
  for (const s of done.filter((x) => x.partner)) (partners[s.partner] ||= []).push(s);
  const withObjective = done.filter((s) => s.objectives.length).length;
  // Mirror coverage: which rivals have we practised against a stand-in for?
  const mirrored = [...new Set(done.map((s) => s.mirrors).filter(Boolean))];
  return { upcoming, overdue, done, last7: last7.length, partners, withObjective, mirrored };
}
