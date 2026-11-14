// V1.25 WEC scouting, Phase 1 (no AI): a fast live scouting log, an opponent brief per nation and a one-page
// pre-match brief that the coach approves before it is shared. Everything is assembled from records in the hub:
// the opponent card, public results, rosters, notes, VODs, stand-in scrims, the draft book and the live log.
// Counts are shown with their size; nothing is predicted. Live entries and approved briefs are kept with the
// scouting notes (kinds "live" and "brief"), so they never count as scouting notes or coverage.
import { FIELDS } from './competitors.js';
import { hasContactNumber } from './pii.js';
import { localDay } from './dates.js';

const need = (c, m) => { if (!c) throw new Error(m); };
export const LIVE_TYPES = ['pick', 'ban', 'strategy', 'player', 'tendency', 'note'];
export const LIVE_PHASES = ['draft', 'early', 'mid', 'late', 'whole match'];
export const LIVE_TEXT_MAX = 200;
export const POINT_MAX = 160;
const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const key = (s) => norm(s).toLowerCase();

// One observation while watching an opponent. The id is made on the phone so a retry never makes a duplicate.
export function liveEntry(x, now = new Date()) {
  need(FIELDS[x.title], 'Pick a title.');
  need(FIELDS[x.title].includes(x.nation), `${x.nation || 'Nation'} is not in the published ${x.title} field.`);
  need(LIVE_TYPES.includes(x.type), 'Pick what you saw (pick, ban, strategy, player, tendency or note).');
  const hero = norm(x.hero); const text = norm(x.text);
  if (x.type === 'pick' || x.type === 'ban') need(hero, 'Type the hero, map or item they picked or banned.');
  else need(text, 'Write what you saw (one line).');
  if (x.type === 'player') need(norm(x.player), 'Name the player.');
  need(text.length <= LIVE_TEXT_MAX, `Keep it short (${LIVE_TEXT_MAX} characters at most).`);
  need(!hasContactNumber(`${text} ${hero}`), 'Remove phone or ID numbers; performance notes only.');
  const t = norm(x.t); need(!t || TIME.test(t), 'Time must look like 12:30 (or leave it empty).');
  need(!x.phase || LIVE_PHASES.includes(x.phase), 'Pick a phase.');
  need(norm(x.by), 'Who logged it is required.');
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return { id: `LV-${stamp}-${Math.random().toString(36).slice(2, 7)}`, kind: 'live', title: x.title, nation: x.nation, match: norm(x.match).slice(0, 80),
    matchId: x.matchId || '', type: x.type, phase: x.phase || '', hero, player: norm(x.player).slice(0, 40), text, t, by: norm(x.by),
    date: localDay(now), at: now.toISOString(), origin: 'operational' };
}
export const liveOf = (records, title, nation, date = null) => records.filter((r) => r.kind === 'live' && r.title === title && r.nation === nation && (!date || r.date === date))
  .sort((a, b) => String(b.at).localeCompare(String(a.at)));

// What repeats in the live log: picks and bans per hero, strategies and tendencies by wording, players named.
export function liveSummary(entries) {
  const tally = (xs, f) => { const m = new Map(); for (const x of xs) { const k = key(f(x)); if (!k) continue; const o = m.get(k) || { label: norm(f(x)), n: 0, matches: new Set() }; o.n++; o.matches.add(x.match || x.date); m.set(k, o); } return [...m.values()].map((o) => ({ label: o.label, n: o.n, matches: o.matches.size })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)); };
  return {
    n: entries.length, matches: new Set(entries.map((e) => e.match || e.date)).size,
    picks: tally(entries.filter((e) => e.type === 'pick'), (e) => e.hero), bans: tally(entries.filter((e) => e.type === 'ban'), (e) => e.hero),
    strategies: tally(entries.filter((e) => e.type === 'strategy' || e.type === 'tendency'), (e) => e.text),
    players: tally(entries.filter((e) => e.type === 'player'), (e) => e.player).map((p) => ({ ...p, notes: entries.filter((e) => e.type === 'player' && key(e.player) === key(p.label)).map((e) => e.text).slice(0, 3) })),
    notes: entries.filter((e) => e.type === 'note').map((e) => e.text).slice(0, 5),
  };
}

