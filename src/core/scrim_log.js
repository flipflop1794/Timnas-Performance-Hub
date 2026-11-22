// V1.38 Scrim Log input for MLBB and MLBB Women: one entry per game, as the EVOS Scrim Log records it
// (side FP / SP, map, bans B1–B5 and picks P1–P5 with the player, opponent bans and picks, result,
// duration, VOD link, game notes; time slot per session). The scrim report keeps the session's story
// (focus, what worked or failed, adjustment, plan rating); its result is counted from the games.
//
// Draft order: Scrim Log records the order of bans and picks WITHIN each team. The order between the two
// teams is not recorded, so it is not reconstructed here: our actions come first in the stored draft,
// then the partner's, each in its own order. Consumers read the draft by team (bans against us, our
// first pick), which this keeps intact.
import { hasContactNumber } from './pii.js';

export const SCRIM_LOG_TITLES = ['MLBB', 'MLBB Women'];
export const isScrimLog = (title) => SCRIM_LOG_TITLES.includes(title);
export const PICK_ORDER = ['FP', 'SP'];
export const PICK_ORDER_LABEL = { FP: 'FP', SP: 'SP' };
// V1.39: the map variants offered (the current pool). Older Scrim Log variants stay valid on saved games,
// so fixing an old game keeps its map.
export const MLBB_MAPS = ['Flying Clouds', 'Golden Turret', 'Healing Turtle', 'Revealing Wisps'];
export const MLBB_MAPS_OLD = ['Default Map', 'Broken Walls', 'Dangerous Grass', 'Expanding River'];
const KNOWN_MAPS = [...MLBB_MAPS, ...MLBB_MAPS_OLD];
export const TIME_SLOTS = ['Warmup', ...Array.from({ length: 10 }, (_, i) => `Jam ${i + 1}`), 'Tournament'];
export const MAX_BANS = 5;
export const NOTES_MAX = 500;
const VOD_MAX = 300;

const need = (c, m) => { if (!c) throw new Error(m); };
export const safeVod = (u) => { const s = String(u || '').trim(); return /^https?:\/\/\S+$/i.test(s) && s.length <= VOD_MAX ? s : ''; };

// Sort key for a time slot ("Warmup" first, then Jam 1, Jam 2 …); null when it is not a slot.
export function slotOrder(text) {
  const t = String(text || '').trim();
  if (/^warm-?up$/i.test(t)) return 0;
  const m = /^jam\s*(\d{1,2})$/i.exec(t);
  return m ? Number(m[1]) : null;
}

// The game-level Scrim Log fields, checked. edited: the values on the game screen.
export function scrimLogFields(edited) {
  need(PICK_ORDER.includes(edited.pickOrder), 'Pick FP or SP (did we pick first?).');
  const notes = String(edited.notes || '').trim();
  need(notes.length <= NOTES_MAX, `Game notes: at most ${NOTES_MAX} characters.`);
  need(!hasContactNumber(notes), 'Game notes: remove phone or ID numbers; keep performance notes only.');
  const vodIn = String(edited.vod || '').trim();
  const vod = safeVod(vodIn);
  need(!vodIn || vod, 'VOD link must start with http:// or https://.');
  return { pickOrder: edited.pickOrder, mapVariant: KNOWN_MAPS.includes(edited.mapVariant) ? edited.mapVariant : '', notes, vod };
}

// Bans and picks → the stored draft (see the note on order above). players: the confirmed rows
// ({ team, side, hero, pick }); bans: { ours: [hero text], partner: [hero text] } in ban order.
export function scrimLogDraft({ players, bans = {}, ourSide, otherSide, heroes }) {
  const out = [];
  for (const team of ['ours', 'partner']) {
    const side = team === 'ours' ? ourSide : otherSide;
    const list = (bans[team] || []).map((h) => String(h || '').trim()).filter(Boolean);
    need(list.length <= MAX_BANS, `At most ${MAX_BANS} bans per team.`);
    for (const text of list) {
      const hero = heroes.find(text);
      need(hero, `"${text}" (${team === 'ours' ? 'our ban' : 'their ban'}) is not a hero name. Pick one from the list.`);
      out.push({ order: out.length + 1, side, team, action: 'ban', hero });
    }
    const picks = players.filter((p) => p.team === team && p.hero).sort((a, b) => (a.pick || 9) - (b.pick || 9));
    for (const p of picks) out.push({ order: out.length + 1, side, team, action: 'pick', hero: p.hero, pick: p.pick || null });
  }
  const seen = new Set();
  for (const a of out) { need(!seen.has(a.hero), `${a.hero} is both banned and picked, or entered twice.`); seen.add(a.hero); }
  return out;
}

