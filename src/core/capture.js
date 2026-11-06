// AI screenshot capture for scrim games (V1.13): turns what the model read from an end-of-game or
// draft screenshot into a proposal the coach confirms, and validates the confirmed game record.
// Game-agnostic: per-game differences are data (sides, stats, hero catalogue). Nothing here calls the
// model; the server function does, and this module never trusts its answer: every value is checked,
// matched to the hero catalogue and the roster, and shown for confirmation.
import { CAPTURE_GAMES, GAME_SIDES, PLAYER_FIELDS, gameOf } from '../../supabase/functions/_shared/scrim_spec.js';

export { CAPTURE_GAMES, gameOf };
export const SIDE_LABEL = { blue: 'Blue', red: 'Red', radiant: 'Radiant', dire: 'Dire' };

// Stats per game: which the confirm screen shows, how they read, and what feeds the player trail.
// higher: true when more is better for the player; null when it depends on role.
export const STAT_DEFS = {
  mlbb: [
    { key: 'kills', label: 'K', higher: true, trail: true }, { key: 'deaths', label: 'D', higher: false, trail: true }, { key: 'assists', label: 'A', higher: true, trail: true },
    { key: 'gold', label: 'Gold', higher: true, trail: true }, { key: 'hero_damage', label: 'Hero dmg', higher: true, trail: true },
    { key: 'damage_taken', label: 'Dmg taken', higher: null, trail: false }, { key: 'tower_damage', label: 'Turret dmg', higher: true, trail: false },
    { key: 'rating', label: 'Rating', higher: true, trail: true, decimal: true },
  ],
  dota: [
    { key: 'kills', label: 'K', higher: true, trail: true }, { key: 'deaths', label: 'D', higher: false, trail: true }, { key: 'assists', label: 'A', higher: true, trail: true },
    { key: 'gold', label: 'Net worth', higher: true, trail: true }, { key: 'last_hits', label: 'LH', higher: true, trail: true }, { key: 'denies', label: 'DN', higher: true, trail: false },
    { key: 'gpm', label: 'GPM', higher: true, trail: true }, { key: 'xpm', label: 'XPM', higher: true, trail: true },
    { key: 'hero_damage', label: 'Hero dmg', higher: true, trail: true }, { key: 'tower_damage', label: 'Bldg dmg', higher: true, trail: false },
  ],
};
// Plausible ranges for one scrim game. Outside the range = the coach is asked to check, not refused.
const RANGE = {
  kills: [0, 60], deaths: [0, 40], assists: [0, 90], gold: [0, 80000], hero_damage: [0, 400000], damage_taken: [0, 400000], tower_damage: [0, 80000],
  last_hits: [0, 2000], denies: [0, 200], gpm: [0, 2000], xpm: [0, 2500], rating: [0, 20],
};
const DURATION = [120, 7200];
export const durationText = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
export function parseDuration(text) {
  const t = String(text ?? '').trim(); if (!t) return null;
  const m = t.match(/^(\d{1,3})(?::(\d{1,2}))?$/); if (!m) throw new Error('Duration must look like 18:42 (minutes:seconds).');
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

// ---------------------------------------------------------------- names: heroes and players
const norm = (s) => String(s ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// catalogue: [{ name, aliases? }]. Returns { names, find(text) -> canonical name or '' }.
export function heroIndex(catalogue) {
  const names = catalogue.map((h) => h.name).sort((a, b) => a.localeCompare(b));
  const byKey = new Map();
  for (const h of catalogue) for (const n of [h.name, ...(h.aliases || [])]) byKey.set(norm(n), h.name);
  const keys = [...byKey.keys()];
  return {
    names,
    find(text) {
      const k = norm(text); if (!k) return '';
      if (byKey.has(k)) return byKey.get(k);
      // One or two typos on longer names (OCR-like slips), only when a single hero is that close.
      if (k.length < 5) return '';
      const close = keys.filter((x) => x.length >= 5 && editDistance(k, x) <= (k.length >= 8 ? 2 : 1));
      const heroes = [...new Set(close.map((x) => byKey.get(x)))];
      return heroes.length === 1 ? heroes[0] : '';
    },
  };
}
// Roster player for a name seen on screen: exact, known alias, or the roster name inside a tagged name
// ("TLID Aran", "Aran.TLID"). Returns the roster IGN or ''.
export function matchPlayer(nameSeen, roster, aliases = {}) {
  const k = norm(nameSeen); if (!k) return '';
  for (const ign of roster) if (norm(ign) === k) return ign;
  for (const ign of roster) if ((aliases[ign] || []).some((a) => norm(a) === k)) return ign;
  const inside = roster.filter((ign) => norm(ign).length >= 3 && k.includes(norm(ign)));
  return inside.length === 1 ? inside[0] : '';
}

// ---------------------------------------------------------------- scoreboard proposal
// raw: the model's JSON (scrim_spec.scoreboardSchema). Returns what the confirm screen shows:
// values, a flag per uncertain cell (with the reason) and issues for the whole game.
export function proposeGame({ title, raw, roster = [], aliases = {}, heroes }) {
  const game = gameOf(title); if (!game) throw new Error(`Screenshot capture is not set up for ${title}.`);
  const sides = GAME_SIDES[game]; const defs = STAT_DEFS[game];
  const issues = [];
  if (!raw || raw.readable === false || !['scoreboard', 'data_tab'].includes(raw.screen_kind)) {
    issues.push({ level: 'block', text: raw?.screen_kind === 'draft_or_loading' ? 'This looks like a draft or loading screen. Use "Add draft screenshot" for it, and upload the end-of-game screen here.' : 'This does not look like an end-of-game screen. Upload the scoreboard taken right after the game.' });
  }
  const seen = new Map();
  const players = (raw?.players || []).slice(0, 12).map((p, i) => {
    const flags = [];
    const uncertain = new Set(p.uncertain_fields || []);
    const hero = heroes.find(p.hero);
    if (!hero) flags.push({ field: 'hero', reason: p.hero ? `"${p.hero}" is not in the hero list` : 'hero not recognised' });
    else if (uncertain.has('hero')) flags.push({ field: 'hero', reason: 'AI unsure' });
    if (hero) { if (seen.has(hero)) flags.push({ field: 'hero', reason: `${hero} appears twice` }); seen.set(hero, true); }
    const player = matchPlayer(p.name_seen, roster, aliases);
    const stats = {};
    for (const d of defs) {
      const v = Number(p[d.key]);
      if (!Number.isFinite(v) || v < 0) { stats[d.key] = null; if (['kills', 'deaths', 'assists'].includes(d.key)) flags.push({ field: d.key, reason: 'not read' }); continue; }
      stats[d.key] = d.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      const [lo, hi] = RANGE[d.key];
      if (v < lo || v > hi) flags.push({ field: d.key, reason: `unusual value (${v})` });
      else if (uncertain.has(d.key)) flags.push({ field: d.key, reason: 'AI unsure' });
    }
    const side = sides.includes(p.side) ? p.side : '';
    if (!side) flags.push({ field: 'side', reason: 'team not shown' });
    if (!p.name_seen || uncertain.has('name')) flags.push({ field: 'name', reason: 'name unclear' });
    return { side, slot: Number.isInteger(p.slot) && p.slot > 0 ? p.slot : (i % 5) + 1, nameSeen: String(p.name_seen || '').slice(0, 60), player, hero, mvp: !!p.mvp, stats, flags };
  });
  if (players.length && players.length !== 10) issues.push({ level: 'check', text: `The screenshot shows ${players.length} player rows, not 10. Check for a cropped or scrolled screen.` });
  for (const s of sides) {
    const n = players.filter((p) => p.side === s).length;
    if (players.length === 10 && n !== 5) issues.push({ level: 'check', text: `${SIDE_LABEL[s]} has ${n} players. Check the team of each row.` });
  }
  // Our side: the team holding most of our roster. Ambiguous = the coach picks.
  const mine = Object.fromEntries(sides.map((s) => [s, players.filter((p) => p.side === s && p.player).length]));
  const best = sides.filter((s) => mine[s] >= 3 && mine[s] > Math.max(...sides.filter((x) => x !== s).map((x) => mine[x])));
  const ourSide = best.length === 1 ? best[0] : '';
  if (!ourSide && players.length) issues.push({ level: 'check', text: 'Could not tell which team is ours from the player names. Pick our side.' });
  const score = {};
  for (const s of sides) {
    const v = Number(raw?.score?.[s]); score[s] = Number.isFinite(v) && v >= 0 ? v : null;
    const sum = players.filter((p) => p.side === s).reduce((a, p) => a + (p.stats.kills ?? 0), 0);
    if (score[s] != null && players.some((p) => p.side === s) && sum !== score[s]) issues.push({ level: 'check', text: `${SIDE_LABEL[s]} kills add up to ${sum}, but the score shows ${score[s]}. One K value is probably misread.` });
  }
  const winner = sides.includes(raw?.winner_side) ? raw.winner_side : '';
  const dur = Number(raw?.duration_seconds);
  const durationS = Number.isFinite(dur) && dur >= 0 ? Math.round(dur) : null;
  if (durationS != null && (durationS < DURATION[0] || durationS > DURATION[1])) issues.push({ level: 'check', text: `Duration ${durationText(durationS)} looks wrong.` });
  if (durationS == null && players.length) issues.push({ level: 'check', text: 'Duration not read. Type it in (minutes:seconds).' });
  if (!winner && players.length) issues.push({ level: 'check', text: 'The winner is not shown. Pick the result.' });
  if (raw?.notes) issues.push({ level: 'check', text: `AI note: ${String(raw.notes).slice(0, 200)}` });
  return {
    title, game, sides, ourSide, winner, result: ourSide && winner ? (winner === ourSide ? 'win' : 'loss') : '',
    durationS, score, players: [...players].sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side) || a.slot - b.slot), issues,
  };
}

