// Pattern digest and player stat trail (V1.13).
// Two steps, so the AI never invents a number:
//   1. facts(): the hub computes fixed tables from coach-confirmed scrim games (win rate by side, game
//      length, hero, bans against us, partner level, rival stand-in, per-player averages).
//   2. The AI writes up to five findings, each citing fact ids; checkFindings() keeps only findings
//      whose ids exist and whose numbers all appear in the cited facts.
// Findings are suggestions: a coach marks each useful / already known / wrong, and may promote a
// useful one into a coaching-cycle proposal.
import { STAT_DEFS } from './capture.js';
import { LIMITS, FINDING_KINDS } from '../../supabase/functions/_shared/scrim_spec.js';

export const MIN_SAMPLE = 5;                       // fewer games in a split = "low sample"
export const LENGTH_BUCKETS = {
  mlbb: [[0, 15 * 60, 'under 15 min'], [15 * 60, 20 * 60, '15–20 min'], [20 * 60, Infinity, 'over 20 min']],
  dota: [[0, 30 * 60, 'under 30 min'], [30 * 60, 45 * 60, '30–45 min'], [45 * 60, Infinity, 'over 45 min']],
};
const pct = (w, n) => (n ? Math.round((w / n) * 100) : null);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const ids = (gs) => gs.map((g) => g.id);

// Which WEC rival a game stood in for: the planned scrim's "stand-in for", else the partner bank.
export function standInFor(game, { reports = [], scrims = [], partners = [] } = {}) {
  const rep = reports.find((r) => r.id === game.reportId);
  const sc = rep?.scrimId ? scrims.find((s) => s.id === rep.scrimId) : null;
  if (sc?.mirrors) return sc.mirrors;
  const p = partners.find((x) => x.title === game.title && x.name && x.name.toLowerCase() === String(game.partner || '').toLowerCase());
  return p?.resembles || '';
}
export const partnerLevelOf = (game, reports = []) => reports.find((r) => r.id === game.reportId)?.partnerLevel || '';

// games: confirmed games of ONE title (latest versions). ctx: { reports, scrims, partners }.
export function facts(games, ctx = {}) {
  if (!games.length) return [];
  const game = games[0].game; const out = [];
  const wl = (id, label, group, gs, extra = {}) => {
    if (!gs.length) return;
    const won = gs.filter((g) => g.result === 'win').length;
    out.push({ id, group, label, n: gs.length, won, lost: gs.length - won, winRate: pct(won, gs.length), lowSample: gs.length < MIN_SAMPLE, games: ids(gs), ...extra });
  };
  wl('all', 'All scrim games', 'overall', games);
  for (const s of [...new Set(games.map((g) => g.ourSide))]) wl(`side:${s}`, `Played on ${s} side`, 'side', games.filter((g) => g.ourSide === s));
  for (const [lo, hi, label] of LENGTH_BUCKETS[game]) wl(`length:${label}`, `Games ${label}`, 'length', games.filter((g) => g.durationS != null && g.durationS >= lo && g.durationS < hi));
  // Our heroes (played 2+ times).
  const ourHero = {};
  for (const g of games) for (const p of g.players) if (p.team === 'ours' && p.hero) (ourHero[p.hero] ||= []).push(g);
  for (const [h, gs] of Object.entries(ourHero)) if (gs.length >= 2) wl(`hero:${h}`, `Our games with ${h}`, 'hero', gs);
  // Bans against us (from captured drafts): how often each hero was banned by the partner.
  const drafted = games.filter((g) => g.draft?.length);
  if (drafted.length) {
    const bans = {};
    for (const g of drafted) for (const a of g.draft) if (a.action === 'ban' && a.team === 'partner') (bans[a.hero] ||= []).push(g);
    for (const [h, gs] of Object.entries(bans).sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
      out.push({ id: `banned:${h}`, group: 'bans', label: `${h} banned against us`, n: drafted.length, count: gs.length, share: pct(gs.length, drafted.length), lowSample: drafted.length < MIN_SAMPLE, games: ids(gs) });
    }
    const fp = drafted.filter((g) => g.firstPick);
    wl('firstpick:us', 'We had first pick', 'draft', fp.filter((g) => g.firstPick === g.ourSide));
    wl('firstpick:them', 'Partner had first pick', 'draft', fp.filter((g) => g.firstPick !== g.ourSide));
  }
  // Partner level and rival stand-ins.
  const lv = {}; const riv = {};
  for (const g of games) { const l = partnerLevelOf(g, ctx.reports); if (l) (lv[l] ||= []).push(g); const r = standInFor(g, ctx); if (r) (riv[r] ||= []).push(g); }
  for (const [l, gs] of Object.entries(lv)) wl(`level:${l}`, `Against ${l} partners`, 'partner', gs);
  for (const [r, gs] of Object.entries(riv)) wl(`standin:${r}`, `Against stand-ins for ${r}`, 'rival', gs, { rival: r });
  // Per player: averages over all their games, plus deaths in wins vs losses.
  const per = {};
  for (const g of games) for (const p of g.players) if (p.team === 'ours' && p.player && p.player !== 'stand-in') (per[p.player] ||= []).push({ g, p });
  for (const [pl, rows] of Object.entries(per)) {
    const f = { id: `player:${pl}`, group: 'player', label: `${pl}, per game`, n: rows.length, lowSample: rows.length < MIN_SAMPLE, games: rows.map((r) => r.g.id), player: pl };
    for (const k of ['kills', 'deaths', 'assists']) f[k] = avg(rows.map((r) => r.p.stats[k]).filter((v) => v != null));
    const dw = rows.filter((r) => r.g.result === 'win').map((r) => r.p.stats.deaths).filter((v) => v != null);
    const dl = rows.filter((r) => r.g.result === 'loss').map((r) => r.p.stats.deaths).filter((v) => v != null);
    f.deathsInWins = avg(dw); f.deathsInLosses = avg(dl);
    out.push(f);
  }
  return out;
}