// Pick numbers of one team: whole numbers 1–5, each used once. Rows without a hero are skipped.
// (V1.39: the game screen numbers the rows itself; kept for records built elsewhere.)
export function checkPicks(players, team, label) {
  const rows = players.filter((p) => p.team === team && p.hero);
  for (const p of rows) need(Number.isInteger(p.pick) && p.pick >= 1 && p.pick <= 5, `${label}: give every hero its pick number (P1–P5).`);
  const nums = rows.map((p) => p.pick);
  need(new Set(nums).size === nums.length, `${label}: two heroes have the same pick number.`);
}

// A saved game's bans, back on the game screen.
export function bansOf(game) {
  const d = game.draft || [];
  return { ours: d.filter((a) => a.team === 'ours' && a.action === 'ban').map((a) => a.hero), partner: d.filter((a) => a.team === 'partner' && a.action === 'ban').map((a) => a.hero) };
}

// ---------------------------------------------------------------- export in the Scrim Log layout
// One row per game, columns named as in the Scrim Log Excel export, so the same analysis scripts read it.
// The result goes in a column named "Result" (the Scrim Log export leaves that header blank).
const P = [1, 2, 3, 4, 5];
export const SCRIM_LOG_HEAD = ['DATE', 'COACH', 'TEAM', 'Game', 'Side', ...P.map((i) => `B ${i}`), ...P.flatMap((i) => [`P ${i}`, `Name P${i}`]), 'Result', 'VS', 'Team',
  ...P.map((i) => `Opp B ${i}`), ...P.map((i) => `Opp P ${i}`), 'Durasi', 'LINK', 'Map', 'SESSION KEY', 'TIME SLOT', 'MVP', 'GAME NOTES', 'SESSION NOTES', 'CREATED AT',
  ...P.flatMap((i) => [`KILLS P${i}`, `DEATHS P${i}`, `ASSISTS P${i}`, `GOLD P${i}`, `DAMAGE P${i}`, `DAMAGE TAKEN P${i}`]), 'TEAM KILLS', 'OPPONENT TEAM KILLS'];

const dur = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
export function scrimLogRows(games, reports) {
  const rep = new Map(reports.map((r) => [r.id, r]));
  return [...games].filter((g) => isScrimLog(g.title))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.reportId).localeCompare(String(b.reportId)) || a.gameNo - b.gameNo)
    .map((g) => {
      const r = rep.get(g.reportId) || {};
      const d = g.draft || [];
      const list = (team, action) => d.filter((a) => a.team === team && a.action === action).map((a) => a.hero);
      const ours = g.players.filter((p) => p.team === 'ours');
      const byPick = (team) => {
        const fromDraft = d.filter((a) => a.team === team && a.action === 'pick').map((a) => g.players.find((p) => p.team === team && p.hero === a.hero)).filter(Boolean);
        return fromDraft.length ? fromDraft : g.players.filter((p) => p.team === team);
      };
      const ourRows = byPick('ours'); const theirRows = byPick('partner');
      const at = (xs, i) => (xs[i] ?? '');
      const mvp = g.players.find((p) => p.mvp);
      const story = [r.worked && `Worked: ${r.worked}`, r.failed && `Failed: ${r.failed}`, r.adjust && `Next: ${r.adjust}`].filter(Boolean).join(' | ');
      const stat = (p, k) => (p?.stats?.[k] ?? '');
      return [g.date, r.by || g.by || '', g.title, g.gameNo, g.pickOrder || '', ...P.map((i) => at(list('ours', 'ban'), i - 1)),
        ...P.flatMap((i) => { const p = ourRows[i - 1]; return [p?.hero || '', p ? (p.player === 'stand-in' ? 'stand-in' : p.player) : '']; }),
        g.result === 'win' ? 'Win' : 'Lose', 'VS', g.partner || r.partner || '',
        ...P.map((i) => at(list('partner', 'ban'), i - 1)), ...P.map((i) => theirRows[i - 1]?.hero || ''),
        dur(g.durationS), g.vod || r.vod || '', g.mapVariant || '', g.reportId || '', r.time || '', mvp ? (mvp.player || mvp.nameSeen || mvp.hero) : '',
        g.notes || '', story, g.createdAt || '',
        ...P.flatMap((i) => { const p = ourRows[i - 1]; return ['kills', 'deaths', 'assists', 'gold', 'hero_damage', 'damage_taken'].map((k) => stat(p, k)); }),
        ours.every((p) => p.stats?.kills != null) ? ours.reduce((a, p) => a + p.stats.kills, 0) : '',
        g.players.filter((p) => p.team === 'partner').every((p) => p.stats?.kills != null) ? g.players.filter((p) => p.team === 'partner').reduce((a, p) => a + p.stats.kills, 0) : ''];
    });
}
