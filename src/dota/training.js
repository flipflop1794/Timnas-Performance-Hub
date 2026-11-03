// Dota 2: findings -> training recommendations, and the coach adapter.
// Drills are specific enough to drop into a scrim block; success criteria are measurable in
// the next block of comparable scrims (see core/measure.js).

import { recommendation, confRank } from '../core/evidence.js';
import { mmss } from '../core/stats.js';

const RULES = [
  { when: (f) => f.tags.includes('post-objective') && f.severity < 0,
    make: (f) => ({ area: 'objectives', priority: 3,
      problem: 'Map control collapses around Roshan.',
      explanation: 'After the enemy Aegis our buildings fall inside three minutes, which points to no pre-set defensive formation and late vision reset after the objective.',
      drill: 'Scrim block "Aegis minus 3": from 20:00, the opponent team is given Aegis by agreement. Our side practises a fixed retreat-and-defend formation, re-wards the two Roshan-side high grounds within 45 s, and calls a single buyback rule. 4 reps per session.',
      success: 'Buildings lost within 3 min of an enemy Roshan: 0 in at least 3 of 4 reps across two sessions.' }) },
  { when: (f) => f.tags.includes('lead-conversion'),
    make: (f) => ({ area: 'lategame', priority: 3,
      problem: 'Leads are not converted into high ground.',
      explanation: 'A large net-worth lead was given back. In Dota that is usually a sieging problem (no waveclear or Aegis timing) or a single over-extension; the VOD decides which.',
      drill: 'Start scrims from a fixed +8k state (custom lobby or agreed scenario): siege with Aegis only, two waves max per attempt, retreat call owned by one player. Review each failed siege for the first death.',
      success: 'High-ground taken without losing the lead in 3 of 5 attempts; first death of each failed siege tagged.' }) },
  { when: (f) => f.area === 'laning' && f.lens === 'execution' && f.severity < 0,
    make: (f) => ({ area: 'laning', priority: 2,
      problem: `Lane lost early: ${f.title}.`,
      explanation: 'A 10-minute gold deficit in one lane forces the draft plan off course before the first big objective.',
      drill: `10-minute lane reps for ${f.data?.player || 'the player'}: same lane matchup vs a sparring lane, scored on last hits and gold at 10. 6 reps, swap the support pairing every 2.`,
      success: 'Gold at 10:00 within ±400 of the sparring lane in 4 of 6 reps.' }) },
  { when: (f) => f.area === 'fights' && f.severity <= -2 && f.n > 1,
    make: (f) => ({ area: 'fights', priority: 2,
      problem: 'More teamfights lost than won.',
      explanation: 'Losing fights by deaths, not just by gold, suggests engagement choice or follow-up timing rather than itemisation.',
      drill: 'VOD-led fight review of every fight lost by 3+ deaths, then a 30-min scrim block where every engagement must be called by the pos 4 with a 3-second countdown; fights without a call are logged as errors.',
      success: 'Fights won ≥ fights lost across the next 3 scrims; un-called engagements tagged ≤ 2 per game.' }) },
  { when: (f) => f.area === 'synergy' && f.severity < 0,
    make: (f) => ({ area: 'synergy', priority: 3,
      problem: 'The five have not played tournament Dota together.',
      explanation: 'Every pool and habit above comes from different clubs. Comms, timings and lane pairings must be built from zero.',
      drill: 'Scrim volume first: at least 2 full scrims per day in camp week 1 with fixed lane pairings; log each scrim match ID in the hub so post-match analysis replaces club data.',
      success: '20 logged scrims with all five by the end of week 1; post-match reports run on each.' }) },
  { when: (f) => f.tags.includes('idle'),
    make: (f) => ({ area: 'form', priority: 2,
      problem: f.title,
      explanation: 'Long breaks reduce mechanical sharpness and patch familiarity; the pool data for this player is ageing.',
      drill: 'Ranked/pub volume plan agreed with the player before camp, plus 2 scrims per day once in camp; track his hero pool refresh in the hub.',
      success: 'At least 15 logged games in the 2 weeks before camp.' }) },
  { when: (f) => f.area === 'vision' && f.severity < 0,
    make: (f) => ({ area: 'vision', priority: 1,
      problem: 'Ward output below the opponent.',
      explanation: 'Fewer observers than the enemy usually means supports are stuck in lane or dying before placing.',
      drill: 'Support pair warding plan per side with timings (pre-Roshan, pre-smoke); review the ward map after each scrim.',
      success: 'Observer count within 20% of the opponent in 3 straight scrims.' }) },
  { when: (f) => f.area === 'items' && f.severity < 0,
    make: (f) => ({ area: 'items', priority: 1,
      problem: f.title,
      explanation: 'A late core item delays the power spike the draft was built around. The lane result and farm pattern usually explain it.',
      drill: 'Farm-route review for the core in question; target timing set by the title coach and checked in the next 5 scrims.',
      success: 'Key item within 2 min of the agreed target in 4 of 5 scrims.' }) },
];

