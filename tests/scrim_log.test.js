// V1.38 — Scrim Log input for MLBB and MLBB Women: game record, draft built from bans and picks,
// validation, export in the Scrim Log layout, time slots and the FP / SP and map splits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroIndex, blankGame, confirmGame, gameToProposal } from '../src/core/capture.js';
import { isScrimLog, slotOrder, safeVod, scrimLogRows, SCRIM_LOG_HEAD, MLBB_MAPS, TIME_SLOTS } from '../src/core/scrim_log.js';
import { scrimLogCsv } from '../src/core/reports.js';
import { facts } from '../src/core/patterns.js';
import { sessionOverview } from '../src/core/daily_sessions.js';

const heroes = heroIndex(JSON.parse(readFileSync(new URL('../data/mlbb/heroes.json', import.meta.url))).heroes);
const ROSTER = ['Erlan', 'Ryza', 'Muezza', 'Rendy', 'Sense'];
const OURS = ['Paquito', 'Cecilion', 'Carmilla', 'Lukas', 'Nolan'];
const THEIRS = ['Kalea', 'Fanny', 'Cici', 'Aulus', 'Kimmy'];
const ctx = (n = 1) => ({ reportId: 'RP-1', date: '2026-11-21', partner: 'REY MPL MY', gameNo: n, by: 'Coach Jose', heroes });
function game({ title = 'MLBB', pickOrder = 'FP', result = 'win', mapVariant = 'Dangerous Grass', bans = { ours: ['Marcel', 'Atlas'], partner: ['Freya'] }, picks = null } = {}) {
  const g = blankGame(title, ROSTER, 'left');
  Object.assign(g, { pickOrder, result, mapVariant, bans, notes: 'Lord fight telat', vod: 'https://youtu.be/abc' });
  g.players.forEach((p, i) => { p.hero = i < 5 ? OURS[i] : THEIRS[i - 5]; if (i < 5) p.player = ROSTER[i]; if (picks) p.pick = picks[i]; });
  return g;
}

test('which titles use it; slots, maps and links', () => {
  assert.ok(isScrimLog('MLBB') && isScrimLog('MLBB Women')); assert.ok(!isScrimLog('Dota 2'));
  assert.deepEqual([slotOrder('Warmup'), slotOrder('Jam 4'), slotOrder('jam 10'), slotOrder('19:00 WIB'), slotOrder('')], [0, 4, 10, null, null]);
  assert.deepEqual(MLBB_MAPS, ['Default Map', 'Flying Clouds', 'Golden Turret', 'Healing Turtle', 'Revealing Wisps']); assert.equal(TIME_SLOTS[1], 'Jam 1');
  assert.equal(safeVod('javascript:alert(1)'), ''); assert.equal(safeVod('https://youtu.be/x'), 'https://youtu.be/x');
});

