// AI screenshot capture for scrim games (V1.13): turns what the model read from an end-of-game or
// draft screenshot into a proposal the coach confirms, and validates the confirmed game record.
// Game-agnostic: per-game differences are data (sides, stats, hero catalogue). Nothing here calls the
// model; the server function does, and this module never trusts its answer: every value is checked,
// matched to the hero catalogue and the roster, and shown for confirmation.
//
// Learnt from real end screens (6 Nov 2026 test):
// - MLBB's result screen puts the screenshot owner's team on the LEFT; VICTORY/DEFEAT is from that
//   team's view; the map side (blue/red base) is not shown, so the coach sets it.
// - Heroes are portraits (often skins): only "sure" readings are filled in; otherwise the coach picks
//   from the AI's candidates, earlier corrections and the player's own recent heroes.
// - Dota (and MLBB's Data tab) spread a game over two screens: a second screenshot merges into the first.
import { CAPTURE_GAMES, GAME_SIDES, MAP_SIDES, PLAYER_FIELDS, gameOf } from '../../supabase/functions/_shared/scrim_spec.js';

export { CAPTURE_GAMES, gameOf, MAP_SIDES };
export const SIDE_LABEL = { left: 'Left team', right: 'Right team', blue: 'Blue', red: 'Red', radiant: 'Radiant', dire: 'Dire' };