// Draft screenshot → proposed actions, matched to the hero catalogue.
export function proposeDraft({ title, raw, heroes }) {
  const game = gameOf(title); if (!game) throw new Error(`Screenshot capture is not set up for ${title}.`);
  const sides = GAME_SIDES[game]; const issues = [];
  if (!raw || raw.readable === false || !['draft', 'loading'].includes(raw.screen_kind)) issues.push({ level: 'block', text: 'This does not look like a draft or loading screen.' });
  const seen = new Set();
  const actions = (raw?.actions || []).slice(0, 30).map((a, i) => {
    const hero = heroes.find(a.hero); const flags = [];
    if (!hero) flags.push({ field: 'hero', reason: a.hero ? `"${a.hero}" is not in the hero list` : 'hero not recognised' });
    else if (seen.has(hero)) flags.push({ field: 'hero', reason: `${hero} appears twice` });
    if (hero) seen.add(hero);
    if (a.uncertain) flags.push({ field: 'order', reason: 'AI unsure' });
    return { order: Number.isInteger(a.order) && a.order > 0 ? a.order : i + 1, side: sides.includes(a.side) ? a.side : '', action: a.action === 'ban' ? 'ban' : 'pick', hero, playerName: String(a.player_name || '').slice(0, 60), flags };
  }).sort((a, b) => a.order - b.order);
  for (const s of sides) { const n = actions.filter((a) => a.side === s && a.action === 'pick').length; if (actions.length && n !== 5) issues.push({ level: 'check', text: `${SIDE_LABEL[s]} shows ${n} picks, not 5.` }); }
  if (raw?.notes) issues.push({ level: 'check', text: `AI note: ${String(raw.notes).slice(0, 200)}` });
  return { title, game, sides, firstPick: sides.includes(raw?.first_pick_side) ? raw.first_pick_side : '', actions, issues };
}

