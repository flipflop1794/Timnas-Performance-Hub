import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankGame } from '../src/core/capture.js';
import { scannerGame, applyLocalScan, sameReviewedResult } from '../src/core/scrim_log_ocr.js';

const heroes = ['Miya', 'Akai', 'Chou', 'Fanny', 'Tigreal'];
function draft(title) {
  const game = blankGame(title, []);
  game.players.slice(0, 5).forEach((p, i) => { p.hero = heroes[i]; p.player = `Player ${i + 1}`; });
  return game;
}

for (const title of ['MLBB', 'MLBB Women']) test(`${title}: reviewed local OCR fills the game without changing the rival rows`, () => {
  const game = draft(title);
  const input = scannerGame(game);
  assert.deepEqual(input.ourPicks.map((p) => p.hero), heroes);
  const result = applyLocalScan(game, {
    rows: input.ourPicks.map((p, pickIndex) => ({ ...p, pickIndex, values: { kills: String(pickIndex + 1), deaths: '0', assists: '3', gold: '12000', damage: '45000', damageTaken: '27000' }, ir: '9.4' })),
    duration: '18:42', result: 'Win', mvp: 'Player 1', teamKills: 15, opponentTeamKills: 7,
    scanReview: { checkedAgainstScreenshot: true, reviewedAt: '2026-11-23T00:00:00Z' },
  });
  assert.equal(result.durationS, 1122);
  assert.equal(result.result, 'win');
  assert.equal(result.players[0].stats.hero_damage, 45000);
  assert.equal(result.players[0].stats.damage_taken, 27000);
  assert.equal(result.players[0].stats.rating, 9.4);
  assert.equal(result.players[0].mvp, true);
  assert.equal(result.players[5].hero, '');
  assert.equal(result.teamKills, 15);
  assert.equal(result.opponentTeamKills, 7);
  assert.equal(result.scanReview.checkedAgainstScreenshot, true);
  assert.equal(sameReviewedResult(result, { ...result, players: result.players.map((p) => ({ ...p, stats: { ...p.stats } })) }), true);
  const manuallyEdited = structuredClone(result); manuallyEdited.players[0].stats.kills = 8;
  assert.equal(sameReviewedResult(result, manuallyEdited), false);
  assert.equal(game.players[0].stats.kills, null);
});

test('a changed draft cannot receive an earlier OCR result', () => {
  const game = draft('MLBB');
  const rows = scannerGame(game).ourPicks.map((pick, pickIndex) => ({ ...pick, pickIndex, values: { kills: '5' } }));
  rows[0].hero = 'Ling';
  assert.throws(() => applyLocalScan(game, { rows }), /draft changed/);
  assert.throws(() => applyLocalScan(game, { rows: rows.slice(0, 4) }), /all five player rows/);
});
