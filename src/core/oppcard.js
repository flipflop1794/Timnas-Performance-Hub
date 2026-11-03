// Pre-match opponent card: one page per opponent per title, for the opponent brief in the match-day
// runbook. The hub fills what the staff already hold (tier, notes, reviewed VODs, roster, Dota pools);
// the title coach writes the plan. Draft until the title's focus owner (or title coach) approves it.

import { dotaPool } from './rosters.js';

const need = (c, m) => { if (!c) throw new Error(m); };
const LANE = { 1: 'safe lane', 2: 'mid', 3: 'off lane', 4: 'jungle' };

export function autoCard({ title, nation, per, team, data, heroes = {} }) {
  const notes = per?.notes || [];
  const roster = (team?.players || []).map((p) => {
    const pool = title === 'Dota 2' ? dotaPool(nation, p.ign, data) : null;
    return { ign: p.ign, captain: p.captain, role: p.role, club: p.club, flags: p.flags, pool: pool && { n: pool.n, lane: LANE[pool.lane] || '', probable: /^probable/.test(pool.note), top: pool.heroes.slice(0, 4).map((h) => ({ name: heroes[h.hero]?.name || `#${h.hero}`, games: h.games, wins: h.wins })) } };
  });
  // Dota ban candidates follow the scouting rule: each player's most-played hero, only with 15+ games (presence, not win rate).
  const banCandidates = title === 'Dota 2' ? roster.filter((p) => p.pool && p.pool.n >= 15 && p.pool.top.length).map((p) => ({ hero: p.pool.top[0].name, player: p.ign, games: p.pool.top[0].games, of: p.pool.n, probable: p.pool.probable })).sort((a, b) => b.games - a.games) : [];
  const gaps = [];
  if (!roster.length) gaps.push('No roster on file.');
  if (title === 'Dota 2') { const none = roster.filter((p) => !p.pool || !p.pool.n).map((p) => p.ign); if (none.length) gaps.push(`No tournament data since 7.41 for: ${none.join(', ')}.`); }
  if (!notes.length) gaps.push('No staff notes yet.');
  if (!(per?.vods || []).some((v) => v.reviewed)) gaps.push('No reviewed VOD.');
  if (per?.tier === 'not assessed' || !per) gaps.push('Threat tier not set.');
  return { title, nation, tier: per?.tier || 'not assessed', tierWhy: per?.tierWhy || '', tierBy: per?.tierBy || '',
    observed: notes.filter((n) => n.kind === 'observed').slice(0, 5), hypotheses: notes.filter((n) => n.kind === 'hypothesis').slice(0, 3),
    vods: (per?.vods || []).filter((v) => v.reviewed && v.reviewNote).map((v) => ({ event: v.event, url: v.url, takeaway: v.reviewNote })),
    roster, coach: team?.coach || '', banCandidates, scrimsDone: per?.scrimsDone || 0, standIns: (per?.standIns || []).map((p) => p.name), gaps,
    wecMatches: (per?.wecMatches || []).map((m) => ({ date: m.date, stage: m.stage, result: m.result })) };
}

export function cardPlan(x) {
  const keys = (x.keys || []).map((k) => (k || '').trim()).filter(Boolean);
  need(keys.length >= 1, 'Write at least one key point (up to three).');
  need(keys.length <= 3, 'Three key points at most: keep the card short.');
  need(x.ourAnswer && x.ourAnswer.trim(), 'Write our answer (draft, drop plan, map veto or game plan).');
  need(x.by && x.by.trim(), 'Who wrote it is required.');
  const focus = Object.fromEntries(Object.entries(x.focus || {}).map(([k, v]) => [k, (v || '').trim()]).filter(([, v]) => v));
  return { keys, theirPlan: (x.theirPlan || '').trim(), ourAnswer: x.ourAnswer.trim(), focus, by: x.by.trim(), at: new Date().toISOString(), status: 'draft', approvedBy: null, approvedAt: null, origin: 'operational' };
}
export function approveCard(plan, { by }) {
  need(plan, 'Write the plan first.');
  need(by && by.trim(), 'Approver name is required.');
  return { ...plan, status: 'approved', approvedBy: by.trim(), approvedAt: new Date().toISOString() };
}

export function cardMarkdown(a, plan) {
  const L = [];
  L.push(`# ${a.title}: Indonesia vs ${a.nation}`);
  L.push(`Opponent card · ${plan ? (plan.status === 'approved' ? `approved by ${plan.approvedBy}` : `DRAFT by ${plan.by}`) : 'no plan written'} · Internal, Timnas staff and players only.`);
  if (plan) {
    L.push('', '## Three things to know'); plan.keys.forEach((k, i) => L.push(`${i + 1}. ${k}`));
    if (plan.theirPlan) L.push('', '## What they are likely to do', plan.theirPlan);
    L.push('', '## Our answer', plan.ourAnswer);
    if (Object.keys(plan.focus).length) { L.push('', '## One focus per player'); for (const [k, v] of Object.entries(plan.focus)) L.push(`- ${k}: ${v}`); }
  }
  L.push('', `## Their roster${a.coach ? ` (coach ${a.coach})` : ''}`);
  for (const p of a.roster) L.push(`- ${p.ign}${p.captain ? ' (C)' : ''}${p.role ? ` — ${p.role}` : ''}${p.club ? ` · ${p.club}` : ''}${p.pool?.n ? ` · ${p.pool.top.map((h) => `${h.name} ${h.games}`).join(', ')} (${p.pool.n} club games${p.pool.probable ? ', account probable' : ''})` : ''}`);
  if (a.banCandidates.length) { L.push('', '## Most-played heroes (ban candidates, club data)'); for (const b of a.banCandidates) L.push(`- ${b.hero} — ${b.player}, ${b.games} of ${b.of} games${b.probable ? ' (account probable)' : ''}`); }
  L.push('', `## What we know (staff tier: ${a.tier}${a.tierWhy ? ` — ${a.tierWhy}` : ''})`);
  for (const n of a.observed) L.push(`- ${n.note} (${n.source}, ${n.date})`);
  for (const n of a.hypotheses) L.push(`- Unconfirmed: ${n.note} (${n.source})`);
  for (const v of a.vods) L.push(`- VOD ${v.event}: ${v.takeaway}`);
  if (a.gaps.length) { L.push('', '## Gaps'); for (const g of a.gaps) L.push(`- ${g}`); }
  return L.join('\n');
}