// The numbers a fact carries, as strings, so a finding's numbers can be checked against them.
const FACT_NUMS = ['n', 'won', 'lost', 'winRate', 'count', 'share', 'kills', 'deaths', 'assists', 'deathsInWins', 'deathsInLosses'];
const numbersIn = (text) => (String(text).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));
// Numbers that are labels, not claims (game lengths in a bucket name, years, "5v5").
const factNumbers = (f) => new Set([...FACT_NUMS.map((k) => f[k]).filter((v) => v != null).map((v) => String(v)), ...numbersIn(f.label), ...numbersIn(f.id)]);

// raw: the model's answer (scrim_spec.digestSchema). Returns kept findings and why others were dropped.
export function checkFindings(raw, factList, { reportIds = [] } = {}) {
  const byId = new Map(factList.map((f) => [f.id, f]));
  const kept = []; const dropped = [];
  for (const x of (raw?.findings || []).slice(0, LIMITS.findings * 2)) {
    const cited = (x.fact_ids || []).filter((id) => byId.has(id));
    const text = `${x.claim || ''} ${x.why_it_matters || ''}`;
    if (!cited.length) { dropped.push({ claim: x.claim, why: 'cites no fact the hub computed' }); continue; }
    const allowed = new Set(cited.flatMap((id) => [...factNumbers(byId.get(id))]));
    for (const id of reportIds) for (const n of numbersIn(id)) allowed.add(n);
    const stray = numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));
    if (stray.length) { dropped.push({ claim: x.claim, why: `uses numbers not in the cited facts (${stray.join(', ')})` }); continue; }
    const fs = cited.map((id) => byId.get(id));
    if (x.kind === 'problem' && fs.every((f) => f.lowSample)) { dropped.push({ claim: x.claim, why: 'a problem resting only on low-sample facts' }); continue; }
    kept.push({ kind: FINDING_KINDS.includes(x.kind) ? x.kind : 'tendency', claim: String(x.claim || '').slice(0, 500), why: String(x.why_it_matters || '').slice(0, 300), factIds: cited,
      sampleN: Math.max(...fs.map((f) => f.n)), lowSample: fs.every((f) => f.lowSample), games: [...new Set(fs.flatMap((f) => f.games))] });
    if (kept.length >= LIMITS.findings) break;
  }
  return { kept, dropped };
}