test('a Scrim Log game: FP / SP, map, notes, VOD; no stats needed; picks follow the rows; draft built from bans and picks', () => {
  // V1.39: the pick number is the row's place in its team; a number sent with the row is ignored.
  const g = confirmGame(game({ picks: [2, 2, 9, 4, 5, 1, 1, 3, 4, 5] }), ctx());
  assert.deepEqual([g.pickOrder, g.mapVariant, g.notes, g.vod, g.firstPick, g.draftSource], ['FP', 'Dangerous Grass', 'Lord fight telat', 'https://youtu.be/abc', 'left', 'scrim-log']);
  assert.equal(g.players[0].stats.kills, null, 'K/D/A optional');
  const ours = g.draft.filter((a) => a.team === 'ours');
  assert.deepEqual(ours.map((a) => `${a.action}:${a.hero}`), ['ban:Marcel', 'ban:Atlas', 'pick:Paquito', 'pick:Cecilion', 'pick:Carmilla', 'pick:Lukas', 'pick:Nolan'], 'P1 is the top row');
  assert.deepEqual(g.players.map((p) => p.pick), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
  assert.deepEqual(g.draft.filter((a) => a.team === 'partner' && a.action === 'ban').map((a) => a.hero), ['Freya']);
  assert.equal(confirmGame(game({ pickOrder: 'SP' }), ctx()).firstPick, 'right');
  // Back on the game screen for a fix: everything comes back.
  const back = gameToProposal(g);
  assert.deepEqual([back.pickOrder, back.mapVariant, back.notes, back.bans.ours.join(','), back.players[0].pick], ['FP', 'Dangerous Grass', 'Lord fight telat', 'Marcel,Atlas', 1]);
  assert.equal(g.mapVariant, 'Dangerous Grass', 'an older map on a saved game is kept');
  // MLBB Women works the same way.
  assert.equal(confirmGame(game({ title: 'MLBB Women' }), ctx()).pickOrder, 'FP');
});

test('refused: no FP / SP, a hero banned and picked, unknown ban, bad link, phone numbers in notes', () => {
  assert.throws(() => confirmGame(game({ pickOrder: '' }), ctx()), /Pick FP or SP/);
  assert.throws(() => confirmGame(game({ bans: { ours: ['Paquito'], partner: [] } }), ctx()), /Paquito is both banned and picked/);
  assert.throws(() => confirmGame(game({ bans: { ours: ['Batman'], partner: [] } }), ctx()), /"Batman" \(our ban\) is not a hero name/);
  assert.throws(() => confirmGame(game({ bans: { ours: ['Marcel', 'Atlas', 'Freya', 'Ling', 'Gloo', 'Joy'], partner: [] } }), ctx()), /At most 5 bans/);
  assert.throws(() => confirmGame({ ...game(), vod: 'youtube' }, ctx()), /VOD link must start/);
  assert.throws(() => confirmGame({ ...game(), notes: 'hubungi 0812 3456 7890' }, ctx()), /phone or ID/);
  const noHero = game(); noHero.players[0].hero = '';
  assert.throws(() => confirmGame(noHero, ctx()), /Pick the hero/, 'our heroes stay required');
});

test('export in the Scrim Log layout: one row per game, the same column names', () => {
  const g1 = confirmGame(game(), ctx(1)); const g2 = confirmGame(game({ pickOrder: 'SP', result: 'loss' }), ctx(2));
  const rep = { id: 'RP-1', title: 'MLBB', by: 'Coach Jose', partner: 'REY MPL MY', time: 'Jam 4', worked: 'early game', failed: 'lord', adjust: 'vision' };
  const rows = scrimLogRows([g2, g1], [rep]);
  const col = (r, name) => r[SCRIM_LOG_HEAD.indexOf(name)];
  assert.equal(rows.length, 2); assert.equal(col(rows[0], 'Game'), 1, 'sorted by game number');
  assert.deepEqual([col(rows[0], 'Side'), col(rows[0], 'B 1'), col(rows[0], 'P 1'), col(rows[0], 'Name P1'), col(rows[0], 'Result'), col(rows[0], 'Team'), col(rows[0], 'Opp B 1'), col(rows[0], 'Opp P 1')],
    ['FP', 'Marcel', 'Paquito', 'Erlan', 'Win', 'REY MPL MY', 'Freya', 'Kalea']);
  assert.deepEqual([col(rows[1], 'Result'), col(rows[0], 'Map'), col(rows[0], 'TIME SLOT'), col(rows[0], 'SESSION KEY'), col(rows[0], 'GAME NOTES')], ['Lose', 'Dangerous Grass', 'Jam 4', 'RP-1', 'Lord fight telat']);
  assert.match(col(rows[0], 'SESSION NOTES'), /Worked: early game \| Failed: lord \| Next: vision/);
  const csv = scrimLogCsv([g1], [rep]).split('\r\n');
  assert.equal(csv[0].split(',').length, SCRIM_LOG_HEAD.length); assert.ok(csv[0].startsWith('DATE,COACH,TEAM,Game,Side,B 1'));
  assert.deepEqual(scrimLogRows([{ ...g1, title: 'Dota 2' }], [rep]), [], 'other titles are not exported');
});

test('Patterns split by FP / SP and by map; time slots sort after clock times in slot order', () => {
  const gs = [game(), game({ pickOrder: 'SP', result: 'loss' }), game({ mapVariant: 'Broken Walls' })].map((g, i) => ({ ...confirmGame(g, ctx(i + 1)), createdAt: `2026-11-21T0${i}:00:00Z` }));
  const F = facts(gs, {}); const f = (id) => F.find((x) => x.id === id);
  assert.deepEqual([f('pick:FP').n, f('pick:FP').won, f('pick:SP').n], [2, 2, 1]);
  assert.deepEqual([f('map:Dangerous Grass').n, f('map:Broken Walls').n], [2, 1]);
  const S = (id, time) => ({ id, title: 'MLBB', date: '2026-11-22', time, status: 'planned' });
  const [o] = sessionOverview(['MLBB'], [S('a', 'Jam 7'), S('b', 'Jam 1'), S('c', '13:00 WIB')], [], '2026-11-22');
  assert.equal(o.next.id, 'c', 'a clock time comes first'); assert.equal(sessionOverview(['MLBB'], [S('a', 'Jam 7'), S('b', 'Jam 1')], [], '2026-11-22')[0].next.id, 'b');
});

test('player boxes start empty; players must be on the roster, once each, without Stand In', () => {
  assert.deepEqual(blankGame('MLBB', ROSTER, 'left').players.slice(0, 5).map((p) => p.player), ['', '', '', '', '']);
  assert.equal(blankGame('Dota 2', ROSTER, 'radiant').players[0].player, 'Erlan', 'other titles keep the roster pre-filled');
  const withRoster = { ...ctx(), roster: ROSTER };
  assert.equal(confirmGame(game(), withRoster).players[0].player, 'Erlan');
  const outsider = game(); outsider.players[2].player = 'Budi';
  assert.throws(() => confirmGame(outsider, withRoster), /"Budi" is not on the MLBB roster/);
  const twice = game(); twice.players[1].player = 'Erlan';
  assert.throws(() => confirmGame(twice, withRoster), /same roster player is on two rows/);
  const subs = game(); subs.players[3].player = 'stand-in'; subs.players[4].player = 'stand-in';
  assert.throws(() => confirmGame(subs, withRoster), /Stand In is not available/);
  const empty = game(); empty.players[0].player = '';
  assert.throws(() => confirmGame(empty, withRoster), /Match each of our players/);
  // Heroes: one hero once in the whole game (bans and picks of both teams).
  assert.throws(() => confirmGame(game({ bans: { ours: ['Kalea'], partner: [] } }), ctx()), /Kalea is both banned and picked/);
  assert.throws(() => confirmGame(game({ bans: { ours: ['Ling'], partner: ['Ling'] } }), ctx()), /Ling is both banned and picked, or entered twice/);
  const sameHero = game(); sameHero.players[6].hero = 'Paquito';
  assert.throws(() => confirmGame(sameHero, ctx()), /same hero is on two rows/);
});