// Stats per game: which the confirm screen shows, how they read, and what feeds the player trail.
// higher: true when more is better for the player; null when it depends on role.
export const STAT_DEFS = {
  mlbb: [
    { key: 'kills', label: 'K', higher: true, trail: true }, { key: 'deaths', label: 'D', higher: false, trail: true }, { key: 'assists', label: 'A', higher: true, trail: true },
    { key: 'gold', label: 'Gold', higher: true, trail: true }, { key: 'rating', label: 'Rating', higher: true, trail: true, decimal: true },
    { key: 'hero_damage', label: 'Hero dmg', higher: true, trail: true }, { key: 'damage_taken', label: 'Dmg taken', higher: null, trail: false },
    { key: 'tower_damage', label: 'Turret dmg', higher: true, trail: false },
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
  kills: [0, 50], deaths: [0, 35], assists: [0, 70], gold: [0, 70000], hero_damage: [0, 400000], damage_taken: [0, 400000], tower_damage: [0, 80000],
  last_hits: [0, 1500], denies: [0, 150], gpm: [0, 1800], xpm: [0, 2200], rating: [0, 18],
};
const DURATION = [180, 7200];
export const durationText = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
export function parseDuration(text) {
  const t = String(text ?? '').trim(); if (!t) return null;
  const m = t.match(/^(\d{1,3})(?:[:.](\d{1,2}))?$/); if (!m) throw new Error('Duration must look like 18:42 (minutes:seconds).');
  if (m[2] && Number(m[2]) > 59) throw new Error('Duration seconds must be 0 to 59.');
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

// A number the model returned: finite and >= 0, else null ("not shown").
const numOrNull = (v, decimal) => { const n = Number(v); if (v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(n) || n < 0) return null; return decimal ? Math.round(n * 10) / 10 : Math.round(n); };

// ---------------------------------------------------------------- scoreboard proposal
// raw: the model's JSON (scrim_spec.scoreboardSchema). Returns what the confirm screen shows:
// values, a flag per uncertain cell (with the reason) and issues for the whole game.
export function proposeGame({ title, raw, roster = [], aliases = {}, heroes }) {
  const game = gameOf(title); if (!game) throw new Error(`Screenshot capture is not set up for ${title}.`);
  const sides = GAME_SIDES[game]; const defs = STAT_DEFS[game];
  const issues = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = r.screen_kind;
  if (r.outcome === 'invalid') issues.push({ level: 'block', text: 'This game was voided (INVALID on the screen). It does not count; there is nothing to save.' });
  else if (r.readable === false || !['result', 'stats_detail'].includes(kind)) {
    issues.push({ level: 'block', text: kind === 'draft_or_loading' ? 'This looks like a draft or loading screen. Use "Add draft screenshot" for it, and upload the end-of-game screen here.' : 'This does not look like an end-of-game screen. Upload the screen shown right after the game.' });
  }
  const list = Array.isArray(r.players) ? r.players.filter((p) => p && typeof p === 'object').slice(0, 12) : [];
  const players = list.map((p, i) => {
    const flags = [];
    const uncertain = new Set(Array.isArray(p.uncertain_fields) ? p.uncertain_fields : []);
    const guess = heroes.find(p.hero);
    const sure = p.hero_sure === true && !!guess;
    const candidates = [...new Set([guess, ...(Array.isArray(p.hero_candidates) ? p.hero_candidates : []).map((h) => heroes.find(h))].filter(Boolean))].slice(0, 4);
    const hero = sure ? guess : '';
    if (!hero) flags.push({ field: 'hero', reason: guess ? `AI not sure (best guess ${guess})` : p.hero ? `"${String(p.hero).slice(0, 30)}" is not in the hero list` : 'hero not recognised' });
    const player = matchPlayer(p.name_seen, roster, aliases);
    const stats = {};
    for (const d of defs) {
      const v = numOrNull(p[d.key], d.decimal);
      stats[d.key] = v;
      if (v == null) { if (kind === 'result' && ['kills', 'deaths', 'assists'].includes(d.key)) flags.push({ field: d.key, reason: 'not read' }); continue; }
      const [lo, hi] = RANGE[d.key];
      if (v < lo || v > hi) flags.push({ field: d.key, reason: `unusual value (${v})` });
      else if (uncertain.has(d.key)) flags.push({ field: d.key, reason: 'AI unsure' });
    }
    const side = sides.includes(p.side) ? p.side : '';
    if (!side) flags.push({ field: 'side', reason: 'team not shown' });
    if (!p.name_seen || uncertain.has('name')) flags.push({ field: 'name', reason: 'name unclear' });
    return { side, slot: Number.isInteger(p.slot) && p.slot > 0 && p.slot <= 5 ? p.slot : (i % 5) + 1, nameSeen: String(p.name_seen || '').slice(0, 60), player, hero, aiHero: guess || '', candidates, mvp: p.mvp === true, stats, flags };
  });
  // Duplicate hero readings: only sure ones count (an unsure guess is not filled in anyway).
  const seen = new Map();
  for (const p of players) { if (!p.hero) continue; if (seen.has(p.hero)) { p.flags.push({ field: 'hero', reason: `${p.hero} appears twice` }); seen.get(p.hero).flags.push({ field: 'hero', reason: `${p.hero} appears twice` }); } else seen.set(p.hero, p); }
  if (players.length && players.length !== 10) issues.push({ level: 'check', text: `The screenshot shows ${players.length} player rows, not 10. Check for a cropped or scrolled screen.` });
  for (const s of sides) {
    const n = players.filter((p) => p.side === s).length;
    if (players.length === 10 && n !== 5) issues.push({ level: 'check', text: `${SIDE_LABEL[s]} has ${n} players. Check the team of each row.` });
  }
  // Our team: the one holding most of our roster. MLBB without a match: the left team (the screenshot
  // owner's), which is ours when a player of ours took it.
  const mine = Object.fromEntries(sides.map((s) => [s, players.filter((p) => p.side === s && p.player).length]));
  const best = sides.filter((s) => mine[s] >= 3 && mine[s] > Math.max(...sides.filter((x) => x !== s).map((x) => mine[x])));
  let ourSide = best.length === 1 ? best[0] : '';
  if (!ourSide && game === 'mlbb' && players.length && !Object.values(mine).some((n) => n >= 3)) {
    ourSide = 'left'; issues.push({ level: 'check', text: 'Our team was not recognised by name, so it is set to the left team (the one who took the screenshot). Change it if the screenshot came from the other team.' });
  } else if (!ourSide && players.length) issues.push({ level: 'check', text: 'Could not tell which team is ours from the player names. Pick our team.' });
  const score = {};
  for (const s of sides) {
    score[s] = numOrNull(r.score?.[s]);
    const rows = players.filter((p) => p.side === s);
    const known = rows.every((p) => p.stats.kills != null);
    const sum = rows.reduce((a, p) => a + (p.stats.kills ?? 0), 0);
    if (score[s] != null && rows.length && known && sum !== score[s]) issues.push({ level: 'check', text: `${SIDE_LABEL[s]} kills add up to ${sum}, but the score shows ${score[s]}. One K value is probably misread.` });
  }
  // Winner from the printed outcome.
  const winner = game === 'mlbb' ? (r.outcome === 'victory' ? 'left' : r.outcome === 'defeat' ? 'right' : '') : (r.outcome === 'radiant_victory' ? 'radiant' : r.outcome === 'dire_victory' ? 'dire' : '');
  const durationS = numOrNull(r.duration_seconds);
  if (durationS != null && (durationS < DURATION[0] || durationS > DURATION[1])) issues.push({ level: 'check', text: `Duration ${durationText(durationS)} looks wrong.` });
  if (durationS == null && players.length && kind === 'result') issues.push({ level: 'check', text: 'Duration not read. Type it in (minutes:seconds).' });
  if (!winner && players.length && kind === 'result') issues.push({ level: 'check', text: 'The winner is not shown. Pick the result.' });
  if (kind === 'stats_detail') issues.push({ level: 'check', text: game === 'dota' ? 'This is the Scoreboard tab. Add the Overview screenshot of the same game too (result, K/D/A, net worth): "Add another screenshot".' : 'This is the Data tab. Add the result screen of the same game too (VICTORY/DEFEAT, K/D/A, gold): "Add another screenshot".' });
  if (r.notes) issues.push({ level: 'check', text: `AI note: ${String(r.notes).slice(0, 200)}` });
  const teamNames = Object.fromEntries(sides.map((s) => [s, String(r.team_names?.[s] || '').slice(0, 60)]));
  return {
    title, game, sides, kind, ourSide, winner, result: ourSide && winner ? (winner === ourSide ? 'win' : 'loss') : '',
    mapSide: game === 'dota' ? ourSide : '', durationS, score, teamNames,
    players: [...players].sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side) || a.slot - b.slot), issues,
  };
}

