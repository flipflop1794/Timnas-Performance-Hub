// V1.20 AI for coaches, analysts and leadership: the material each AI call gets, and how its answer is
// checked and turned into records. The AI writes only from this material; every number in its text must
// be in the material (core/ai_check.js), and a person approves before anything is published or planned.
import { practiceQuality } from './practice_quality.js';
import { reportSummary, resultText, GAME_SPEC } from './reports.js';
import { weeks, teamTrends } from './trends.js';
import { weaknessCounts } from './weakness.js';
import { shiftDay } from './dates.js';
import { planScrim } from './scrims.js';
import { allowedNumbers, checkLine } from './ai_check.js';

const gap = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const clip = (v, n = 300) => String(v ?? '').slice(0, n);

// ---------------------------------------------------------------- weekly leadership summary
// state: { titles, scrims, reports, cycle, wecMatches, tags }, event: { start, end }
export function summaryMaterial(state, asOf, event) {
  const W = weeks(asOf, 4);
  const pq = practiceQuality(state.titles, state, asOf, 7);
  const titles = state.titles.map((title) => {
    const q = pq.find((r) => r.title === title); const sm = reportSummary(state.reports, title, asOf);
    const spec = GAME_SPEC[title];
    const tr = teamTrends(title, { reports: state.reports }, W).find((m) => m.key === (spec.mode === 'points' ? 'ppm' : 'win'));
    const next = state.wecMatches.filter((m) => m.title === title && m.date >= asOf && !m.result).sort((a, b) => a.date.localeCompare(b.date))[0];
    const overdue = state.scrims.filter((s) => s.title === title && s.followUp && s.followUp.status !== 'Done' && s.followUp.due < asOf).length;
    return {
      title, practice_quality: q.score, practice_quality_change: q.change, sessions_7d: q.sessions,
      record_7d: sm.sessions ? (spec.mode === 'points' ? `${sm.points} points in ${sm.matches} matches` : `${sm.won}-${sm.lost}${sm.drawn ? `-${sm.drawn}` : ''}`) : 'no report',
      plan_followed: sm.progress, results_trend: tr ? tr.verdict : 'no data', overdue_follow_ups: overdue,
      recurring_weaknesses: weaknessCounts(state.tags || [], title, asOf, 14).filter((w) => w.flagged).slice(0, 3).map((w) => `${w.tag} (${w.n} reports)`),
      next_wec_match: next ? `${next.date} vs ${next.opponent}` : 'none entered',
    };
  });
  return { week_ending: asOf, days_to_wec: Math.max(0, gap(asOf, event.start)), wec_dates: `${event.start} to ${event.end}`, titles };
}

// The AI's answer as a draft brief: every line checked against the material.
export function briefFromAi(raw, material, by) {
  const ok = allowedNumbers(material);
  const line = (t) => checkLine(t, ok);
  const r = raw || {};
  return {
    id: `BR-${material.week_ending}`, weekEnding: material.week_ending, status: 'draft', by, at: new Date().toISOString(), origin: 'operational',
    headline: line(r.headline),
    titles: (Array.isArray(r.titles) ? r.titles : []).filter((x) => material.titles.some((t) => t.title === x?.title)).map((x) => ({ title: x.title, ...line(x.line) })),
    attention: (Array.isArray(r.attention) ? r.attention : []).slice(0, 3).map(line),
    nextWeek: (Array.isArray(r.next_week) ? r.next_week : []).slice(0, 3).map(line),
  };
}
// Lines with an unchecked number are left out of the published text.
export function publishBrief(brief, { by }) {
  const keep = (xs) => xs.filter((x) => x.ok && x.text);
  if (!brief.headline?.text) throw new Error('Write a headline first.');
  return { ...brief, status: 'published', publishedBy: by, publishedAt: new Date().toISOString(),
    titles: keep(brief.titles), attention: keep(brief.attention), nextWeek: keep(brief.nextWeek) };
}
export const briefFlagged = (b) => [b.headline, ...b.titles, ...b.attention, ...b.nextWeek].filter((x) => x && !x.ok).length;

