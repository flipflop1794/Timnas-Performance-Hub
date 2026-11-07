// Shared record structures for the coaching cycle (V1.1).
// Every dataset and every piece of evidence carries an origin. Only 'operational' records may
// feed summaries, recommendations, objectives or metrics. 'demo' records exist to show and test
// the software, and are blocked from every operational path by assertOperational().

export const ORIGINS = ['operational', 'demo'];
// Roster context of the evidence: whose games are these?
//   national - the national roster playing together (pelatnas scrim or official match, 5/5 tracked)
//   mixed    - some national players together (3-4 tracked), e.g. a club match with several of them
//   club     - individual players' club games
//   demo     - invented data
export const CONTEXTS = ['national', 'mixed', 'club', 'demo'];
export const CONTEXT_LABEL = {
  national: 'National team', mixed: 'Partial roster (club match)', club: 'Club games, not the national team', demo: 'DEMO — not real',
};

export class DemoLeakError extends Error {}

export function assertOperational(items, where) {
  const bad = (items || []).filter((x) => !x || x.origin !== 'operational');
  if (bad.length) throw new DemoLeakError(`${where}: ${bad.length} non-operational record(s) blocked (origin ${[...new Set(bad.map((b) => b?.origin ?? 'missing'))].join(', ')}).`);
  return items;
}

export function tagOrigin(rows, origin) {
  if (!ORIGINS.includes(origin)) throw new Error(`bad origin ${origin}`);
  return rows.map((r) => ({ ...r, origin }));
}

// Evidence record: a finding plus the context needed to judge it.
export function evidence(finding, ctx) {
  const req = ['source', 'retrieved', 'origin', 'context'];
  for (const k of req) if (!ctx[k]) throw new Error(`evidence missing ${k}`);
  if (!ORIGINS.includes(ctx.origin)) throw new Error(`bad origin ${ctx.origin}`);
  if (!CONTEXTS.includes(ctx.context)) throw new Error(`bad context ${ctx.context}`);
  if (ctx.origin === 'demo' && ctx.context !== 'demo') throw new Error('demo evidence must have demo context');
  return {
    ...finding,
    source: ctx.source, retrieved: ctx.retrieved, origin: ctx.origin, context: ctx.context,
    window: ctx.window || null, patch: ctx.patch || null,
    completeness: ctx.completeness || 'not stated', limitations: [...(ctx.limitations || [])],
    sample: finding.n,
  };
}

// Minimum evidence before a recommendation may be proposed as a practice objective.
// Below it, the hub proposes "gather more evidence" instead of a drill.
export const MIN_SAMPLE = { observed: 1, inferred: 6, hypothesis: Infinity };
export function sufficiency(ev) {
  const need = MIN_SAMPLE[ev.kind] ?? 6;
  if (ev.kind === 'hypothesis') return { ok: false, reason: 'A hypothesis needs VOD review or more games before it becomes a practice objective.' };
  if (ev.n != null && ev.n < need) return { ok: false, reason: `Only ${ev.n} game(s) behind this; at least ${need} needed before it drives practice.` };
  if (ev.confidence === 'Blocked') return { ok: false, reason: 'Required data is missing.' };
  return { ok: true, reason: null };
}

// Recommendation record (engine output + uncertainty + linked evidence ids).
export function recommendationRecord(rec, evidences) {
  const linked = evidences.filter((e) => (rec.findings || []).includes(e.id));
  if (!linked.length) throw new Error(`recommendation "${rec.problem}" has no linked evidence`);
  assertOperational(linked, 'recommendation');
  const suff = linked.map(sufficiency);
  const contexts = [...new Set(linked.map((e) => e.context))];
  const uncertainty = [
    ...suff.filter((s) => !s.ok).map((s) => s.reason),
    ...(contexts.includes('club') ? ['Based on club games: it may not hold for the national five together.'] : []),
    ...(contexts.includes('mixed') ? ['Based on a club match with part of the roster.'] : []),
    ...linked.flatMap((e) => e.limitations),
  ];
  return {
    problem: rec.problem, drill: rec.drill, success: rec.success, explanation: rec.explanation,
    priority: rec.priority, confidence: rec.confidence, area: rec.area,
    evidence: linked.map((e) => ({ id: e.id, title: e.title, kind: e.kind, n: e.n, context: e.context, source: e.source, retrieved: e.retrieved, at: e.at ?? null })),
    contexts, sufficient: suff.every((s) => s.ok), uncertainty: [...new Set(uncertainty)],
  };
}

// A coach's own observation as evidence (titles without an engine, VOD notes).
import { confidenceFromN } from './evidence.js';
import { localDay } from './dates.js';
let obsSeq = 0;
export function staffObservation({ title, observation, source, kind = 'observed', n, context, by, date }) {
  if (!observation || !observation.trim()) throw new Error('Write the observation.');
  if (!source || !source.trim()) throw new Error('Name the source (scrim ID, VOD link, match).');
  if (!by || !by.trim()) throw new Error('Who observed it is required.');
  if (!CONTEXTS.includes(context) || context === 'demo') throw new Error('Choose national, mixed or club context.');
  const games = n === '' || n == null ? null : +n;
  if (games != null && (!Number.isInteger(games) || games < 1)) throw new Error('Games must be a whole number of 1 or more, or left empty.');
  const id = `OBS-${Date.now().toString(36)}-${++obsSeq}`;
  return evidence({ id, title: observation.trim(), kind, n: games, confidence: kind === 'hypothesis' ? 'Low' : confidenceFromN(games ?? 1), severity: -1, lens: 'strategic', area: 'staff', tags: ['staff'], detail: `${title} · observed by ${by.trim()}`, at: null },
    { source: source.trim(), retrieved: date || localDay(), origin: 'operational', context, window: games ? `${games} game(s)` : 'not stated', completeness: 'Staff observation', limitations: games == null ? ['Number of games not stated.'] : [] });
}
