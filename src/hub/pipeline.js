// Turns engine output into evidence + recommendation records with origin and context, and enforces
// the operational/demo boundary. Pure functions: used by the hub page and by the tests.

import { evidence, recommendationRecord, assertOperational, sufficiency } from '../core/records.js';
import { runCoaches } from '../core/coaches.js';
import { buildPools, teamFindings } from '../dota/team.js';
import { analyseMatch, detectSide } from '../dota/match.js';
import { recommendations as dotaRecs, dotaAdapter } from '../dota/training.js';
import { perfFindings, dropFindings, fightFindings } from '../pubgm/analytics.js';
import { recommendations as pubgmRecs, pubgmAdapter } from '../pubgm/training.js';

export const PUBGM_MIN_MATCHES = 6;

const records = (F, R, ctx) => {
  const ev = F.map((f) => evidence(f, ctx));
  if (ctx.origin === 'demo') return { evidence: ev, recs: [], demoRecs: R };
  assertOperational(ev, 'recommendations');
  const recs = [];
  for (const r of R) { try { recs.push(recommendationRecord(r, ev)); } catch { /* recommendation without linked evidence is dropped */ } }
  return { evidence: ev, recs, demoRecs: [] };
};

export function dotaTeamPipeline(players, heroes, asOf, retrieved) {
  const P = buildPools(players, heroes, asOf);
  const F = teamFindings(P, players, asOf);
  const R = dotaRecs(F);
  const out = records(F, R, { source: 'OpenDota player tournament matches', retrieved, origin: 'operational', context: 'club', patch: '7.41', window: 'since 24 Mar 2026 (patch 7.41)',
    completeness: 'All tournament-lobby games of the five accounts; pubs, ranked and private scrims not included.',
    limitations: ['Club games, not the national five together.'] });
  return { pools: P, findings: F, ...out, coach: runCoaches(F, R, dotaAdapter, { clubData: true, matchupsLoaded: false }) };
}

export function matchContext(match, accounts) {
  const s = detectSide(match, accounts);
  if (!s.side) return { context: null, tracked: 0 };
  return { context: s.count >= 5 && !s.split ? 'national' : s.count >= 3 ? 'mixed' : 'club', tracked: s.count, split: s.split };
}

export function dotaMatchPipeline(rec, accounts, heroes) {
  const { m } = rec;
  const mc = matchContext(m, accounts);
  const a = analyseMatch(m, accounts, heroes);
  const R = dotaRecs(a.findings);
  const lim = [];
  if (!m.parsed) lim.push('Replay not parsed: fights, timelines and lane gold missing.');
  if (mc.context !== 'national') lim.push(`${mc.tracked}/5 national players in this match: club context, not national-team performance.`);
  const out = records(a.findings, R, { source: `OpenDota match ${m.id}`, retrieved: rec.retrieved || 'not recorded', origin: rec.origin || 'operational', context: mc.context, patch: m.patch ? `OpenDota patch ${m.patch}` : null,
    window: 'one match', completeness: m.parsed ? 'Parsed replay' : 'Basic match data only', limitations: lim });
  return { analysis: a, context: mc, ...out, coach: runCoaches(a.findings, R, dotaAdapter, { clubData: mc.context !== 'national', matchupsLoaded: false }) };
}

export function pubgmPipeline({ rows, fights, team, sc, origin, scoringId }) {
  if (origin === 'operational') { assertOperational(rows, 'PUBGM match rows'); assertOperational(fights, 'PUBGM fight rows'); }
  const mine = rows.filter((r) => r.team === team);
  const matches = new Set(mine.map((r) => r.match_id)).size;
  const insufficient = matches < PUBGM_MIN_MATCHES
    ? `${matches} logged match${matches === 1 ? '' : 'es'} for ${team || 'our team'}; at least ${PUBGM_MIN_MATCHES} are needed before team-level findings or objectives are shown.` : null;
  if (insufficient) return { insufficient, evidence: [], recs: [], demoRecs: [], findings: [], drops: { table: [], findings: [] }, ff: { rows: [], findings: [] }, coach: null, matches };
  const drops = dropFindings(rows, team, sc);
  const ff = fightFindings(fights, team);
  const F = [...perfFindings(rows, team, sc), ...drops.findings, ...ff.findings];
  const R = pubgmRecs(F);
  const lim = [`Scoring profile ${scoringId}: ${sc.status}.`];
  if (!fights.length) lim.push('No fights logged: fight quality not assessed.');
  const out = records(F, R, { source: origin === 'demo' ? 'Synthetic demo log' : 'Staff scrim log', retrieved: 'logged in hub', origin, context: origin === 'demo' ? 'demo' : 'national',
    window: `${matches} matches`, completeness: 'Staff-entered rows; no positional data.', limitations: lim });
  return { insufficient: null, findings: F, drops, ff, matches, ...out, coach: runCoaches(F, R, pubgmAdapter, { synthetic: origin === 'demo', fightsLogged: fights.length > 0 }) };
}

// Today: reviewed objectives first; then engine proposals, clearly marked as proposed.
export function todayList(cycleObjs, proposals, title, limit = 3) {
  const active = cycleObjs.filter((o) => o.title === title && ['accepted', 'modified'].includes(o.status));
  const pending = cycleObjs.filter((o) => o.title === title && o.status === 'proposed');
  const taken = new Set([...active, ...pending].map((o) => o.rec.problem));
  const fresh = proposals.filter((r) => r.sufficient && !taken.has(r.problem)).map((r) => ({ kind: 'engine-proposal', rec: r }));
  return [
    ...active.map((o) => ({ kind: 'reviewed', obj: o })),
    ...pending.map((o) => ({ kind: 'awaiting-review', obj: o })),
    ...fresh,
  ].slice(0, limit);
}

export { sufficiency };