export function recommendations(findings) {
  const out = [], seen = new Set();
  // Ban vulnerability is grouped into one action for all affected players.
  const bv = findings.filter((f) => f.tags.includes('ban-vulnerable'));
  if (bv.length) {
    const worst = [...bv].sort((a, b) => a.title.localeCompare(b.title));
    out.push(recommendation({ area: 'draft', priority: 2,
      problem: `Shallow pools under targeted bans: ${bv.map((f) => f.data.player).join(', ')}.`,
      evidence: bv.map((f) => `${f.title} (${f.detail})`),
      explanation: 'Rivals read the same public data. Three first-phase bans on one player would force a weak hero or a role swap, and a coach who sees this will plan for it.',
      drill: `Ban-stress mock drafts (2 per day, 20 min): each session bans out one player's top 3 (${worst.map((f) => `${f.data.player}: ${f.data.lost.join('/')}`).join('; ')}) and the five draft and scrim around it. Each listed player adds two fallback heroes agreed with the title coach.`,
      success: 'Every listed player has 2 more heroes with 6+ logged games in the last 120 days (scrims included) before the final camp week; ban-stress scrims won at ≥ the team\'s normal scrim rate.',
      confidence: bv.every((f) => f.confidence === 'High') ? 'Medium' : 'Low', findings: bv.map((f) => f.id) }));
  }
  for (const r of RULES) for (const f of findings) {
    if (!r.when(f)) continue;
    const m = r.make(f);
    const key = `${m.area}:${m.problem}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push(recommendation({ ...m, evidence: [`${f.title}${f.at != null ? ` (${mmss(f.at)})` : ''}`, ...(f.detail ? [f.detail] : [])], confidence: f.confidence, findings: [f.id] }));
  }
  return out.sort((a, b) => b.priority * (1 + confRank(b.confidence)) - a.priority * (1 + confRank(a.confidence)));
}

export const dotaAdapter = {
  focusA: 'Game plan, draft strategy, objectives and opponent preparation.',
  focusB: 'Lane execution, fights, item timings, vision and individual decisions.',
  focusC: 'Sample size, club-vs-national context, alternative explanations, how the opponent exploits us.',
  label: (f) => f.title,
  planFromStrength: (f) => `Build around it: ${f.title}.`,
  planFromWeakness: (f) => ({
    roles: `Settle roles first: ${f.title}.`, draft: `Draft around it: ${f.title}.`, objectives: `Objective plan needed: ${f.title}.`,
    lategame: `Closing plan needed: ${f.title}.`, synergy: `Scrim volume before strategy: ${f.title}.`, midgame: `Mid-game window to fix: ${f.title}.`,
  }[f.area] || `Address: ${f.title}.`),
  correction: (f) => `${f.at != null ? `${mmss(f.at)} — ` : ''}${f.title}${f.detail ? `. ${f.detail}` : ''}`,
  exploit: (f) => ({
    'ban-vulnerable': `A rival scout will ban out ${f.data?.lost?.join(', ')} first phase.`,
    'post-objective': 'Opponents who take Roshan can expect our buildings to fall straight after.',
    synergy: 'Opponents can play for long, structured games where our lack of shared comms shows.',
    idle: 'An opponent can target the out-of-practice player\'s lane early.',
    laning: 'Opponents who see a weak early game will draft lane pressure and dive towers before 10:00.',
    objectives: 'Opponents will start Roshan early, expecting no contest.',
    midgame: `Opponents can force the same window again: ${f.title}.`,
    lategame: 'Opponents can play for a long game and wait for a high-ground mistake.',
    roles: 'Opponents will target the uncovered role in lane.',
  }[[...f.tags, f.area].find((t) => ['ban-vulnerable', 'post-objective', 'synergy', 'idle', 'laning', 'objectives', 'midgame', 'lategame', 'roles'].includes(t))] || `Opponent angle: ${f.title}.`),
  contextLabel: 'one club match or club games, not the national five together — check whether they repeat in pelatnas scrims',
  contextReasons: ['club context', 'comes from club games', 'one match only'],
  challenges: {
    'single-match': 'one match only — it may not repeat',
    club: 'club context (different teammates, different strategy)',
    'lane-matchup': 'lane result depends on the matchup drafted; compare like-for-like lanes',
    'item-timing': 'item timing follows lane result and draft priority, not only farming skill',
    form: 'form swings this size are common in 20–40 game samples',
    deaths: 'support deaths are often by design',
    pool: 'pool counts include old patches of 7.41 and many opponents of mixed strength',
  },
  blindSpots: (findings, ctx) => {
    const out = [];
    if (!findings.some((f) => f.area === 'objectives')) out.push('No objective data in this view: Roshan and tower habits are unknown.');
    if (ctx.clubData) out.push('Everything here is club data; the national five have no shared tournament games. Treat strengths as hypotheses until scrims confirm them.');
    if (!ctx.matchupsLoaded) out.push('Counterpick and synergy are not scored (no matchup table loaded); do not read draft suggestions as counter advice.');
    out.push('IESF draft rules and patch for WEC are not published; the draft order is the 7.41 pro order.');
    return out;
  },
};