// ---------------------------------------------------------------- preparation pack for one WEC match
// card: { observed, hypotheses, vods, banCandidates, tier, plan } from the opponent card; standIn: patterns.standInRecord;
// weaknesses: weaknessCounts rows; reports: latest of the title; book: approved draft book or null; partners: bank.
export function prepMaterial({ match, card = {}, standIn = null, weaknesses = [], reports = [], book = null, partners = [], asOf }) {
  const id = (p, i) => `${p}${i + 1}`;
  return {
    MATCH: { opponent: match.opponent, date: match.date, stage: match.stage || '', days_left: Math.max(0, gap(asOf, match.date)) },
    CARD: [
      ...(card.tier ? [{ id: 'C0', text: `Threat tier: ${card.tier}` }] : []),
      ...(card.observed || []).map((n, i) => ({ id: id('CO', i), text: clip(n.text || n.note) })),
      ...(card.hypotheses || []).map((n, i) => ({ id: id('CH', i), text: clip(`(hypothesis) ${n.text || n.note}`) })),
      ...(card.vods || []).map((v, i) => ({ id: id('CV', i), text: clip(`VOD ${v.event}: ${v.takeaway}`) })),
      ...(card.banCandidates || []).map((b, i) => ({ id: id('CB', i), text: `Ban candidate ${b.hero} (${b.player}, ${b.games} of ${b.of} games)` })),
      ...(card.plan?.status === 'approved' ? [{ id: 'CP', text: clip(`Approved plan: ${(card.plan.keys || []).join('; ')}. Our answer: ${card.plan.ourAnswer}`, 600) }] : []),
    ],
    STANDINS: standIn ? [{ id: 'S1', text: `Scrims vs partners standing in for ${match.opponent}: ${standIn.won}-${standIn.lost} over ${standIn.n} games${standIn.lowSample ? ' (few games)' : ''}; partners ${standIn.partners.join(', ')}${standIn.bansAgainst?.length ? `; they banned ${standIn.bansAgainst.map(([h, n]) => `${h} ${n}x`).join(', ')}` : ''}` }] : [],
    WEAKNESSES: weaknesses.filter((w) => w.n).slice(0, 6).map((w, i) => ({ id: id('W', i), text: `${w.tag}: ${w.n} reports in 14 days${w.rising ? ', rising' : ''}` })),
    REPORTS: reports.slice(0, 8).map((r) => ({ id: r.id, date: r.date, partner: r.partner, result: resultText(r.result), failed: clip(r.failed), adjustment: clip(r.adjust) })),
    BOOK: book ? [{ id: 'B1', text: clip(`Bans ${(book.bans || []).join(', ')}; protect ${(book.protect || []).join(', ')}; flex ${(book.flex || []).join(', ')}`, 400) }] : [],
    PARTNERS: partners.slice(0, 12).map((p, i) => ({ id: id('P', i), name: p.name, level: p.level || '', resembles: p.resembles || '' })),
  };
}
export function packFromAi(raw, material, match, by) {
  const ok = allowedNumbers(material); const r = raw || {};
  const ids = new Set(Object.values(material).filter(Array.isArray).flat().map((x) => x.id).filter(Boolean));
  const srcs = (xs) => (Array.isArray(xs) ? xs : []).filter((s) => ids.has(s));
  const partnerNames = new Set(['internal', ...material.PARTNERS.map((p) => p.name)]);
  const days = material.MATCH.days_left;
  return {
    id: `PP-${match.id}`, title: match.title, matchId: match.id, opponent: match.opponent, matchDate: match.date,
    status: 'draft', by, at: new Date().toISOString(), version: 1, origin: 'operational',
    summary: checkLine(r.summary, ok),
    tendencies: (r.their_tendencies || []).slice(0, 4).map((x) => ({ ...checkLine(x.text, ok), sources: srcs(x.sources) })).filter((x) => x.sources.length),
    focus: (r.our_focus || []).slice(0, 3).map((x) => ({ ...checkLine(x.focus, ok), drill: clip(x.drill), measure: clip(x.measure), sources: srcs(x.sources) })),
    scrims: (r.scrims || []).filter((s) => Number.isInteger(s.day) && s.day >= 1 && s.day <= days && partnerNames.has(s.partner)).slice(0, 4).map((s) => ({ day: s.day, partner: s.partner, focus: clip(s.focus, 200) })),
    watchOut: (r.watch_out || []).slice(0, 3).map((x) => checkLine(x, ok)),
  };
}
// Approved pack → planned sessions (one per suggested scrim), dated from `asOf`.
export function packSessions(pack, { asOf, owner }) {
  if (pack.status !== 'approved') throw new Error('Approve the pack first.');
  return pack.scrims.map((s) => {
    const f = pack.focus.find((x) => x.text === s.focus) || pack.focus[0] || {};
    const internal = s.partner === 'internal';
    return planScrim({ title: pack.title, date: shiftDay(asOf, s.day), kind: internal ? 'team practice' : 'scrim', partner: internal ? '' : s.partner,
      mirrors: internal ? '' : pack.opponent, owner, focus: s.focus || f.text || '', drill: f.drill || '', measure: f.measure || '' });
  });
}