export const FINDING_STATUS = ['new', 'useful', 'known', 'wrong', 'promoted'];
export function findingRecord({ title, period, f, factList, model, by }) {
  return { id: `PF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, period, kind: f.kind, claim: f.claim, why: f.why,
    factIds: f.factIds, facts: f.factIds.map((id) => factList.find((x) => x.id === id)).filter(Boolean).map(({ games, ...rest }) => rest),
    sampleN: f.sampleN, lowSample: f.lowSample, games: f.games, status: 'new', statusBy: '', statusAt: '', promotedTo: '', model: model || '', requestedBy: by || '',
    origin: 'operational', createdAt: new Date().toISOString() };
}
export function markFinding(rec, { status, by, promotedTo = '' }) {
  if (!FINDING_STATUS.includes(status) || status === 'new') throw new Error('Choose useful, already known, wrong or promote.');
  if (!by || !by.trim()) throw new Error('Who marked it is required.');
  return { ...rec, status, statusBy: by.trim(), statusAt: new Date().toISOString(), promotedTo: promotedTo || rec.promotedTo };
}

// What goes to the AI: facts without game ids, and short excerpts of the reports behind the games.
export function digestPayload(factList, reports, { excerptChars = LIMITS.excerptChars, maxExcerpts = LIMITS.digestExcerpts } = {}) {
  const fs = factList.slice(0, LIMITS.digestFacts).map(({ games, ...f }) => f);
  const ex = [...reports].sort((a, b) => b.date.localeCompare(a.date)).slice(0, maxExcerpts)
    .map((r) => ({ report_id: r.id, date: r.date, partner: r.partner, worked: r.worked, failed: r.failed, adjust: r.adjust }))
    .map((r) => ({ ...r, worked: String(r.worked || '').slice(0, excerptChars / 3), failed: String(r.failed || '').slice(0, excerptChars / 3), adjust: String(r.adjust || '').slice(0, excerptChars / 3) }));
  return { facts: fs, excerpts: ex };
}

// ---------------------------------------------------------------- player stat trail
// Last `window` games against the player's own earlier average. Partner level is shown beside the
// numbers so a big night against a weak partner is not read as progress.
export function statTrail(games, player, { window = 10, reports = [] } = {}) {
  const rows = games.filter((g) => g.players.some((p) => p.team === 'ours' && p.player === player))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)) || a.gameNo - b.gameNo)
    .map((g) => ({ g, p: g.players.find((p) => p.team === 'ours' && p.player === player) }));
  if (!rows.length) return null;
  const recent = rows.slice(-window); const before = rows.slice(0, -window);
  const defs = STAT_DEFS[rows[0].g.game].filter((d) => d.trail);
  const stats = defs.map((d) => {
    const r = avg(recent.map((x) => x.p.stats[d.key]).filter((v) => v != null));
    const b = avg(before.map((x) => x.p.stats[d.key]).filter((v) => v != null));
    const delta = r != null && b != null ? Math.round((r - b) * 10) / 10 : null;
    const better = delta == null || d.higher == null || delta === 0 ? null : (delta > 0) === d.higher;
    return { key: d.key, label: d.label, recent: r, baseline: b, delta, better };
  });
  const levels = {};
  for (const x of recent) { const l = partnerLevelOf(x.g, reports) || 'level not set'; levels[l] = (levels[l] || 0) + 1; }
  const heroes = {};
  for (const x of recent) heroes[x.p.hero] = (heroes[x.p.hero] || 0) + 1;
  return { player, games: rows.length, recentN: recent.length, baselineN: before.length, stats, levels, heroes: Object.entries(heroes).sort((a, b) => b[1] - a[1]).slice(0, 4),
    winRate: pct(recent.filter((x) => x.g.result === 'win').length, recent.length), series: recent.map((x) => ({ date: x.g.date, result: x.g.result, hero: x.p.hero, ...x.p.stats })) };
}

// A player-plan goal tied to a stat: e.g. deaths per game <= 3 over the last 10 scrim games.
export function statGoalProgress(goal, trail) {
  const sg = goal?.stat; if (!sg || !trail) return null;
  const s = trail.stats.find((x) => x.key === sg.key); if (!s || s.recent == null) return { text: 'No scrim games with this stat yet.', met: null };
  const met = sg.op === '<=' ? s.recent <= sg.target : s.recent >= sg.target;
  return { text: `${s.label}: ${s.recent} per game over the last ${trail.recentN} scrim game${trail.recentN === 1 ? '' : 's'} (target ${sg.op} ${sg.target})`, met, lowSample: trail.recentN < MIN_SAMPLE };
}
export function statGoal(x, game) {
  const d = STAT_DEFS[game]?.find((s) => s.key === x.key && s.trail);
  if (!d) throw new Error('Pick a stat for the goal.');
  if (!['<=', '>='].includes(x.op)) throw new Error('Pick at most or at least.');
  const t = Number(x.target); if (!Number.isFinite(t) || t < 0) throw new Error('Target must be a number.');
  return { key: d.key, op: x.op, target: t };
}

// Opponent card: our scrim record against partners standing in for this rival.
export function standInRecord(games, rival, ctx) {
  const gs = games.filter((g) => standInFor(g, ctx).toLowerCase() === String(rival).toLowerCase());
  if (!gs.length) return null;
  const won = gs.filter((g) => g.result === 'win').length;
  const bans = {};
  for (const g of gs) for (const a of g.draft || []) if (a.action === 'ban' && a.team === 'partner') bans[a.hero] = (bans[a.hero] || 0) + 1;
  return { n: gs.length, won, lost: gs.length - won, lowSample: gs.length < MIN_SAMPLE, partners: [...new Set(gs.map((g) => g.partner))], bansAgainst: Object.entries(bans).sort((a, b) => b[1] - a[1]).slice(0, 5) };
}
