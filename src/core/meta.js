// V1.26 Focus 2 — the current meta per title. Analysts keep a tracker of what is strong, weak, changed or working
// in the current patch, each entry with its source and "to confirm" until an analyst checks it. Pasted text can be
// structured by the AI (every entry must quote the text), Dota 2 pro hero stats come from OpenDota, and the meta is
// compared with our own records. Entries live with the scouting notes (kind "meta"): no database change.
import { REPORT_TITLES } from './reports.js';
import { latestGames } from './capture.js';
import { hasContactNumber } from './pii.js';
import { localDay } from './dates.js';

const need = (c, m) => { if (!c) throw new Error(m); };
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const key = (s) => norm(s).toLowerCase();
export const META_CATEGORIES = ['patch', 'change', 'strong', 'weak', 'strategy'];
export const OD_MIN = 20;          // OpenDota pro picks below this: small sample
export const OURS_MIN = 3;         // our confirmed games on a hero before we call it "we play it"

export function metaEntry(x, now = new Date()) {
  need(REPORT_TITLES.includes(x.title), 'Pick a title.');
  need(META_CATEGORIES.includes(x.category), 'Pick a category: patch, change, strong, weak or strategy.');
  const item = norm(x.item).slice(0, 80); const text = norm(x.text).slice(0, 300);
  if (x.category === 'patch') need(norm(x.patch) || item, 'Write the patch or version.');
  else need(item, 'Name the hero, map, item or strategy.');
  need(norm(x.source), 'Source is required (link, publisher, tournament, or "own observation").');
  need(!hasContactNumber(`${item} ${text}`), 'Remove phone or ID numbers.');
  need(norm(x.by), 'Who entered it is required.');
  return { id: `MT-${now.toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`, kind: 'meta', title: x.title, nation: '',
    category: x.category, item: item || norm(x.patch), text, patch: norm(x.patch).slice(0, 40), source: norm(x.source).slice(0, 200), quote: norm(x.quote).slice(0, 300),
    check: x.confirmed ? false : true, confirmedBy: x.confirmed ? norm(x.by) : '', by: norm(x.by), date: localDay(now), at: now.toISOString(), origin: 'operational' };
}
export const confirmMeta = (e, by) => { need(norm(by), 'Who confirmed it is required.'); return { ...e, check: false, confirmedBy: norm(by), confirmedAt: new Date().toISOString() }; };
export const retireMeta = (e, { why, by }) => { need(norm(why), 'Say why (outdated, wrong, duplicate).'); need(norm(by), 'Who is it?'); return { ...e, retired: true, retiredWhy: norm(why), retiredBy: norm(by), retiredAt: new Date().toISOString() }; };
export const metaOf = (records, title) => records.filter((r) => r.kind === 'meta' && r.title === title && !r.retired).sort((a, b) => String(b.at).localeCompare(String(a.at)));
// The patch the staff are working on: the newest "patch" entry, else the hub's rule setting.
export function currentPatch(entries, ruleVersion = '') {
  const p = entries.find((e) => e.category === 'patch');
  return p ? { version: p.patch || p.item, source: p.source, check: p.check } : (ruleVersion ? { version: ruleVersion, source: 'Staff → Rules', check: true } : null);
}

// AI extraction: keep only entries whose quote really is in the pasted text (the hub checks, not the AI).
export function extractedEntries(raw, text, { title, source, by }) {
  const hay = key(text); const out = []; let dropped = 0;
  for (const e of raw?.entries || []) {
    const q = key(e.quote);
    if (!META_CATEGORIES.includes(e.category) || !q || !hay.includes(q)) { dropped++; continue; }
    try { out.push(metaEntry({ title, category: e.category, item: e.item, text: e.text, quote: e.quote, patch: raw.patch || '', source, by })); } catch { dropped++; }
  }
  return { patch: norm(raw?.patch), entries: out, dropped };
}