// A second screenshot of the same game (Dota Scoreboard tab, MLBB Data tab, or the other way round):
// fill what the first one lacks; flag values the two screenshots disagree on.
export function mergeGames(a, b) {
  const out = JSON.parse(JSON.stringify(a)); const issues = [];
  if (b.issues.some((i) => i.level === 'block')) return { game: out, issues: b.issues.filter((i) => i.level === 'block') };
  // Match rows by name (one screen may show the clan tag and the other not, and the two Dota screens can
  // list players in a different order), then by a sure hero, and only then by position (flagged).
  const key = (p) => norm(p.nameSeen);
  const sameName = (x, y) => key(x).length >= 3 && key(y).length >= 3 && (key(x) === key(y) || key(x).endsWith(key(y)) || key(y).endsWith(key(x)) || key(x).startsWith(key(y)) || key(y).startsWith(key(x)));
  let matched = 0; const used = new Set();
  for (const pb of b.players) {
    const free = out.players.filter((p) => p.side === pb.side && !used.has(p));
    let pa = free.find((p) => sameName(p, pb)) || (pb.hero ? free.find((p) => p.hero === pb.hero) : null);
    if (!pa) { pa = free.find((p) => p.slot === pb.slot); if (pa) pa.flags.push({ field: 'name', reason: 'matched to the other screenshot by position only: check' }); }
    if (!pa) continue; used.add(pa); matched++;
    for (const [k, v] of Object.entries(pb.stats)) {
      if (v == null) continue;
      if (pa.stats[k] == null) pa.stats[k] = v;
      else if (pa.stats[k] !== v) pa.flags.push({ field: k, reason: `the two screenshots disagree (${pa.stats[k]} vs ${v})` });
    }
    if (!pa.hero && pb.hero) { pa.hero = pb.hero; pa.flags = pa.flags.filter((f) => f.field !== 'hero'); }
    for (const c of pb.candidates || []) if (!pa.candidates.includes(c)) pa.candidates.push(c);
    if (!pa.nameSeen && pb.nameSeen) pa.nameSeen = pb.nameSeen;
    if (!pa.player && pb.player) pa.player = pb.player;
  }
  if (matched < Math.min(5, b.players.length)) issues.push({ level: 'check', text: `Only ${matched} player rows of the second screenshot matched the first one. Is it the same game?` });
  if (out.durationS == null) out.durationS = b.durationS; else if (b.durationS != null && Math.abs(b.durationS - out.durationS) > 60) issues.push({ level: 'check', text: `The screenshots show different durations (${durationText(out.durationS)} vs ${durationText(b.durationS)}). Same game?` });
  if (!out.winner && b.winner) { out.winner = b.winner; }
  if (!out.ourSide && b.ourSide) out.ourSide = b.ourSide;
  if (out.game === 'dota' && !out.mapSide) out.mapSide = out.ourSide;
  for (const s of out.sides) if (out.score[s] == null) out.score[s] = b.score[s];
  out.result = out.ourSide && out.winner ? (out.winner === out.ourSide ? 'win' : 'loss') : out.result;
  // Issues of the first screenshot that the second one resolved ("add the other screen", missing duration or winner) go.
  out.issues = [...out.issues.filter((i) => !/Add the (Overview|result) screenshot|Duration not read|winner is not shown/.test(i.text) || (/Duration/.test(i.text) && out.durationS == null) || (/winner/.test(i.text) && !out.winner)),
    ...b.issues.filter((i) => /AI note|kills add up/.test(i.text)), ...issues];
  out.kind = out.kind === 'result' || b.kind === 'result' ? 'result' : out.kind;
  return { game: out, issues };
}

