// PUBG Mobile: findings -> drills, and the coach adapter.

import { recommendation, confRank } from '../core/evidence.js';

const RULES = [
  { when: (f) => f.tags.includes('zone34'), make: () => ({ area: 'survival', priority: 3,
    problem: 'Low survival after zone 3.',
    explanation: 'Reaching zone 3 and then going out costs the placement points that decide standings. Typical causes: late rotation into the third circle, holding a compound that the next circle cuts off, or taking a fight while rotating.',
    drill: 'Zone 3–5 scenario scrims: 6 reps per session starting at the zone-3 announce (custom room with fixed circles). The IGL calls the rotation within 20 s of the announce; one player owns vehicle and utility for the move.',
    success: 'Alive at zone 5 in 4 of 6 reps; rotation started ≤ 20 s after announce in every rep (timed on VOD).' }) },
  { when: (f) => f.tags.includes('early-exit'), make: () => ({ area: 'survival', priority: 3,
    problem: 'Too many matches end before zone 3.',
    explanation: 'Early exits give zero placement points and hand eliminations to other teams.',
    drill: 'Off-angle drop plan per map (one secondary drop per map, uncontested in the last 20 scrims) and a rule: no third-party engagement before zone 2 closes unless the opponent is already knocked.',
    success: 'Out before zone 3 in ≤ 15% of the next 20 scrim matches.' }) },
  { when: (f) => f.tags.includes('drop') && f.severity <= -2, make: (f) => ({ area: 'drop', priority: 3,
    problem: `Losing a contested drop: ${f.data?.spot}.`,
    explanation: 'A drop contested every other game that often ends in zone 1 is a coin flip on placement points.',
    drill: `Two-option drop drill for ${f.data?.spot}: rehearse the landing split (who lands where, first 30 s weapon routes) in 4 custom drops per session, AND a pre-agreed fallback drop when two or more teams are seen on the flight path.`,
    success: `Zone-1 exits from ${f.data?.spot} below 20% across the next 10 drops there, or the drop is replaced.` }) },
  { when: (f) => f.tags.includes('conversion'), make: () => ({ area: 'fights', priority: 2,
    problem: 'Knocks are not converted into finishes.',
    explanation: 'Every knock that is revived gives the enemy team its points back and often a counter-fight.',
    drill: 'Knock-confirm drill in TDM/custom: 2v2 rounds where a knock only scores if finished within 10 s; utility (grenade/smoke) assigned to the second player.',
    success: 'Knock → finish conversion ≥ 70% over the next 5 scrim days.' }) },
  { when: (f) => f.tags.includes('third-party') || f.tags.includes('fight-selection'), make: () => ({ area: 'fights', priority: 2,
    problem: 'Fight selection exposes us to third parties.',
    explanation: 'Fights we start in the open, or keep going after the first exchange, are the ones that get third-partied.',
    drill: 'Pre-fight checklist called by the IGL: cover available, nearest other team known, exit route. Scrim rule: disengage after 20 s without a knock. Staff log every fight with the 4 tags in the hub.',
    success: 'Avoidable fights ≤ 1 per scrim day; third-party losses of 2+ players halved over 5 days.' }) },
  { when: (f) => f.tags.includes('zone-entry'), make: () => ({ area: 'rotation', priority: 2,
    problem: 'Late or forced zone entries.',
    explanation: 'Entering after the edge has filled leaves only open ground and chokepoints held by others.',
    drill: 'Rotation timing drill: on each zone announce the analyst records the move-start time; target set per phase (e.g. zone 2 within 45 s). Vehicle secured before zone 2 every match.',
    success: 'Late/forced entries in ≤ 25% of the next 20 matches.' }) },
  { when: (f) => f.tags.includes('vehicle'), make: (f) => ({ area: 'rotation', priority: 1,
    problem: f.title,
    explanation: 'Without a vehicle by 3:00 the first rotation depends on circle luck.',
    drill: 'Fixed vehicle spawn check route for this drop, rehearsed in custom rooms.',
    success: 'Vehicle by 3:00 in 8 of the next 10 drops here.' }) },
  { when: (f) => f.tags.includes('map') && f.severity < 0, make: (f) => ({ area: 'maps', priority: 1,
    problem: f.title,
    explanation: 'One weak map drags the standings even if the others are strong.',
    drill: 'Extra scrim block on the weak map with a fresh drop and rotation plan reviewed by the coach.',
    success: 'Points per match on that map within 3 of the team average over the next 8 matches there.' }) },
];

export function recommendations(findings) {
  const out = [], seen = new Set();
  for (const r of RULES) for (const f of findings) {
    if (!r.when(f)) continue;
    const m = r.make(f); const key = `${m.area}:${m.problem}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push(recommendation({ ...m, evidence: [f.title, ...(f.detail ? [f.detail] : [])], confidence: f.confidence, findings: [f.id] }));
  }
  return out.sort((a, b) => b.priority * (1 + confRank(b.confidence)) - a.priority * (1 + confRank(a.confidence)));
}

export const pubgmAdapter = {
  focusA: 'Points strategy, drops, rotations, zone management and standings.',
  focusB: 'Fights: initiation, knock conversion, utility, spacing, revives.',
  focusC: 'Sample size, scoring-profile assumptions, circle luck, and how other teams exploit us.',
  label: (f) => f.title,
  planFromStrength: (f) => `Keep doing it: ${f.title}.`,
  planFromWeakness: (f) => ({ survival: `Survival plan: ${f.title}.`, drop: `Drop decision: ${f.title}.`, rotation: `Rotation timing: ${f.title}.`, placement: `Placement points are the gap: ${f.title}.`, elims: `Elimination points are the gap: ${f.title}.` }[f.area] || `Address: ${f.title}.`),
  correction: (f) => `${f.title}${f.detail ? `. ${f.detail}` : ''}`,
  exploit: (f) => ({ drop: 'Other teams that see us at this drop will keep contesting it.', 'third-party': 'Teams holding the next circle will wait for our fight to start and third-party it.', lobby: 'Strong lobbies punish our weaker phases; expect WEC to be one.' }[f.tags.find((t) => ['drop', 'third-party', 'lobby'].includes(t))] || `Opponent angle: ${f.title}.`),
  contextLabel: 'a scoring table that is not the WEC table',
  contextReasons: ['scoring profile'],
  challenges: {
    'scoring-profile': 'totals depend on the scoring profile, and the WEC table is not published',
    drop: 'drop outcomes depend on the flight path, which changes every match',
    'edge-center': 'edge vs centre is decided largely by where the circle lands (circle luck)',
    zone34: 'zone 3–4 exits mix rotation errors with bad circles; tag circle luck in the log',
    map: 'per-map samples are small',
    lobby: 'lobby strength is a staff estimate (1–5), not a rating',
  },
  blindSpots: (findings, ctx) => {
    const out = [];
    if (ctx.synthetic) out.push('Demo data is SYNTHETIC: it shows how the engine works, not how Indonesia plays.');
    if (!ctx.fightsLogged) out.push('No fight log: teamfight quality is invisible until staff annotate fights.');
    out.push('No positional data is available: drop, rotation and zone analysis rely on staff tags, not coordinates.');
    out.push('Future safe zones cannot be predicted; plans are conditional on the circle.');
    return out;
  },
};