// OpenDota /api/heroStats (public): professional picks, wins and bans per hero over its recent window.
export function openDotaRows(stats) {
  return (Array.isArray(stats) ? stats : []).filter((h) => h && h.localized_name).map((h) => {
    const picks = Number(h.pro_pick) || 0; const wins = Number(h.pro_win) || 0; const bans = Number(h.pro_ban) || 0;
    return { hero: h.localized_name, picks, wins, bans, contested: picks + bans, winRate: picks ? Math.round((wins / picks) * 100) : null, lowSample: picks < OD_MIN };
  }).sort((a, b) => b.contested - a.contested || a.hero.localeCompare(b.hero));
}

// Our side, as facts with ids: heroes our players used in confirmed scrim games, and the coaches' hero pools.
export function ourFacts(title, { games = [], pools = [] } = {}) {
  const facts = [];
  const gs = latestGames(games.filter((g) => g.title === title));
  const use = {};
  for (const g of gs) for (const p of g.players.filter((x) => x.team === 'ours' && x.hero)) { const o = (use[key(p.hero)] ||= { hero: p.hero, games: 0, wins: 0, players: new Set() }); o.games++; if (g.result === 'win') o.wins++; o.players.add(p.player); }
  for (const o of Object.values(use)) facts.push({ id: `OG-${o.hero}`, kind: 'games', hero: o.hero, games: o.games, wins: o.wins, players: [...o.players], low_sample: o.games < OURS_MIN });
  for (const pool of pools.filter((p) => p.title === title)) for (const [hero, v] of Object.entries(pool.heroes || {})) facts.push({ id: `OP-${pool.player}-${hero}`, kind: 'pool', hero, player: pool.player, tier: v.tier });
  return facts;
}
// Deterministic comparison: aligned, exposed, and items we cannot judge from our data (TBD).
export function metaFit(entries, facts) {
  const games = (h) => facts.find((f) => f.kind === 'games' && key(f.hero) === key(h));
  const pool = (h) => facts.filter((f) => f.kind === 'pool' && key(f.hero) === key(h));
  const aligned = []; const exposed = []; const tbd = [];
  for (const e of entries.filter((x) => x.category === 'strong' || x.category === 'weak')) {
    const g = games(e.item); const p = pool(e.item); const mains = p.filter((x) => x.tier === 'main');
    const ids = [...(g ? [g.id] : []), ...p.map((x) => x.id)];
    const ours = g ? `${g.games} confirmed game(s), ${g.wins} won${g.low_sample ? ', small sample' : ''}` : 'no confirmed game';
    const poolTxt = p.length ? `; pool: ${p.map((x) => `${x.player} (${x.tier})`).join(', ')}` : '';
    const flag = e.check ? ' — to confirm' : '';
    if (e.category === 'strong') {
      if ((g && g.games >= OURS_MIN) || mains.length) aligned.push({ text: `${e.item} is listed as strong${flag}; we play it: ${ours}${poolTxt}.`, metaId: e.id, ourIds: ids });
      else exposed.push({ text: `${e.item} is listed as strong${flag}; ${ours}${poolTxt || ', not in any hero pool'}: no answer practised yet.`, metaId: e.id, ourIds: ids });
    } else if (g && g.games >= OURS_MIN) exposed.push({ text: `We rely on ${e.item} (${ours}) while it is listed as weak${flag}.`, metaId: e.id, ourIds: ids });
  }
  for (const e of entries.filter((x) => x.category === 'strategy' || x.category === 'change')) tbd.push({ text: `${e.item}: ${e.text || e.category} — compare with our play by hand (VOD, reports)${e.check ? '; to confirm' : ''}.`, metaId: e.id });
  return { aligned, exposed, tbd };
}
// What the AI comparison receives: tracker entries and our facts, with ids.
export const metaFitMaterial = (title, entries, facts) => ({ TITLE: title,
  META: entries.filter((e) => e.category !== 'patch').slice(0, 60).map((e) => ({ id: e.id, category: e.category, item: e.item, text: e.text, confirmed: !e.check, source: e.source })),
  OURS: facts.slice(0, 120) });