// Hero choices for one row when the AI was not sure: its candidates, then what coaches corrected the
// same AI reading to before, then the player's own most-played heroes in confirmed scrims.
export function heroChoices(row, { memory = {}, playerHeroes = {} } = {}) {
  const fromMemory = row.aiHero ? Object.entries(memory[row.aiHero] || {}).sort((a, b) => b[1] - a[1]).map(([h]) => h) : [];
  const own = row.player ? (playerHeroes[row.player] || []) : [];
  return [...new Set([...fromMemory, ...(row.candidates || []), ...own])].filter((h) => h && h !== row.hero).slice(0, 5);
}
// memory: AI reading → { hero the coach confirmed: count }, from confirmed games (only where they differed).
export function heroMemory(games) {
  const m = {};
  for (const g of games) for (const p of g.players || []) if (p.aiHero && p.hero && p.aiHero !== p.hero) { (m[p.aiHero] ||= {})[p.hero] = (m[p.aiHero][p.hero] || 0) + 1; }
  return m;
}
export function playerHeroes(games) {
  const c = {};
  for (const g of games) for (const p of g.players || []) if (p.team === 'ours' && p.player && p.hero) { (c[p.player] ||= {})[p.hero] = (c[p.player][p.hero] || 0) + 1; }
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 5)]));
}

// The same game added twice (two screenshots of one result, or one already saved): same kill score and
// duration within 5 s. Returns the earlier game's label or ''.
export function findDuplicate(proposal, games) {
  if (proposal.durationS == null) return '';
  const sides = proposal.sides;
  const sc = (g) => sides.map((s) => g.score?.[s]).join('-');
  if (sides.some((s) => proposal.score[s] == null)) return '';
  const mine = sc(proposal);
  const hit = games.find((g) => g.game === proposal.game && sc(g) === mine && g.durationS != null && Math.abs(g.durationS - proposal.durationS) <= 5);
  return hit ? `${hit.partner ? `vs ${hit.partner}, ` : ''}${hit.date ? `${hit.date}, ` : ''}game ${hit.gameNo || '?'}` : '';
}