// ---------------------------------------------------------------- the confirmed game record
const need = (c, m) => { if (!c) throw new Error(m); };
// edited: the values on the confirm screen (proposal shape). base: the untouched proposal from the
// screenshot (or null for a game typed by hand). Throws a plain sentence on the first problem.
export function confirmGame(edited, { reportId = '', date, partner, gameNo, by, base = null, captureIds = [], heroes, draft = null, externalMatchId = '' }) {
  const game = gameOf(edited.title); need(game, `Screenshot capture is not set up for ${edited.title}.`);
  const sides = GAME_SIDES[game]; const defs = STAT_DEFS[game];
  need(/^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'Date is required.');
  need(sides.includes(edited.ourSide), 'Pick which side we played.');
  need(['win', 'loss'].includes(edited.result), 'Pick the result: win or loss.');
  need(Number.isInteger(gameNo) && gameNo >= 1 && gameNo <= 9, 'Game number must be 1 to 9.');
  const durationS = edited.durationS == null || edited.durationS === '' ? null : Number(edited.durationS);
  need(durationS == null || (Number.isInteger(durationS) && durationS >= 60 && durationS <= 10800), 'Duration must be between 1:00 and 180:00.');
  const players = edited.players.map((p) => {
    need(sides.includes(p.side), 'Every row needs a team.');
    const hero = heroes.find(p.hero);
    const ours = p.side === edited.ourSide;
    need(hero || !ours, `Pick the hero for ${p.player || p.nameSeen || 'each of our players'} (our heroes are required).`);
    const stats = {};
    for (const d of defs) {
      const raw = p.stats?.[d.key]; const v = raw === '' || raw == null ? null : Number(raw);
      need(v == null || (Number.isFinite(v) && v >= 0), `${d.label} for ${p.player || p.nameSeen || hero} must be a number.`);
      stats[d.key] = v == null ? null : d.decimal ? Math.round(v * 10) / 10 : Math.round(v);
    }
    if (ours) for (const k of ['kills', 'deaths', 'assists']) need(stats[k] != null, `K/D/A is required for our players (${p.player || p.nameSeen || hero}).`);
    return { team: ours ? 'ours' : 'partner', side: p.side, slot: Number(p.slot) || 0, nameSeen: String(p.nameSeen || '').slice(0, 60), player: ours ? String(p.player || '') : '', hero: hero || '', mvp: !!p.mvp, stats };
  });
  const ours = players.filter((p) => p.team === 'ours');
  need(ours.length === 5, `Our side needs exactly 5 players (now ${ours.length}).`);
  need(ours.every((p) => p.player), 'Match each of our players to the roster (or pick "stand-in").');
  const named = ours.filter((p) => p.player !== 'stand-in').map((p) => p.player);
  need(new Set(named).size === named.length, 'The same roster player is on two rows.');
  const heroesUsed = players.map((p) => p.hero).filter(Boolean);
  need(new Set(heroesUsed).size === heroesUsed.length, 'The same hero is on two rows.');
  const score = Object.fromEntries(sides.map((s) => [s, players.filter((p) => p.side === s).reduce((a, p) => a + (p.stats.kills ?? 0), 0)]));
  const rec = {
    id: `GM-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
    title: edited.title, game, reportId, date, partner: String(partner || '').trim(), gameNo, by: String(by || '').trim(),
    ourSide: edited.ourSide, result: edited.result, durationS, score, players,
    draft: draft ? confirmDraft(draft, { heroes, ourSide: edited.ourSide, sides }) : [],
    firstPick: draft?.firstPick || '',
    source: base ? 'screenshot' : 'manual', captureIds, externalMatchId: String(externalMatchId || '').replace(/\D/g, '').slice(0, 20),
    corrections: base ? corrections(base, edited, defs) : [],
    origin: 'operational', createdAt: new Date().toISOString(),
  };
  return rec;
}
function confirmDraft(d, { heroes, ourSide, sides }) {
  const out = d.actions.filter((a) => a.hero || a.side).map((a, i) => {
    need(sides.includes(a.side), 'Every pick or ban needs a team.');
    const hero = heroes.find(a.hero); need(hero, 'Every pick or ban needs a hero from the list (delete rows you cannot read).');
    return { order: Number(a.order) || i + 1, side: a.side, team: a.side === ourSide ? 'ours' : 'partner', action: a.action === 'ban' ? 'ban' : 'pick', hero };
  });
  const h = out.map((a) => a.hero); need(new Set(h).size === h.length, 'The same hero is twice in the draft.');
  return out.sort((a, b) => a.order - b.order);
}
// What the coach changed compared with what the screenshot read: one line per changed cell.
// Kept with the game so extraction accuracy can be measured per game and prompt version.
export function corrections(base, edited, defs) {
  const out = [];
  const add = (field, from, to) => { if (String(from ?? '') !== String(to ?? '')) out.push({ field, from: from ?? null, to: to ?? null }); };
  add('ourSide', base.ourSide, edited.ourSide); add('result', base.result, edited.result); add('durationS', base.durationS, edited.durationS == null || edited.durationS === '' ? null : Number(edited.durationS));
  base.players.forEach((b, i) => {
    const e = edited.players[i]; if (!e) { out.push({ field: `row${i + 1}`, from: 'present', to: 'removed' }); return; }
    add(`row${i + 1}.side`, b.side, e.side); add(`row${i + 1}.hero`, b.hero, e.hero); add(`row${i + 1}.player`, b.player, e.player);
    for (const d of defs) add(`row${i + 1}.${d.key}`, b.stats[d.key], e.stats?.[d.key] === '' ? null : e.stats?.[d.key] == null ? null : Number(e.stats[d.key]));
  });
  return out;
}
// Cells the AI filled (for the accuracy rate): side, hero, player and each stat per row, plus 3 game fields.
export const cellsRead = (base) => 3 + base.players.length * (3 + STAT_DEFS[base.game].length);

// A game typed by hand: an empty confirm screen with our roster on our side.
export function blankGame(title, roster, ourSide) {
  const game = gameOf(title); const sides = GAME_SIDES[game]; const side = ourSide || sides[0];
  const other = sides.find((s) => s !== side);
  const row = (s, slot, player) => ({ side: s, slot, nameSeen: '', player, hero: '', mvp: false, stats: Object.fromEntries(STAT_DEFS[game].map((d) => [d.key, null])), flags: [] });
  return { title, game, sides, ourSide: side, winner: '', result: '', durationS: null, score: {},
    players: [...[0, 1, 2, 3, 4].map((i) => row(side, i + 1, roster[i] || '')), ...[0, 1, 2, 3, 4].map((i) => row(other, i + 1, ''))], issues: [] };
}

// Result of a scrim session from its confirmed games (latest version of each game number).
export function latestGames(games) {
  const by = new Map();
  for (const g of [...games].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    if (g.supersedes) by.delete(g.supersedes);
    by.set(g.id, g);
  }
  return [...by.values()];
}
export function gamesResult(games) {
  return { won: games.filter((g) => g.result === 'win').length, lost: games.filter((g) => g.result === 'loss').length };
}

// Accuracy of screenshot reading: share of AI-read cells the coach changed, per title.
export function extractionAccuracy(games) {
  const snap = games.filter((g) => g.source === 'screenshot');
  const cells = snap.reduce((a, g) => a + 3 + g.players.length * (3 + STAT_DEFS[g.game].length), 0);
  const changed = snap.reduce((a, g) => a + (g.corrections || []).length, 0);
  return { games: snap.length, cells, changed, rate: cells ? Math.round((changed / cells) * 1000) / 10 : null };
}

// Learnt names: when a coach matches an unfamiliar on-screen name to a roster player, remember it.
export function learnAliases(aliases, game) {
  const out = JSON.parse(JSON.stringify(aliases || {}));
  for (const p of game.players) {
    if (p.team !== 'ours' || !p.player || p.player === 'stand-in' || !p.nameSeen) continue;
    if (norm(p.nameSeen) === norm(p.player)) continue;
    const list = (out[p.player] ||= []);
    if (!list.some((a) => norm(a) === norm(p.nameSeen))) list.push(p.nameSeen);
    if (list.length > 10) list.shift();
  }
  return out;
}
export { PLAYER_FIELDS };
