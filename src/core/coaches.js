// Three independent coaches + combined verdict.
// They read the same findings through different lenses and produce different outputs:
//   Coach A (Strategic Analyst)      - game plan, macro, opponent prep. Reads 'strategic' + 'risk'.
//   Coach B (Tactical Execution)     - player- and moment-level corrections. Reads 'execution'.
//   Coach C (Critical Challenger)    - audits A and B: sample size, confounders, alternative
//                                      explanations, and how an opponent would exploit us.
// Coaches are deterministic rule engines: same input, same output, testable, no hidden model.
// Each title supplies an adapter with its own wording and challenge library.

import { confRank } from './evidence.js';

const score = (f) => Math.abs(f.severity) * (1 + confRank(f.confidence));

export function coachA(findings, adapter) {
  const pool = findings.filter((f) => f.lens === 'strategic' || f.lens === 'risk').sort((a, b) => score(b) - score(a));
  const weaknesses = pool.filter((f) => f.severity < 0).slice(0, 4);
  const strengths = pool.filter((f) => f.severity > 0).slice(0, 3);
  const points = [
    ...strengths.map((f) => ({ ref: f.id, stance: 'build-on', text: adapter.planFromStrength(f), confidence: f.confidence })),
    ...weaknesses.map((f) => ({ ref: f.id, stance: 'fix', text: adapter.planFromWeakness(f), confidence: f.confidence })),
  ];
  return { coach: 'A', name: 'Coach A — Strategic Analyst', focus: adapter.focusA, headline: points[0]?.text || 'Not enough strategic evidence yet.', points };
}

export function coachB(findings, adapter) {
  const pool = findings.filter((f) => f.lens === 'execution').sort((a, b) => score(b) - score(a));
  const points = pool.filter((f) => f.severity !== 0).slice(0, 6).map((f) => ({
    ref: f.id, stance: f.severity < 0 ? 'fix' : 'keep', text: adapter.correction(f), at: f.at, confidence: f.confidence,
  }));
  return { coach: 'B', name: 'Coach B — Tactical Execution', focus: adapter.focusB, headline: points[0]?.text || 'No execution evidence in this data.', points };
}

export function coachC(findings, claims, adapter, context = {}) {
  const byId = Object.fromEntries(findings.map((f) => [f.id, f]));
  const challenges = [];
  const contextOnly = [];
  for (const c of claims) {
    const f = byId[c.ref];
    if (!f) continue;
    const reasons = [];
    if (f.n != null && f.n < 6 && f.kind !== 'observed') reasons.push(`rests on ${f.n} game${f.n === 1 ? '' : 's'}`);
    if (f.kind === 'hypothesis') reasons.push('is a hypothesis, not an observation');
    for (const t of f.tags) if (adapter.challenges[t]) reasons.push(adapter.challenges[t]);
    if (context.clubData && f.tags.includes('club')) reasons.push('comes from club games, not this national five playing together');
    if (!reasons.length) continue;
    const onlyContext = reasons.every((r) => adapter.contextReasons?.some((x) => r.includes(x)));
    if (onlyContext) { contextOnly.push(f); continue; }
    const isCtx = (r) => adapter.contextReasons?.some((x) => r.includes(x));
    if (reasons.some((r) => !isCtx(r))) { const keep = reasons.filter((r) => !isCtx(r)); reasons.length = 0; reasons.push(...keep); contextOnly.push(f); }
    const verdict = (f.kind === 'inferred' && f.n != null && f.n < 3) || f.kind === 'hypothesis' ? 'downgrade' : 'caution';
    challenges.push({ ref: f.id, target: c.text, verdict, text: `${adapter.label(f)}: ${reasons.join('; ')}.` });
  }
  if (contextOnly.length) challenges.push({ ref: contextOnly[0].id, refs: contextOnly.map((f) => f.id), target: 'context', verdict: 'caution',
    text: `${contextOnly.length} of the points above come from ${adapter.contextLabel || 'a different context'}: ${contextOnly.slice(0, 3).map((f) => adapter.label(f)).join('; ')}${contextOnly.length > 3 ? '…' : ''}. Treat them as starting hypotheses for scrims.` });
  const exploits = findings.filter((f) => f.lens === 'risk' || (f.severity < 0 && f.lens === 'strategic'))
    .sort((a, b) => score(b) - score(a)).slice(0, 5)
    .map((f) => ({ ref: f.id, text: adapter.exploit(f), confidence: f.confidence }))
    .filter((e, i, arr) => arr.findIndex((x) => x.text === e.text) === i);
  const blind = adapter.blindSpots(findings, context);
  const headline = challenges[0]?.text || exploits[0]?.text || 'No obvious overreach in the other two reads.';
  return { coach: 'C', name: 'Coach C — Critical Challenger', focus: adapter.focusC, headline, challenges, exploits, blindSpots: blind };
}

export function verdict(findings, recs, a, b, c) {
  const downgraded = new Set(c.challenges.filter((x) => x.verdict === 'downgrade').map((x) => x.ref));
  const cautioned = new Set(c.challenges.filter((x) => x.verdict === 'caution').map((x) => x.ref));
  const aRefs = new Set(a.points.map((p) => p.ref));
  const bRefs = new Set(b.points.map((p) => p.ref));

  const consensus = [], disputed = [];
  for (const r of recs) {
    const refs = r.findings || [];
    const down = refs.length && refs.every((id) => downgraded.has(id));
    const raisedBy = [aRefs, bRefs].filter((set) => refs.some((id) => set.has(id))).length;
    if (down) disputed.push({ rec: r, why: 'Coach C: evidence too thin to act on yet — verify on VOD or more games first' });
    else consensus.push({ ...r, raisedBy });
  }
  const disagreements = c.challenges.map((ch) => ({ ref: ch.ref, claim: ch.target, challenge: ch.text, verdict: ch.verdict }));
  const prio = (r) => r.priority * (1 + confRank(r.confidence)) - ((r.findings || []).some((id) => cautioned.has(id)) ? 1 : 0);
  const priorities = [...consensus].sort((x, y) => prio(y) - prio(x)).slice(0, 3);
  return { consensus, disputed, disagreements, priorities, humanReview: 'Coaching staff sign-off required before any change to drafts, roles or tournament plans.' };
}

export function runCoaches(findings, recs, adapter, context) {
  const a = coachA(findings, adapter);
  const b = coachB(findings, adapter);
  const c = coachC(findings, [...a.points, ...b.points], adapter, context);
  return { a, b, c, verdict: verdict(findings, recs, a, b, c) };
}