// Draft screenshot → proposed actions, matched to the hero catalogue.
export function proposeDraft({ title, raw, heroes }) {
  const game = gameOf(title); if (!game) throw new Error(`Screenshot capture is not set up for ${title}.`);
  const sides = GAME_SIDES[game]; const issues = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  if (r.readable === false || !['draft', 'loading'].includes(r.screen_kind)) issues.push({ level: 'block', text: 'This does not look like a draft or loading screen.' });
  const actions = (Array.isArray(r.actions) ? r.actions : []).filter((a) => a && typeof a === 'object').slice(0, 30).map((a, i) => {
    const guess = heroes.find(a.hero); const flags = [];
    const hero = a.hero_sure === true ? guess : '';
    const candidates = [...new Set([guess, ...(Array.isArray(a.hero_candidates) ? a.hero_candidates : []).map((h) => heroes.find(h))].filter(Boolean))].slice(0, 4);
    if (!hero) flags.push({ field: 'hero', reason: guess ? `AI not sure (best guess ${guess})` : a.hero ? `"${String(a.hero).slice(0, 30)}" is not in the hero list` : 'hero not recognised' });
    if (a.order_sure === false) flags.push({ field: 'order', reason: 'AI unsure of the order' });
    return { order: Number.isInteger(a.order) && a.order > 0 ? a.order : i + 1, side: sides.includes(a.side) ? a.side : '', action: a.action === 'ban' ? 'ban' : 'pick', hero, aiHero: guess || '', candidates, playerName: String(a.player_name || '').slice(0, 60), flags };
  }).sort((a, b) => a.order - b.order);
  const seen = new Set();
  for (const a of actions) { if (!a.hero) continue; if (seen.has(a.hero)) a.flags.push({ field: 'hero', reason: `${a.hero} appears twice` }); seen.add(a.hero); }
  for (const s of sides) { const n = actions.filter((a) => a.side === s && a.action === 'pick').length; if (actions.length && n !== 5) issues.push({ level: 'check', text: `${SIDE_LABEL[s]} shows ${n} picks, not 5.` }); }
  if (r.notes) issues.push({ level: 'check', text: `AI note: ${String(r.notes).slice(0, 200)}` });
  return { title, game, sides, firstPick: sides.includes(r.first_pick_side) ? r.first_pick_side : '', actions, issues };
}
// The picks of a draft fill blank heroes of the game (matched by player name, then by order of picks).
export function heroesFromDraft(game, draft, heroes) {
  const out = JSON.parse(JSON.stringify(game));
  for (const s of out.sides) {
    const picks = draft.actions.filter((a) => a.side === s && a.action === 'pick' && heroes.find(a.hero));
    const rows = out.players.filter((p) => p.side === s);
    for (const pk of picks) {
      const byName = pk.playerName ? rows.find((p) => norm(p.nameSeen) && norm(p.nameSeen) === norm(pk.playerName)) : null;
      if (byName && !byName.hero) { byName.hero = heroes.find(pk.hero); byName.flags = byName.flags.filter((f) => f.field !== 'hero'); }
    }
    for (const p of rows) { for (const pk of picks) { const h = heroes.find(pk.hero); if (h && !p.candidates.includes(h) && !rows.some((q) => q.hero === h)) p.candidates.push(h); } }
  }
  return out;
}

