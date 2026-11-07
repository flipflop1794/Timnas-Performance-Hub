// V1.13 — AI screenshot capture, debrief split, pattern digest and stat trail (core logic, no network).
// Includes six REAL MLBB result screens (r-n/ml_yolo_dataset, MIT) as read by eye, with the true heroes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroIndex, matchPlayer, proposeGame, proposeDraft, mergeGames, heroesFromDraft, heroChoices, heroMemory, playerHeroes, findDuplicate, confirmGame, blankGame, gameToProposal, gamesResult, latestGames, extractionAccuracy, learnAliases, parseDuration } from '../src/core/capture.js';
import { checkDebriefInput, checkDebriefSplit } from '../src/core/debrief.js';
import { facts, checkFindings, findingRecord, markFinding, statTrail, statGoal, statGoalProgress, standInRecord, digestPayload } from '../src/core/patterns.js';
import { scoreboardSchema, draftSchema, digestSchema, debriefSchema, scoreboardPrompt, draftPrompt, messagesRequest, imageBlock, parseModelJson, capturePath, SLUG_TITLE } from '../supabase/functions/_shared/scrim_spec.js';

const mlbbHeroes = heroIndex(JSON.parse(readFileSync(new URL('../data/mlbb/heroes.json', import.meta.url))).heroes);
const dotaHeroes = heroIndex(readFileSync(new URL('../data/dota/heroes.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => ({ name: l.split(',')[1] })));
const REAL = JSON.parse(readFileSync(new URL('./fixtures/mlbb_real_screens.json', import.meta.url), 'utf8'));
const MLBB = ['Aran', 'Kevin', 'Drichel', 'Lyoni', 'Jull.'];
const DOTA = ['Whitemon', 'Fbz', 'Jhocam', 'jikroy', 'Mikoto'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const sureAll = (raw) => { const r = clone(raw); r.players.forEach((p, i) => { p.hero = REAL_TRUTH(raw, i); p.hero_sure = true; p.hero_candidates = []; }); return r; };
const REAL_TRUTH = (raw, i) => { const f = REAL.find((x) => x.raw === raw); const p = raw.players[i]; return f.truthHeroes[p.side][p.slot - 1]; };
const ctxFor = (base, extra = {}) => ({ reportId: 'RP-1', date: '2026-11-16', partner: 'ONIC', gameNo: 1, by: 'Coach Indra', base, captureIds: ['C1'], heroes: mlbbHeroes, ...extra });

test('scrim AI contract: strict schemas; prompts carry what real screens taught (left team, mirrored columns, INVALID, two Dota screens)', () => {
  for (const s of [scoreboardSchema('mlbb'), scoreboardSchema('dota'), draftSchema('mlbb'), draftSchema('dota'), digestSchema(), debriefSchema()]) {
    const walk = (o) => { if (o.type === 'object') { assert.equal(o.additionalProperties, false); assert.deepEqual(o.required, Object.keys(o.properties)); Object.values(o.properties).forEach(walk); } if (o.type === 'array') walk(o.items); };
    walk(s);
    const n = JSON.stringify(s).match(/"anyOf"/g)?.length || 0; assert.ok(n <= 16, 'within the structured-output limits');
  }
  assert.throws(() => scoreboardSchema('pubgm'), /No screenshot capture/);
  const pm = scoreboardPrompt('mlbb', mlbbHeroes.names);
  for (const re of [/Never estimate/, /always the team of the person who took the screenshot/, /mirrored: gold comes FIRST/, /"invalid" if the game was voided/, /hero_sure: true only if you are certain/, /Yi Sun-shin/]) assert.match(pm, re);
  const pd = scoreboardPrompt('dota', dotaHeroes.names);
  for (const re of [/OVERVIEW/, /SCOREBOARD tab/, /tooltip/, /radiant_victory/]) assert.match(pd, re);
  assert.match(draftPrompt('mlbb', mlbbHeroes.names), /"left" for the team shown on the left/);
  const req = messagesRequest({ system: 's', content: [imageBlock('AAAA', 'image/webp'), { type: 'text', text: 'x' }], schema: scoreboardSchema('mlbb') });
  assert.equal(req.output_config.format.type, 'json_schema'); assert.equal(req.messages[0].content[0].source.media_type, 'image/webp');
  assert.throws(() => imageBlock('A', 'image/heic'), /WebP, JPEG or PNG/);
  assert.deepEqual(parseModelJson({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":1}' }] }), { a: 1 });
  assert.throws(() => parseModelJson({ stop_reason: 'refusal', content: [] }), /declined/);
  assert.throws(() => parseModelJson({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"a"' }] }), /cut off/);
  assert.equal(capturePath('MLBB Women', '2026-11-16', 'abc', 'image/webp'), 'mlbb-women/2026-11-16/abc.webp');
  assert.equal(SLUG_TITLE['dota-2'], 'Dota 2');
});

test('hero and player names: aliases, small misreads, team tags; ambiguous stays blank', () => {
  assert.equal(mlbbHeroes.names.length, 133);
  assert.equal(mlbbHeroes.find('lapu lapu'), 'Lapu-Lapu'); assert.equal(mlbbHeroes.find('Popol & Kupa'), 'Popol and Kupa'); assert.equal(mlbbHeroes.find('YSS'), 'Yi Sun-shin');
  assert.equal(mlbbHeroes.find('Valentlna'), 'Valentina', 'one-letter misread'); assert.equal(mlbbHeroes.find('Zz'), ''); assert.equal(mlbbHeroes.find('Superman'), '');
  assert.equal(dotaHeroes.find("Nature's Prophet"), "Nature's Prophet"); assert.equal(dotaHeroes.find('Largo'), 'Largo');
  assert.equal(matchPlayer('TLID Aran', MLBB), 'Aran'); assert.equal(matchPlayer('aran', MLBB), 'Aran');
  assert.equal(matchPlayer('Jul', MLBB), '', 'too short to guess'); assert.equal(matchPlayer('Jull', MLBB), 'Jull.', 'punctuation ignored');
  assert.equal(matchPlayer('Kev1n', MLBB, { Kevin: ['Kev1n'] }), 'Kevin');
});

test('six REAL MLBB result screens: outcome from the left team, scores add up, only sure heroes filled (12 of 13 right), unsure left for the coach', () => {
  let sureRight = 0, sureTotal = 0, blank = 0, candidateHasTruth = 0;
  for (const f of REAL) {
    const g = proposeGame({ title: 'MLBB', raw: f.raw, roster: MLBB, heroes: mlbbHeroes });
    assert.equal(g.ourSide, 'left', f.id); assert.equal(g.mapSide, '', 'map side not on the result screen');
    assert.equal(g.result, f.raw.outcome === 'victory' ? 'win' : 'loss', f.id);
    assert.ok(!g.issues.some((i) => /kills add up/.test(i.text)), `${f.id}: printed K values add up to the printed score`);
    assert.ok(!g.issues.some((i) => i.level === 'block'), f.id);
    for (const p of g.players) {
      const truth = f.truthHeroes[p.side][p.slot - 1];
      assert.ok(p.stats.gold > 4000 && p.stats.kills < 30, `${f.id}: gold and kills not swapped on ${p.side} ${p.slot}`);
      if (p.hero) { sureTotal++; sureRight += p.hero === truth; } else { blank++; if (p.candidates.includes(truth)) candidateHasTruth++; assert.ok(p.flags.some((x) => x.field === 'hero')); }
    }
  }
  assert.equal(sureTotal, 13); assert.equal(sureRight, 12); assert.equal(blank, 47);
  assert.equal(candidateHasTruth, 8, 'my unsure best guesses were right 8 times: those show as the first suggestion');
});

test('real-screen failure modes: mirrored columns misread, voided game, no roster names, tooltip-like unreadable values', () => {
  // A model that reads the right team left-to-right puts gold into K: caught by range and score checks.
  const raw = clone(REAL[0].raw); const p = raw.players.find((x) => x.side === 'right' && x.slot === 1); p.kills = p.gold; p.gold = 4;
  const g = proposeGame({ title: 'MLBB', raw, roster: MLBB, heroes: mlbbHeroes });
  assert.ok(g.players.find((x) => x.side === 'right' && x.slot === 1).flags.some((f) => f.field === 'kills' && /unusual/.test(f.reason)));
  assert.ok(g.issues.some((i) => /Right team kills add up/.test(i.text)));
  // INVALID
  const inv = proposeGame({ title: 'MLBB', raw: { ...clone(REAL[1].raw), outcome: 'invalid' }, roster: MLBB, heroes: mlbbHeroes });
  assert.equal(inv.issues[0].level, 'block'); assert.match(inv.issues[0].text, /voided/);
  // Screenshot from a player whose name is not on our roster (e.g. MLBB Women roster still empty): left team assumed.
  const anon = proposeGame({ title: 'MLBB Women', raw: REAL[2].raw, roster: [], heroes: mlbbHeroes });
  assert.equal(anon.ourSide, 'left'); assert.ok(anon.issues.some((i) => /set to the left team/.test(i.text)));
  // Our five on the right (screenshot taken by the partner): found by name.
  const flip = clone(REAL[3].raw); flip.players.forEach((x) => { x.side = x.side === 'left' ? 'right' : 'left'; });
  const fg = proposeGame({ title: 'MLBB', raw: flip, roster: MLBB, heroes: mlbbHeroes });
  assert.equal(fg.ourSide, 'right'); assert.equal(fg.result, 'loss', 'VICTORY was the left (partner) team');
  // Unreadable K: flagged and the score check skipped (no false alarm).
  const unread = clone(REAL[4].raw); unread.players[0].kills = -1; unread.players[0].uncertain_fields = ['kills'];
  const ug = proposeGame({ title: 'MLBB', raw: unread, roster: MLBB, heroes: mlbbHeroes });
  assert.ok(ug.players[0].flags.some((f) => f.field === 'kills' && f.reason === 'not read')); assert.ok(!ug.issues.some((i) => /kills add up/.test(i.text)));
  // Garbage from the model never crashes the proposal.
  for (const bad of [null, 'x', {}, { players: 'x' }, { players: [null, 3, { side: 'up', kills: 'abc', hero_candidates: 'x' }] }, { screen_kind: 'result', players: [{ kills: true, deaths: '7', gold: 1e12 }] }]) {
    const r = proposeGame({ title: 'Dota 2', raw: bad, roster: DOTA, heroes: dotaHeroes }); assert.ok(Array.isArray(r.issues));
  }
});

// Dota: two screens of one game. Overview (names with clan tag, heroes printed, K/D/A, NW) and the
// Scoreboard tab (no tags, different order, LH/DN/GPM/XPM, damage).
const dp = (side, slot, name, hero, k, d, a, nw, extra = {}) => ({ side, slot, name_seen: name, hero, hero_sure: true, hero_candidates: [], kills: k, deaths: d, assists: a, gold: nw, hero_damage: -1, tower_damage: -1, damage_taken: -1, last_hits: -1, denies: -1, gpm: -1, xpm: -1, rating: -1, mvp: false, uncertain_fields: [], ...extra });
const OVERVIEW = { screen_kind: 'result', readable: true, outcome: 'radiant_victory', duration_seconds: 2052, score: { radiant: 34, dire: 9 }, team_names: { radiant: 'Indonesia', dire: 'Partner' }, notes: '',
  players: [dp('radiant', 1, 'INA.jikroy', 'Windranger', 15, 1, 12, 23589), dp('radiant', 2, 'INA.Mikoto', 'Death Prophet', 9, 0, 14, 18930), dp('radiant', 3, 'INA.Fbz', 'Kunkka', 1, 2, 19, 14206), dp('radiant', 4, 'INA.Jhocam', 'Rubick', 6, 3, 19, 11024), dp('radiant', 5, 'INA.Whitemon', 'Disruptor', 3, 3, 20, 9000),
    dp('dire', 1, 'a1', 'Axe', 2, 7, 3, 9000), dp('dire', 2, 'a2', 'Lion', 3, 6, 2, 7000), dp('dire', 3, 'a3', 'Enchantress', 0, 9, 2, 7649), dp('dire', 4, 'a4', 'Sniper', 2, 7, 1, 9500), dp('dire', 5, 'a5', 'Mars', 2, 5, 3, 9900)] };
const SCOREBOARD = { ...clone(OVERVIEW), screen_kind: 'stats_detail', team_names: { radiant: '', dire: '' },
  players: OVERVIEW.players.map((p) => ({ ...clone(p), name_seen: p.name_seen.replace('INA.', ''), kills: -1, deaths: -1, assists: -1, gold: -1, last_hits: 100 + p.slot, denies: 4, gpm: 500 + p.slot, xpm: 600, hero_damage: 20000 + p.slot })) };
SCOREBOARD.players.reverse(); SCOREBOARD.players.forEach((p, i) => { p.slot = (i % 5) + 1; });   // listed in another order

test('Dota: two screenshots of one game merge by name (tags differ, order differs); disagreements flagged; Overview-only shows a reminder', () => {
  const a = proposeGame({ title: 'Dota 2', raw: OVERVIEW, roster: DOTA, heroes: dotaHeroes });
  assert.equal(a.ourSide, 'radiant'); assert.equal(a.mapSide, 'radiant'); assert.equal(a.result, 'win'); assert.equal(a.teamNames.radiant, 'Indonesia');
  const b = proposeGame({ title: 'Dota 2', raw: SCOREBOARD, roster: DOTA, heroes: dotaHeroes });
  assert.match(b.issues.map((i) => i.text).join(' '), /Add the Overview screenshot/);
  const { game, issues } = mergeGames(a, b);
  assert.deepEqual(issues, []);
  const jik = game.players.find((p) => p.player === 'jikroy');
  assert.deepEqual([jik.stats.kills, jik.stats.gold, jik.stats.last_hits, jik.stats.gpm], [15, 23589, 101, 501], 'matched by name, not by position');
  assert.ok(!game.players.some((p) => p.flags.some((f) => /by position/.test(f.reason))));
  // A value both screens show but read differently.
  const b2 = clone(b); b2.players.find((p) => p.nameSeen === 'Fbz').stats.kills = 7;
  const m2 = mergeGames(a, b2).game; assert.ok(m2.players.find((p) => p.player === 'Fbz').flags.some((f) => /disagree \(1 vs 7\)/.test(f.reason)));
  // A different game as "second screenshot".
  const other = clone(SCOREBOARD); other.duration_seconds = 1500; other.players.forEach((p, i) => { p.name_seen = `x${i}`; p.hero = 'Pudge'; p.hero_sure = false; });
  const m3 = mergeGames(a, proposeGame({ title: 'Dota 2', raw: other, roster: DOTA, heroes: dotaHeroes }));
  assert.match(m3.issues.map((i) => i.text).join(' '), /different durations/);
  // Confirm the merged game.
  const g = confirmGame(game, { ...ctxFor(a), heroes: dotaHeroes, partner: 'Partner' });
  assert.equal(g.mapSide, 'radiant'); assert.equal(g.players.find((p) => p.player === 'Whitemon').stats.hero_damage, 20005);
});

test('hero help: AI candidates, what coaches corrected the same reading to, the player\'s usual heroes; a draft fills blanks', () => {
  const g = proposeGame({ title: 'MLBB', raw: REAL[0].raw, roster: MLBB, heroes: mlbbHeroes });
  const row = g.players.find((p) => p.side === 'left' && p.slot === 5);           // read as Gusion, really Xavier
  assert.equal(row.hero, ''); assert.deepEqual(row.candidates, ['Gusion']);
  const earlier = [{ players: [{ team: 'ours', player: 'Jull.', hero: 'Xavier', aiHero: 'Gusion' }] }, { players: [{ team: 'ours', player: 'Jull.', hero: 'Xavier', aiHero: 'Gusion' }, { team: 'ours', player: 'Jull.', hero: 'Chip', aiHero: '' }] }];
  assert.deepEqual(heroMemory(earlier), { Gusion: { Xavier: 2 } });
  assert.deepEqual(heroChoices(row, { memory: heroMemory(earlier), playerHeroes: playerHeroes(earlier) }).slice(0, 3), ['Xavier', 'Gusion', 'Chip']);
  // A draft screenshot with the picks: heroes matched to rows by player name.
  const draft = proposeDraft({ title: 'MLBB', heroes: mlbbHeroes, raw: { screen_kind: 'draft', readable: true, first_pick_side: 'left', notes: '', actions: [
    { order: 1, side: 'right', action: 'ban', hero: 'Fanny', hero_sure: true, hero_candidates: [], player_name: '', order_sure: true },
    { order: 2, side: 'left', action: 'pick', hero: 'Xavier', hero_sure: true, hero_candidates: [], player_name: 'TLID Jull.', order_sure: true },
    { order: 3, side: 'left', action: 'pick', hero: 'Brody', hero_sure: false, hero_candidates: ['Brody'], player_name: 'TLID Aran', order_sure: false }] } });
  assert.equal(draft.actions[2].hero, '', 'unsure draft hero not filled'); assert.ok(draft.actions[2].flags.some((f) => f.field === 'order'));
  const filled = heroesFromDraft(g, draft, mlbbHeroes);
  assert.equal(filled.players.find((p) => p.side === 'left' && p.slot === 5).hero, 'Xavier');
});

test('confirmed game: required fields, map side, draft must match the heroes, corrections recorded, fixes supersede', () => {
  const base = proposeGame({ title: 'MLBB', raw: sureAll(REAL[1].raw), roster: MLBB, heroes: mlbbHeroes });
  const edited = clone(base); edited.mapSide = 'red'; edited.players[1].stats.kills = 4;
  const g = confirmGame(edited, ctxFor(base));
  assert.equal(g.source, 'screenshot'); assert.equal(g.mapSide, 'red'); assert.equal(g.result, 'win');
  assert.deepEqual(g.corrections, [{ field: 'row2.kills', from: 3, to: 4 }]); assert.equal(g.score.left, 36);
  assert.equal(g.players.find((p) => p.team === 'partner').player, '', 'partner players are not linked to our roster');
  const bad = clone(base); bad.players[0].hero = '';
  assert.throws(() => confirmGame(bad, ctxFor(base)), /Pick the hero/);
  const typo = clone(base); typo.players[7].hero = 'Batman';
  assert.throws(() => confirmGame(typo, ctxFor(base)), /"Batman" is not a hero name/);
  const dup = clone(base); dup.players[1].player = dup.players[0].player;
  assert.throws(() => confirmGame(dup, ctxFor(base)), /same roster player/);
  const noRes = clone(base); noRes.result = '';
  assert.throws(() => confirmGame(noRes, ctxFor(base)), /Pick the result/);
  const draft = { firstPick: 'left', actions: [{ order: 1, side: 'left', action: 'pick', hero: 'Fanny' }] };
  assert.throws(() => confirmGame(edited, ctxFor(base, { draft })), /the draft says Left team picked Fanny/i);
  // Unsure hero the coach picked: counted as a correction only when the AI's best guess differed.
  const unsure = proposeGame({ title: 'MLBB', raw: REAL[1].raw, roster: MLBB, heroes: mlbbHeroes });
  const e2 = clone(unsure); e2.players.forEach((p, i) => { p.hero = REAL[1].truthHeroes[p.side][p.slot - 1]; });
  const g2 = confirmGame(e2, ctxFor(unsure));
  const heroFixes = g2.corrections.filter((c) => /hero/.test(c.field)).length;
  assert.equal(heroFixes, 7, 'Wanwan, Hayabusa and Clint were right; 7 of 10 hero guesses wrong');
  assert.equal(extractionAccuracy([g2]).heroRate, 70);
  // Typed by hand, then a fix that supersedes it.
  const blank = blankGame('Dota 2', DOTA, 'dire'); assert.equal(blank.players[0].player, 'Whitemon'); assert.equal(blank.mapSide, 'dire');
  const fixed = { ...g, id: 'G2', supersedes: g.id, result: 'loss', createdAt: '2099-01-01T00:00:00Z' };
  assert.deepEqual(latestGames([fixed, g]).map((x) => x.id), ['G2'], 'order of arrival does not matter');
  assert.deepEqual(gamesResult(latestGames([g, fixed])), { won: 0, lost: 1 });
  assert.equal(gameToProposal(g).players[0].hero, g.players[0].hero);
  assert.equal(parseDuration('18:42'), 1122); assert.equal(parseDuration('35'), 2100); assert.equal(parseDuration('18.42'), 1122);
  assert.throws(() => parseDuration('18m'), /minutes:seconds/); assert.throws(() => parseDuration('18:75'), /0 to 59/);
  assert.deepEqual(learnAliases({}, g).Aran, ['TLID Aran']);
});

test('duplicates: the same result added twice is spotted (same kill score and duration)', () => {
  const p1 = proposeGame({ title: 'MLBB', raw: REAL[2].raw, roster: MLBB, heroes: mlbbHeroes });
  const saved = confirmGame(proposeGame({ title: 'MLBB', raw: sureAll(REAL[2].raw), roster: MLBB, heroes: mlbbHeroes }), ctxFor(p1));
  assert.match(findDuplicate(p1, [saved]), /vs ONIC, 2026-11-16, game 1/);
  assert.equal(findDuplicate(proposeGame({ title: 'MLBB', raw: REAL[3].raw, roster: MLBB, heroes: mlbbHeroes }), [saved]), '');
});

test('debrief split: coach words only, sensitive parts kept out, invented wording flagged', () => {
  assert.throws(() => checkDebriefInput(''), /Type or dictate/); assert.throws(() => checkDebriefInput('call me 0812 3456 7890'), /phone or ID/);
  const src = 'Fokus hari ini rotasi early game ke turtle. Draft bagus, Kevin rotasi cepat. Teamfight lord masih telat. Next: latihan set up vision sebelum lord. Aran kurang tidur katanya.';
  const out = checkDebriefSplit(src, { focus: 'rotasi early game ke turtle', worked: 'Draft bagus, Kevin rotasi cepat', failed: 'Teamfight lord masih telat', adjust: 'latihan set up vision sebelum lord', player_notes: 'Aran: kurang tidur', detail: '', not_placed: '' }, MLBB);
  assert.equal(out.fields.focus, 'rotasi early game ke turtle'); assert.equal(out.fields.players, undefined, 'sleep note kept out of the report');
  assert.match(out.flags[0].text, /performance only/);
  const invented = checkDebriefSplit('Draft bagus.', { focus: '', worked: 'Excellent macro discipline throughout objectives', failed: '', adjust: '', player_notes: '', detail: '', not_placed: '' });
  assert.match(invented.flags[0].text, /words you did not say/);
});

// A small season of confirmed games built from the real screens.
function season() {
  const gs = [];
  for (let i = 0; i < 12; i++) {
    const f = REAL[i % REAL.length]; const base = proposeGame({ title: 'MLBB', raw: sureAll(f.raw), roster: MLBB, heroes: mlbbHeroes });
    const e = clone(base); const long = i % 3 === 0;
    e.durationS = long ? 1500 : 840; e.result = long ? 'loss' : 'win'; e.players[0].stats.deaths = long ? 5 : 1; e.mapSide = i % 2 ? 'blue' : '';
    const g = confirmGame(e, { reportId: `RP-${i}`, date: `2026-11-${String(10 + Math.floor(i / 2)).padStart(2, '0')}`, partner: i < 6 ? 'ONIC' : 'RRQ', gameNo: (i % 2) + 1, heroes: mlbbHeroes, base });
    g.draft = [{ order: 1, side: 'right', team: 'partner', action: 'ban', hero: i % 2 ? 'Fanny' : 'Ling' }]; g.firstPick = i % 2 ? 'left' : 'right'; g.createdAt = `2026-11-${10 + i}T10:00:00Z`;
    gs.push(g);
  }
  return gs;
}

test('facts: map side only where set, length, heroes, bans, partner level, stand-ins, per player; low samples marked', () => {
  const gs = season();
  const reports = gs.map((g, i) => ({ id: g.reportId, title: 'MLBB', date: g.date, partner: g.partner, partnerLevel: i < 6 ? 'Tier 1 domestic' : 'Tier 2', scrimId: i < 6 ? 'SC-1' : '', worked: 'early game', failed: 'late lord fights', adjust: 'vision' }));
  const scrims = [{ id: 'SC-1', title: 'MLBB', mirrors: 'Myanmar' }];
  const F = facts(gs, { reports, scrims, partners: [{ title: 'MLBB', name: 'RRQ', resembles: 'Malaysia' }] });
  const f = (id) => F.find((x) => x.id === id);
  assert.deepEqual([f('all').n, f('all').won, f('all').winRate], [12, 8, 67]);
  assert.equal(f('side:blue').n, 6, 'only the six games with a map side'); assert.equal(f('side:left'), undefined, 'screen position is not a map side');
  assert.deepEqual([f('length:over 20 min').n, f('length:over 20 min').won, f('length:over 20 min').lowSample], [4, 0, true]);
  assert.equal(f('length:under 15 min').won, 8); assert.equal(f('banned:Fanny').count, 6); assert.equal(f('banned:Fanny').share, 50);
  assert.equal(f('standin:Myanmar').n, 6); assert.equal(f('standin:Malaysia').n, 6); assert.equal(f('level:Tier 2').n, 6);
  assert.deepEqual([f('player:Aran').deathsInWins, f('player:Aran').deathsInLosses], [1, 5]);
  const pay = digestPayload(F, reports); assert.ok(!('games' in pay.facts[0]), 'game ids are not sent'); assert.ok(pay.excerpts.length <= 60);
  const rec = standInRecord(gs, 'Myanmar', { reports, scrims }); assert.deepEqual([rec.n, rec.won], [6, 4]); assert.ok(rec.bansAgainst.length);
});

test('findings: kept only when they cite real facts and use their numbers; low-sample problems refused; coach marks them', () => {
  const gs = season(); const F = facts(gs, {});
  const raw = { findings: [
    { fact_ids: ['player:Aran', 'all'], kind: 'problem', claim: 'Aran averages 5 deaths in losses vs 1 in wins across 12 games.', why_it_matters: 'Practise safer jungle entries.' },
    { fact_ids: ['length:over 20 min'], kind: 'problem', claim: 'Lost all 4 games over 20 min.', why_it_matters: 'Late game.' },
    { fact_ids: ['all'], kind: 'strength', claim: 'Won 75% of games.', why_it_matters: 'x' },
    { fact_ids: ['made-up'], kind: 'tendency', claim: 'Something.', why_it_matters: 'x' },
    { fact_ids: ['banned:Fanny'], kind: 'opponent', claim: 'Partners ban Fanny in 6 of 12 drafts (50%).', why_it_matters: 'Prepare a second jungler.' },
  ] };
  const { kept, dropped } = checkFindings(raw, F);
  assert.deepEqual(kept.map((k) => k.kind), ['problem', 'opponent']);
  const why = dropped.map((d) => d.why).join(' | ');
  assert.match(why, /low-sample/); assert.match(why, /numbers not in the cited facts \(75\)/); assert.match(why, /cites no fact/);
  const rec = findingRecord({ title: 'MLBB', period: 'last 14 days', f: kept[0], factList: F, model: 'm', by: 'Aufa' });
  assert.equal(rec.status, 'new'); assert.equal(rec.facts.length, 2); assert.ok(!('games' in rec.facts[0]));
  assert.equal(markFinding(rec, { status: 'useful', by: 'Aufa' }).status, 'useful'); assert.throws(() => markFinding(rec, { status: 'new', by: 'x' }), /Choose/);
});

test('stat trail and stat-bound goals: recent games against the player\'s own baseline', () => {
  const gs = season();
  const tr = statTrail(gs, 'Aran', { window: 4 });
  assert.equal(tr.games, 12); assert.equal(tr.recentN, 4); assert.equal(tr.baselineN, 8);
  const deaths = tr.stats.find((s) => s.key === 'deaths'); assert.ok(deaths.recent != null && deaths.baseline != null);
  assert.equal(statTrail(gs, 'Nobody'), null);
  const sg = statGoal({ key: 'deaths', op: '<=', target: '3' }, 'mlbb');
  const prog = statGoalProgress({ stat: sg }, tr); assert.match(prog.text, /D: .* per game over the last 4 scrim games \(target <= 3\)/); assert.equal(prog.lowSample, true);
  assert.throws(() => statGoal({ key: 'damage_taken', op: '<=', target: 1 }, 'mlbb'), /Pick a stat/);
});
