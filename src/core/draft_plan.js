// V1.46 MLBB draft plan for one opponent (MLBB and MLBB Women share this logic; each title uses its own data).
// Two sources, never mixed:
//   - the rival's own drafts on record (public games imported in the Draft Room, where a team name matches the nation)
//   - our confirmed scrim games (bans against us, the heroes we play, first or second pick)
// Every line carries its count ("4 of 6 games") and is marked low sample under MIN_N games. Nothing is predicted:
// with no rival drafts on record the plan says so and shows our side only.
import { MIN_N, ourDraftFacts } from './draftroom.js';

const count = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Names a nation's team may carry in an imported game: "Malaysia", "Team Malaysia", "Turkey" for Türkiye.
const ALIAS = { 'Türkiye': ['turkey'] };
export const isTeamOf = (name, nation) => { const n = fold(name); return [fold(nation), ...(ALIAS[nation] || [])].some((a) => n === a || n === `team ${a}` || n === `${a} national team` || n === `timnas ${a}`); };

// pro: imported games ({ blue, red, winner, blueBans, redBans, bluePicks, redPicks, date, event }).
export function rivalDraftFacts(pro = [], nation) {
  const mine = pro.map((g) => (isTeamOf(g.blue, nation) ? { g, side: 'blue' } : isTeamOf(g.red, nation) ? { g, side: 'red' } : null)).filter(Boolean);
  const n = mine.length; const other = (s) => (s === 'blue' ? 'red' : 'blue');
  const picked = new Map();
  for (const { g, side } of mine) for (const h of g[`${side}Picks`] || []) { const r = picked.get(h) || { hero: h, n: 0, won: 0 }; r.n++; if (g.winner === side) r.won++; picked.set(h, r); }
  const top = (xs, k = 6) => count(xs).slice(0, k).map(([hero, c]) => ({ hero, n: c, of: n }));
  const dates = mine.map((x) => x.g.date).filter(Boolean).sort();
  return {
    games: n, won: mine.filter((x) => x.g.winner === x.side).length, lowSample: n < MIN_N,
    picks: [...picked.values()].sort((a, b) => b.n - a.n || a.hero.localeCompare(b.hero)).slice(0, 8).map((r) => ({ ...r, of: n })),
    bans: top(mine.flatMap((x) => x.g[`${x.side}Bans`] || [])),
    bansVs: top(mine.flatMap((x) => x.g[`${other(x.side)}Bans`] || [])),
    events: [...new Set(mine.map((x) => x.g.event).filter(Boolean))], from: dates[0] || '', to: dates.at(-1) || '',
  };
}

// games: our confirmed scrim games of the title (latest versions).
// Returns { rival, ours, lines, thin }. lines: [{ kind, hero, n, of, won, us, fp, sp, low }], in the order a coach
// reads them before a draft. kind: ban (their comfort pick) · expect (they ban a hero we play) ·
// against (scrim partners ban it against us) · side (our record by pick order).
export function draftPlan({ nation, pro = [], games = [] }) {
  const rival = rivalDraftFacts(pro, nation); const ours = ourDraftFacts({ games });
  const ourHero = new Map(ours.heroes.map((h) => [h.hero, h]));
  const lines = [];
  for (const p of rival.picks.filter((x) => x.n >= 2).slice(0, 4)) lines.push({ kind: 'ban', hero: p.hero, n: p.n, of: p.of, won: p.won, us: ourHero.get(p.hero) || null, low: rival.lowSample });
  for (const b of rival.bans.filter((x) => x.n >= 2).slice(0, 3)) { const us = ourHero.get(b.hero); if (us) lines.push({ kind: 'expect', hero: b.hero, n: b.n, of: b.of, us, low: rival.lowSample }); }
  for (const b of ours.bansAgainstUs.filter((x) => x.n >= 2).slice(0, 3)) lines.push({ kind: 'against', hero: b.hero, n: b.n, of: b.of, low: ours.lowSample });
  const rec = (gs) => ({ n: gs.length, won: gs.filter((g) => g.result === 'win').length });
  const fp = rec(games.filter((g) => g.pickOrder === 'FP')), sp = rec(games.filter((g) => g.pickOrder === 'SP'));
  if (fp.n + sp.n >= 2) lines.push({ kind: 'side', fp, sp, low: fp.n < MIN_N || sp.n < MIN_N });
  return { nation, rival, ours, lines, thin: rival.games < MIN_N };
}

// One line as { text, evidence } in English or Bahasa Indonesia (the page and the WhatsApp brief use the same words).
export function lineText(l, lang = 'en') {
  const id = lang === 'id';
  if (l.kind === 'ban') return { text: `${id ? 'Kandidat ban' : 'Ban candidate'}: ${l.hero}`,
    evidence: id ? `mereka pick di ${l.n} dari ${l.of} game yang tercatat (menang ${l.won})${l.us ? `; kita juga main hero ini (${l.us.n} game scrim, menang ${l.us.won}): ban atau ambil duluan` : ''}`
      : `they picked it in ${l.n} of ${l.of} games on record (won ${l.won})${l.us ? `; we play it too (${l.us.n} scrim games, ${l.us.won} won): ban it or take it first` : ''}` };
  if (l.kind === 'expect') return { text: id ? `Siap-siap ${l.hero} di-ban` : `Expect ${l.hero} to be banned`,
    evidence: id ? `mereka ban di ${l.n} dari ${l.of} game; kita main di ${l.us.n} game scrim: siapkan opsi kedua` : `they banned it in ${l.n} of ${l.of} games; we played it in ${l.us.n} scrim games: have a second option ready` };
  if (l.kind === 'against') return { text: id ? `Lawan latih sering ban ${l.hero}` : `Partners ban ${l.hero} against us`,
    evidence: id ? `${l.n} dari ${l.of} game scrim yang ada draft-nya` : `${l.n} of ${l.of} scrim games with a draft` };
  const r = (x) => (x.n ? (id ? `menang ${x.won} dari ${x.n}` : `${x.won} of ${x.n} won`) : (id ? 'belum pernah' : 'not played'));
  return { text: id ? 'Scrim kita menurut urutan pick' : 'Our scrims by pick order', evidence: `${id ? 'first pick' : 'first pick'} ${r(l.fp)} · second pick ${r(l.sp)}` };
}
export const LOW = { en: 'low sample', id: 'data sedikit' };
export function draftPlanText(plan, lang = 'id') {
  return plan.lines.map((l) => { const t = lineText(l, lang); return `- ${t.text} (${t.evidence})${l.low ? ` [${LOW[lang] || LOW.en}]` : ''}`; }).join('\n');
}

// V1.46 how much stands behind an opponent page. thin = say "little public data" on the page.
// a: the auto card (oppcard.autoCard); rivalGames: rival drafts on record (MLBB titles), else null.
export function dataDepth(a, rivalGames = null) {
  const counts = { notes: (a.observed || []).length + (a.hypotheses || []).length, results: (a.results || []).length, vods: (a.vods || []).length, scrims: a.scrimsDone || 0, ...(rivalGames == null ? {} : { drafts: rivalGames }) };
  const thin = counts.notes + counts.vods < 2 && (rivalGames == null ? counts.results < 2 : rivalGames < MIN_N);
  return { counts, thin };
}