// Opponent brief: what is known (with its source), what is still to confirm, and what to watch for.
// card: oppcard.autoCard output; standIn: patterns.standInRecord (or null); book: the approved draft book (or null).
export function opponentBrief({ title, nation, card, live = [], standIn = null, book = null, rosterChanged = null, days = [] }) {
  const known = []; const tbd = []; const watch = [];
  const L = liveSummary(live);
  // V1.27: approved end-of-day summaries feed the next briefs.
  for (const d of days.filter((x) => x.kind === 'scout_day' && x.title === title && x.nation === nation).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2))
    for (const t of d.lines.slice(0, 3)) known.push({ text: `${d.date}: ${t}`, src: `Day summary, approved by ${d.approvedBy}` });
  if (card.tier && card.tier !== 'not assessed') known.push({ text: `Staff tier: ${card.tier}${card.tierWhy ? ` — ${card.tierWhy}` : ''}`, src: card.tierBy || 'staff' });
  if (card.roster?.length) known.push({ text: `Roster: ${card.roster.map((p) => `${p.ign}${p.captain ? ' (C)' : ''}`).join(', ')}${card.coach ? `; coach ${card.coach}` : ''}`, src: 'Rosters (wec.iesf.org)' });
  if (rosterChanged) watch.push({ text: `Roster changed on ${rosterChanged.date}: in ${rosterChanged.added.join(', ') || '—'}; out ${rosterChanged.removed.join(', ') || '—'}. Older scouting may be about other players.`, src: 'Roster check' });
  for (const n of (card.observed || []).slice(0, 4)) known.push({ text: n.note, src: `${n.source}, ${n.date}${n.stale ? ' (old: re-check)' : ''}` });
  for (const r of (card.results || []).slice(0, 3)) (r.check ? tbd : known).push({ text: `${r.event} (${r.date}): ${r.result}${r.check ? ' — to confirm' : ''}`, src: r.source });
  for (const v of card.vods || []) known.push({ text: `VOD ${v.event}: ${v.takeaway}`, src: 'Reviewed VOD' });
  if (standIn?.n) known.push({ text: `Our scrims against stand-ins for ${nation}: ${standIn.won}-${standIn.n - standIn.won} in ${standIn.n} game(s)${standIn.lowSample ? ' (small sample: a hint, not a conclusion)' : ''}`, src: 'Confirmed scrim games' });
  if (book) known.push({ text: `Approved draft book (version ${book.version || 1})`, src: `Draft Room, approved by ${book.approvedBy || '—'}` });
  for (const g of card.gaps || []) tbd.push({ text: g, src: 'Opponent card' });
  if (!live.length) tbd.push({ text: 'No live observation yet.', src: 'Live scouting' });
  for (const h of card.hypotheses || []) watch.push({ text: `Unconfirmed: ${h.note}`, src: h.source });
  for (const b of (card.banCandidates || []).slice(0, 3)) watch.push({ text: `${b.player} plays ${b.hero} most (${b.games} of ${b.of} club games)`, src: 'OpenDota (club data)' });
  for (const p of L.picks.filter((x) => x.n >= 2).slice(0, 4)) watch.push({ text: `Picked ${p.label} ${p.n}× (${p.matches} match${p.matches === 1 ? '' : 'es'})`, src: 'Live scouting' });
  for (const b of L.bans.filter((x) => x.n >= 2).slice(0, 4)) watch.push({ text: `Banned ${b.label} ${b.n}×`, src: 'Live scouting' });
  for (const s of L.strategies.filter((x) => x.n >= 2).slice(0, 4)) watch.push({ text: `${s.label} (seen ${s.n}×)`, src: 'Live scouting' });
  return { title, nation, known, tbd, watch, live: L };
}

// One-page pre-match brief: the opponent brief plus today's live observations. The three key points are
// suggestions from the records; the coach edits and approves them before anything is shared.
export function preMatchBrief({ match, brief, liveToday = [] }) {
  const T = liveSummary(liveToday);
  const all = brief.live;
  const likely = [
    ...all.picks.slice(0, 5).map((p) => ({ text: `Pick: ${p.label}`, n: p.n })),
    ...all.bans.slice(0, 5).map((b) => ({ text: `Ban: ${b.label}`, n: b.n })),
  ];
  const tendencies = all.strategies.slice(0, 5).map((s) => ({ text: s.label, n: s.n, today: T.strategies.some((x) => key(x.label) === key(s.label)) }));
  const threats = all.players.slice(0, 4).map((p) => ({ text: `${p.label}: ${p.notes[0] || ''}`.replace(/: $/, ''), n: p.n }));
  const suggested = [
    tendencies[0] && `They tend to: ${tendencies[0].text} (seen ${tendencies[0].n}×).`,
    threats[0] && `Watch ${threats[0].text}.`,
    likely[0] && `${likely[0].text} came up ${likely[0].n}×: have an answer ready.`,
    ...brief.watch.filter((w) => w.src === 'Roster check').map((w) => 'Their roster changed: check who actually plays.'),
  ].filter(Boolean).slice(0, 3);
  return { match, title: brief.title, nation: brief.nation, likely, tendencies, threats, known: brief.known.slice(0, 5), tbd: brief.tbd.slice(0, 5),
    todayN: liveToday.length, totalN: all.n, suggested };
}

