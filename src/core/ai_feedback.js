// V1.27 — keeping the AI honest and making it better over time.
// 1) Grounding: every AI line must cite ids that exist in the material it was given, and every number it writes
//    must appear in that material; the hub checks this, not the AI.
// 2) Feedback: staff rate each AI output (useful / not useful / wrong, with a reason) and the hub keeps the
//    before / after when a coach edits an AI draft. These records are what later team preferences and quality
//    reports are built from. Kept with the scouting notes (kind "ai_feedback"): no database change.
import { hasContactNumber } from './pii.js';

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const NUM = /\d+(?:[.,]\d+)?/g;
export const numbersIn = (x) => new Set(JSON.stringify(x ?? '').match(NUM) || []);
export const numbersOk = (text, allowed) => (String(text || '').match(NUM) || []).every((n) => allowed.has(n));
// Keep a cited line only if it cites at least one known id and all its numbers are in the material.
export function grounded(lines, { allowed, ids }) {
  const kept = []; let dropped = 0;
  for (const l of lines || []) {
    const src = (l.sources || []).filter((s) => ids.has(s));
    if (!src.length || !numbersOk(l.text, allowed)) { dropped++; continue; }
    kept.push({ ...l, sources: src });
  }
  return { kept, dropped };
}

export const FEEDBACK_RATINGS = ['useful', 'not useful', 'wrong'];
export const AI_FEATURES = { plan: 'Suggest a focus / drills', debrief: 'Say it once', weekly: 'Weekly trend', meta_extract: 'Meta from text', meta_fit: 'Meta brief',
  prematch: 'Pre-match brief', scout_day: 'Day scouting summary', brainstorm: 'Brainstorm' };
export function aiFeedback({ title, feature, ref, rating, reason = '', by }, now = new Date()) {
  if (!AI_FEATURES[feature]) throw new Error('Unknown AI feature.');
  if (!FEEDBACK_RATINGS.includes(rating)) throw new Error('Pick useful, not useful or wrong.');
  const r = norm(reason).slice(0, 200);
  if (rating === 'wrong' && !r) throw new Error('Say what was wrong (one line): it is how the AI gets better.');
  if (hasContactNumber(r)) throw new Error('Remove phone or ID numbers.');
  if (!norm(by)) throw new Error('Who is giving feedback is required.');
  return { id: `FB-${now.toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`, kind: 'ai_feedback', title, nation: '', feature, ref: norm(ref).slice(0, 120),
    rating, reason: r, by: norm(by), date: now.toISOString().slice(0, 10), at: now.toISOString(), origin: 'operational' };
}
// A coach changed an AI draft before approving it: the change itself is the most useful signal.
export function aiEdit({ title, feature, ref, before, after, by }, now = new Date()) {
  const b = norm(before).slice(0, 600); const a = norm(after).slice(0, 600);
  if (!b || b === a) return null;
  return { ...aiFeedback({ title, feature, ref, rating: 'useful', by }, now), rating: 'edited', before: b, after: a };
}
export const feedbackFor = (records, feature, ref) => records.filter((r) => r.kind === 'ai_feedback' && r.feature === feature && r.ref === ref);
// Per feature: how often the staff found it useful, edited it, or marked it wrong (with the latest reasons).
export function feedbackStats(records, { title = null } = {}) {
  const rows = {};
  for (const r of records.filter((x) => x.kind === 'ai_feedback' && (!title || x.title === title))) {
    const o = (rows[r.feature] ||= { feature: r.feature, label: AI_FEATURES[r.feature] || r.feature, useful: 0, notUseful: 0, wrong: 0, edited: 0, reasons: [] });
    if (r.rating === 'useful') o.useful++; else if (r.rating === 'not useful') o.notUseful++; else if (r.rating === 'wrong') o.wrong++; else if (r.rating === 'edited') o.edited++;
    if (r.reason && r.rating !== 'useful') o.reasons.push({ at: r.at, title: r.title, rating: r.rating, reason: r.reason });
  }
  return Object.values(rows).map((o) => { const rated = o.useful + o.notUseful + o.wrong; return { ...o, rated, usefulShare: rated ? Math.round((o.useful / rated) * 100) : null, reasons: o.reasons.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5) }; })
    .sort((a, b) => b.rated + b.edited - (a.rated + a.edited));
}