// ---------------------------------------------------------------- the confirmed game record
const need = (c, m) => { if (!c) throw new Error(m); };
// edited: the values on the confirm screen (proposal shape). base: the untouched proposal from the
// screenshot (or null for a game typed by hand). Throws a plain sentence on the first problem.
export function confirmGame(edited, { reportId = '', date, partner, gameNo, by, base = null, captureIds = [], heroes, draft = null, externalMatchId = '' }) {
  const game = gameOf(edited.title); need(game, `Screenshot capture is not set up for ${edited.title}.`);
  const sides = GAME_SIDES[game]; const defs = STAT_DEFS[game];
  need(/^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'Date is required.');
  need(sides.includes(edited.ourSide), 'Pick which team is ours.');
  need(['win', 'loss'].includes(edited.result), 'Pick the result: win or loss.');
  need(Number.isInteger(gameNo) && gameNo >= 1 && gameNo <= 9, 'Game number must be 1 to 9.');
  const mapSide = game === 'dota' ? edited.ourSide : (MAP_SIDES.mlbb.includes(edited.mapSide) ? edited.mapSide : '');
  const durationS = edited.durationS == null || edited.durationS === '' ? null : Number(edited.durationS);
  need(durationS == null || (Number.isInteger(durationS) && durationS >= 60 && durationS <= 10800), 'Duration must be between 1:00 and 180:00.');
  const players = edited.players.map((p) => {
    need(sides.includes(p.side), 'Every row needs a team.');
    const hero = heroes.find(p.hero);
    need(!String(p.hero || '').trim() || hero, `"${String(p.hero).trim()}" is not a hero name. Pick one from the list.`);
    const ours = p.side === edited.ourSide;
    need(hero || !ours, `Pick the hero for ${p.player || p.nameSeen || 'each of our players'} (our heroes are required).`);
    const stats = {};
    for (const d of defs) {
      const raw = p.stats?.[d.key]; const v = raw === '' || raw == null ? null : Number(raw);
      need(v == null || (Number.isFinite(v) && v >= 0), `${d.label} for ${p.player || p.nameSeen || hero} must be a number.`);
      stats[d.key] = v == null ? null : d.decimal ? Math.round(v * 10) / 10 : Math.round(v);
    }
    if (ours) for (const k of ['kills', 'deaths', 'assists']) need(stats[k] != null, `K/D/A is required for our players (${p.player || p.nameSeen || hero}).`);
    return { team: ours ? 'ours' : 'partner', side: p.side, slot: Number(p.slot) || 0, nameSeen: String(p.nameSeen || '').slice(0, 60), player: ours ? String(p.player || '') : '', hero: hero || '', aiHero: p.aiHero || '', mvp: !!p.mvp, stats };
  });
  const ours = players.filter((p) => p.team === 'ours');
  need(ours.length === 5, `Our team needs exactly 5 players (now ${ours.length}).`);
  need(ours.every((p) => p.player), 'Match each of our players to the roster (or pick "stand-in").');
  const named = ours.filter((p) => p.player !== 'stand-in').map((p) => p.player);
  need(new Set(named).size === named.length, 'The same roster player is on two rows.');
  const heroesUsed = players.map((p) => p.hero).filter(Boolean);
  need(new Set(heroesUsed).size === heroesUsed.length, 'The same hero is on two rows.');
  const score = Object.fromEntries(sides.map((s) => [s, players.filter((p) => p.side === s).reduce((a, p) => a + (p.stats.kills ?? 0), 0)]));
  const confirmedDraft = draft ? confirmDraft(draft, { heroes, ourSide: edited.ourSide, sides }) : [];
  // Draft picks must match the heroes of the game.
  for (const a of confirmedDraft) if (a.action === 'pick') need(players.some((p) => p.side === a.side && p.hero === a.hero), `The draft says ${SIDE_LABEL[a.side]} picked ${a.hero}, but no row of that team has ${a.hero}.`);
  return {
    id: `GM-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
    title: edited.title, game, reportId, date, partner: String(partner || '').trim(), gameNo, by: String(by || '').trim(),
    ourSide: edited.ourSide, mapSide, result: edited.result, durationS, score, players,
    draft: confirmedDraft, firstPick: draft?.firstPick || '',
    source: base ? 'screenshot' : 'manual', captureIds, externalMatchId: String(externalMatchId || '').replace(/\D/g, '').slice(0, 20),
    corrections: base ? corrections(base, edited, defs) : [],
    origin: 'operational', createdAt: new Date().toISOString(),
  };
}
function confirmDraft(d, { heroes, ourSide, sides }) {
  const out = d.actions.filter((a) => String(a.hero || '').trim()).map((a, i) => {
    need(sides.includes(a.side), 'Every pick or ban needs a team.');
    const hero = heroes.find(a.hero); need(hero, `"${a.hero}" in the draft is not a hero name. Pick one from the list, or clear it.`);
    return { order: Number(a.order) || i + 1, side: a.side, team: a.side === ourSide ? 'ours' : 'partner', action: a.action === 'ban' ? 'ban' : 'pick', hero };
  });
  const h = out.map((a) => a.hero); need(new Set(h).size === h.length, 'The same hero is twice in the draft.');
  return out.sort((a, b) => a.order - b.order);
}
// What the coach changed compared with what the screenshot read: one line per changed cell.
// Kept with the game so extraction accuracy can be measured per game and prompt version. A hero the AI
// left blank (not sure) counts as changed only when its best guess was different.
export function corrections(base, edited, defs) {
  const out = [];
  const add = (field, from, to) => { if (String(from ?? '') !== String(to ?? '')) out.push({ field, from: from ?? null, to: to ?? null }); };
  add('ourSide', base.ourSide, edited.ourSide); add('result', base.result, edited.result); add('durationS', base.durationS, edited.durationS == null || edited.durationS === '' ? null : Number(edited.durationS));
  base.players.forEach((b, i) => {
    const e = edited.players[i]; if (!e) { out.push({ field: `row${i + 1}`, from: 'present', to: 'removed' }); return; }
    add(`row${i + 1}.side`, b.side, e.side); add(`row${i + 1}.hero`, b.hero || b.aiHero, e.hero); add(`row${i + 1}.player`, b.player, e.player);
    for (const d of defs) add(`row${i + 1}.${d.key}`, b.stats[d.key], e.stats?.[d.key] === '' ? null : e.stats?.[d.key] == null ? null : Number(e.stats[d.key]));
  });
  return out;
}

// A game typed by hand: an empty confirm screen with our roster on our side.
export function blankGame(title, roster, ourSide) {
  const game = gameOf(title); const sides = GAME_SIDES[game]; const side = ourSide || sides[0];
  const other = sides.find((s) => s !== side);
  const row = (s, slot, player) => ({ side: s, slot, nameSeen: '', player, hero: '', aiHero: '', candidates: [], mvp: false, stats: Object.fromEntries(STAT_DEFS[game].map((d) => [d.key, null])), flags: [] });
  return { title, game, sides, kind: 'manual', ourSide: side, winner: '', result: '', mapSide: game === 'dota' ? side : '', durationS: null, score: {}, teamNames: {},
    players: [...[0, 1, 2, 3, 4].map((i) => row(side, i + 1, roster[i] || '')), ...[0, 1, 2, 3, 4].map((i) => row(other, i + 1, ''))], issues: [] };
}
// A saved game back on the check screen (to fix it): same shape as a proposal.
export function gameToProposal(g) {
  const sides = GAME_SIDES[g.game];
  return { title: g.title, game: g.game, sides, kind: 'saved', ourSide: g.ourSide, winner: '', result: g.result, mapSide: g.mapSide || '', durationS: g.durationS, score: g.score || {}, teamNames: {},
    players: g.players.map((p) => ({ side: p.side, slot: p.slot, nameSeen: p.nameSeen, player: p.player, hero: p.hero, aiHero: p.aiHero || '', candidates: [], mvp: p.mvp, stats: { ...p.stats }, flags: [] })), issues: [] };
}

// Result of a scrim session from its confirmed games (latest version of each game).
export function latestGames(games) {
  const by = new Map(); const gone = new Set();
  for (const g of [...games].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    if (g.supersedes) gone.add(g.supersedes);
    by.set(g.id, g);
  }
  return [...by.values()].filter((g) => !gone.has(g.id));
}
export function gamesResult(games) {
  return { won: games.filter((g) => g.result === 'win').length, lost: games.filter((g) => g.result === 'loss').length };
}

// Accuracy of screenshot reading: share of AI-read cells the coach changed, per title.
export function extractionAccuracy(games) {
  const snap = games.filter((g) => g.source === 'screenshot');
  const cells = snap.reduce((a, g) => a + 3 + g.players.length * (3 + STAT_DEFS[g.game].length), 0);
  const changed = snap.reduce((a, g) => a + (g.corrections || []).length, 0);
  const heroRows = snap.reduce((a, g) => a + g.players.filter((p) => p.hero).length, 0);
  const heroFixed = snap.reduce((a, g) => a + (g.corrections || []).filter((c) => /\.hero$/.test(c.field)).length, 0);
  return { games: snap.length, cells, changed, rate: cells ? Math.round((changed / cells) * 1000) / 10 : null, heroRate: heroRows ? Math.round((heroFixed / heroRows) * 1000) / 10 : null };
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