// The coach's approval: 1 to 3 key points, short, performance only. Stored with id per match (or nation and day).
export function approveBrief({ title, nation, matchId = '', points = [], by, date = localDay() }) {
  const ps = points.map(norm).filter(Boolean);
  need(ps.length >= 1 && ps.length <= 3, 'Write 1 to 3 key points for the players.');
  for (const p of ps) { need(p.length <= POINT_MAX, `Keep each point under ${POINT_MAX} characters.`); need(!hasContactNumber(p), 'Remove phone or ID numbers.'); }
  need(norm(by), 'Who approved it is required.');
  return { id: `BR-${title}-${nation}-${matchId || date}`.replace(/[^A-Za-z0-9_\-]/g, '_'), kind: 'brief', title, nation, matchId, date, points: ps, approvedBy: norm(by), at: new Date().toISOString(), origin: 'operational' };
}
export const approvedBrief = (records, title, nation, matchId, date) => records.filter((r) => r.kind === 'brief' && r.title === title && r.nation === nation && (matchId ? r.matchId === matchId : r.date === date))
  .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;

// ---------- V1.27 AI material (every item with an id the AI must cite) ----------
const liveItem = (e) => ({ id: e.id, type: e.type, hero: e.hero || undefined, player: e.player || undefined, text: e.text || undefined, phase: e.phase || undefined, date: e.date, match: e.match || undefined });
export function prematchMaterial({ brief, live = [], standIn = null, book = null }) {
  const tagged = (xs, p) => xs.map((x, i) => ({ id: `${p}${i + 1}`, text: x.text, source: x.src }));
  const L = liveSummary(live);
  return {
    BRIEF: { known: tagged(brief.known, 'K'), to_confirm: tagged(brief.tbd, 'T'), watch_for: tagged(brief.watch, 'W') },
    LIVE: live.slice(0, 60).map(liveItem),
    COUNTS: [...L.picks.map((p, i) => ({ id: `CP${i + 1}`, pick: p.label, n: p.n, small: p.n < 3 })), ...L.bans.map((b, i) => ({ id: `CB${i + 1}`, ban: b.label, n: b.n, small: b.n < 3 })),
      ...L.strategies.map((s, i) => ({ id: `CS${i + 1}`, tendency: s.label, n: s.n, small: s.n < 3 }))],
    BOOK: book ? { id: 'BOOK', bans: book.bans, protect: book.protect, flex: book.flex } : null,
    STANDIN: standIn ? { id: 'STANDIN', games: standIn.n, won: standIn.won, low_sample: !!standIn.lowSample } : null,
  };
}
export const materialIds = (m) => new Set(JSON.stringify(m).match(/"id":"([^"]+)"/g)?.map((s) => s.slice(6, -1)) || []);
export function scoutDayMaterial(records, title, date) {
  const day = records.filter((r) => r.kind === 'live' && r.title === title && r.date === date);
  const by = {}; for (const e of day) (by[e.nation] ||= []).push(liveItem(e));
  return { DATE: date, LIVE: by };
}
export function daySummaryRecord({ title, nation, date, lines, by }) {
  const ls = lines.map(norm).filter(Boolean).slice(0, 6);
  need(ls.length, 'Nothing to approve for this opponent.');
  need(norm(by), 'Who approved it is required.');
  return { id: `SD-${title}-${nation}-${date}`.replace(/[^A-Za-z0-9_\-]/g, '_'), kind: 'scout_day', title, nation, date, lines: ls, approvedBy: norm(by), at: new Date().toISOString(), origin: 'operational' };
}

// Text to share with the players once approved (page language).
export function briefShareText(pm, approved, lang = 'en') {
  const id = lang === 'id';
  const L = [`${pm.title}: Indonesia vs ${pm.nation}${pm.match?.date ? ` · ${pm.match.date}` : ''}`, '', id ? '3 poin utama:' : '3 key points:'];
  approved.points.forEach((p, i) => L.push(`${i + 1}. ${p}`));
  if (pm.likely.length) L.push('', `${id ? 'Kemungkinan pick/ban' : 'Likely picks/bans'}: ${pm.likely.slice(0, 6).map((x) => `${x.text} (${x.n}×)`).join(', ')}`);
  L.push('', `${id ? 'Disetujui oleh' : 'Approved by'} ${approved.approvedBy}.`);
  return L.join('\n');
}
