// V1.13 — AI screenshot capture, debrief split, pattern digest and stat trail (core logic, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroIndex, matchPlayer, proposeGame, proposeDraft, confirmGame, blankGame, gamesResult, latestGames, extractionAccuracy, learnAliases, parseDuration } from '../src/core/capture.js';
import { checkDebriefInput, checkDebriefSplit } from '../src/core/debrief.js';
import { facts, checkFindings, findingRecord, markFinding, statTrail, statGoal, statGoalProgress, standInRecord, digestPayload } from '../src/core/patterns.js';
import { scoreboardSchema, draftSchema, digestSchema, debriefSchema, scoreboardPrompt, messagesRequest, imageBlock, parseModelJson, capturePath, SLUG_TITLE } from '../supabase/functions/_shared/scrim_spec.js';

const mlbbHeroes = heroIndex(JSON.parse(readFileSync(new URL('../data/mlbb/heroes.json', import.meta.url))).heroes);
const dotaHeroes = heroIndex(readFileSync(new URL('../data/dota/heroes.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => ({ name: l.split(',')[1] })));
const MLBB = ['Aran', 'Kevin', 'Drichel', 'Lyoni', 'Jull.'];
const DOTA = ['Whitemon', 'Fbz', 'Jhocam', 'jikroy', 'Mikoto'];

const p = (side, slot, name, hero, k, d, a, extra = {}) => ({ side, slot, name_seen: name, hero, kills: k, deaths: d, assists: a, gold: 9000, hero_damage: 60000, tower_damage: 3000, damage_taken: 40000, last_hits: -1, denies: -1, gpm: -1, xpm: -1, rating: 8.1, mvp: false, uncertain_fields: [], ...extra });
const mlbbRaw = () => ({
  screen_kind: 'scoreboard', readable: true, winner_side: 'blue', duration_seconds: 1122, score: { blue: 18, red: 9 }, notes: '',
  players: [p('blue', 1, 'TLID Aran', 'Fredrinn', 3, 1, 9), p('blue', 2, 'TLID Kevin', 'Valentina', 6, 2, 8), p('blue', 3, 'TLID Drichel', 'Granger', 7, 1, 5), p('blue', 4, 'TLID Lyoni', 'Lapu Lapu', 2, 3, 6), p('blue', 5, 'TLID Jull.', 'Chip', 0, 2, 12),
    p('red', 1, 'ONIC Kiboy', 'Hilda', 2, 4, 3), p('red', 2, 'ONIC Sanz', 'Pharsa', 3, 4, 2), p('red', 3, 'ONIC CW', 'Beatrix', 2, 3, 3), p('red', 4, 'ONIC Lutpi', 'Lukas', 1, 4, 2), p('red', 5, 'ONIC Kairi', 'Joy', 1, 3, 4)],
});

test('scrim AI contract: schemas compile to strict objects, prompts list heroes, requests and answers are checked', () => {
  for (const s of [scoreboardSchema('mlbb'), scoreboardSchema('dota'), draftSchema('dota'), digestSchema(), debriefSchema()]) {
    const walk = (o) => { if (o.type === 'object') { assert.equal(o.additionalProperties, false); assert.deepEqual(o.required, Object.keys(o.properties)); Object.values(o.properties).forEach(walk); } if (o.type === 'array') walk(o.items); };
    walk(s);
  }
  assert.throws(() => scoreboardSchema('pubgm'), /No screenshot capture/);
  assert.match(scoreboardPrompt('mlbb', mlbbHeroes.names), /Never estimate/); assert.match(scoreboardPrompt('mlbb', mlbbHeroes.names), /Yi Sun-shin/);
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
  assert.equal(matchPlayer('TLID Aran', MLBB), 'Aran'); assert.equal(matchPlayer('aran', MLBB), 'Aran'); assert.equal(matchPlayer('Jul', MLBB), '', 'too short to guess'); assert.equal(matchPlayer('Jull', MLBB), 'Jull.', 'punctuation ignored');
  assert.equal(matchPlayer('Jull.', MLBB), 'Jull.'); assert.equal(matchPlayer('Kev1n', MLBB, { Kevin: ['Kev1n'] }), 'Kevin');
});

test('scoreboard proposal: our side from roster names, result, checks on kills, duplicates and unread cells', () => {
  const g = proposeGame({ title: 'MLBB', raw: mlbbRaw(), roster: MLBB, heroes: mlbbHeroes });
  assert.equal(g.ourSide, 'blue'); assert.equal(g.result, 'win'); assert.equal(g.durationS, 1122);
  assert.equal(g.players.filter((x) => x.player).length, 5); assert.equal(g.players[3].hero, 'Lapu-Lapu');
  assert.deepEqual(g.issues, [], 'clean screenshot: nothing to check');
  // A misread K value breaks the score sum; an unknown hero and an unread death are flagged.
  const raw = mlbbRaw(); raw.players[0].kills = 8; raw.players[6].hero = 'Batman'; raw.players[2].deaths = -1; raw.players[1].uncertain_fields = ['hero'];
  const h = proposeGame({ title: 'MLBB', raw, roster: MLBB, heroes: mlbbHeroes });
  assert.match(h.issues.map((i) => i.text).join(' '), /Blue kills add up to 23, but the score shows 18/);
  assert.deepEqual(h.players[6].flags.map((f) => f.field), ['hero']); assert.equal(h.players[2].stats.deaths, null);
  assert.ok(h.players[2].flags.some((f) => f.field === 'deaths')); assert.ok(h.players[1].flags.some((f) => f.reason === 'AI unsure'));
  // Not a scoreboard: blocked with a plain instruction.
  const d = proposeGame({ title: 'Dota 2', raw: { screen_kind: 'draft_or_loading', readable: true, players: [], score: {} }, roster: DOTA, heroes: dotaHeroes });
  assert.equal(d.issues[0].level, 'block'); assert.match(d.issues[0].text, /draft screenshot/);
  // Names that don't match the roster: the coach picks our side.
  const raw2 = mlbbRaw(); raw2.players.forEach((x, i) => { x.name_seen = `Guest${i}`; });
  assert.equal(proposeGame({ title: 'MLBB', raw: raw2, roster: MLBB, heroes: mlbbHeroes }).ourSide, '');
});

test('confirmed game: required fields, roster matching, corrections recorded, W-L from games, superseding versions', () => {
  const base = proposeGame({ title: 'MLBB', raw: mlbbRaw(), roster: MLBB, heroes: mlbbHeroes });
  const edited = JSON.parse(JSON.stringify(base)); edited.players[1].stats.kills = 7; edited.players[6].stats.kills = 2;
  const ctx = { reportId: 'RP-1', date: '2026-11-16', partner: 'ONIC', gameNo: 1, by: 'Coach Indra', base, captureIds: ['C1'], heroes: mlbbHeroes };
  const g = confirmGame(edited, ctx);
  assert.equal(g.source, 'screenshot'); assert.equal(g.players.filter((x) => x.team === 'ours').length, 5);
  assert.deepEqual(g.corrections, [{ field: 'row2.kills', from: 6, to: 7 }, { field: 'row7.kills', from: 3, to: 2 }]); assert.equal(g.score.blue, 19);
  assert.equal(g.players.find((x) => x.team === 'partner').player, '', 'partner players are not linked to our roster');
  const bad = JSON.parse(JSON.stringify(base)); bad.players[0].hero = '';
  assert.throws(() => confirmGame(bad, ctx), /Pick the hero/);
  const dup = JSON.parse(JSON.stringify(base)); dup.players[1].player = 'Aran';
  assert.throws(() => confirmGame(dup, ctx), /same roster player/);
  const noRes = JSON.parse(JSON.stringify(base)); noRes.result = '';
  assert.throws(() => confirmGame(noRes, ctx), /Pick the result/);
  // Typed by hand: roster pre-filled on our side, nothing recorded as AI corrections.
  const blank = blankGame('Dota 2', DOTA, 'dire'); assert.equal(blank.players[0].player, 'Whitemon'); assert.equal(blank.players[0].side, 'dire');
  const g2 = { ...g, id: 'G2', result: 'loss', createdAt: '2026-11-16T12:00:00Z' }; const g3 = { ...g, id: 'G3', supersedes: 'G2', result: 'win', createdAt: '2026-11-16T13:00:00Z' };
  const latest = latestGames([g, g2, g3]); assert.deepEqual(latest.map((x) => x.id).sort(), [g.id, 'G3'].sort());
  assert.deepEqual(gamesResult(latest), { won: 2, lost: 0 });
  const acc = extractionAccuracy([g]); assert.equal(acc.changed, 2); assert.ok(acc.rate > 0 && acc.rate < 3);
  assert.deepEqual(learnAliases({}, g), { Aran: ['TLID Aran'], Kevin: ['TLID Kevin'], Drichel: ['TLID Drichel'], Lyoni: ['TLID Lyoni'], 'Jull.': ['TLID Jull.'] });
  assert.equal(parseDuration('18:42'), 1122); assert.equal(parseDuration('35'), 2100); assert.throws(() => parseDuration('18m'), /minutes:seconds/);
});

test('draft screenshot: heroes matched, duplicates and missing picks flagged, draft saved with the game', () => {
  const raw = { screen_kind: 'draft', readable: true, first_pick_side: 'blue', notes: '', actions: [
    ...['Fanny', 'Ling', 'Hayabusa'].map((h, i) => ({ order: i + 1, side: 'red', action: 'ban', hero: h, player_name: '', uncertain: false })),
    ...['Fredrinn', 'Valentina', 'Granger', 'Lapu-Lapu', 'Chip'].map((h, i) => ({ order: 10 + i, side: 'blue', action: 'pick', hero: h, player_name: MLBB[i], uncertain: false })),
    ...['Hilda', 'Pharsa', 'Beatrix', 'Lukas', 'Joy'].map((h, i) => ({ order: 20 + i, side: 'red', action: 'pick', hero: h, player_name: '', uncertain: false })) ] };
  const d = proposeDraft({ title: 'MLBB', raw, heroes: mlbbHeroes });
  assert.deepEqual(d.issues, []); assert.equal(d.firstPick, 'blue');
  const short = proposeDraft({ title: 'MLBB', raw: { ...raw, actions: raw.actions.slice(0, 7) }, heroes: mlbbHeroes });
  assert.match(short.issues.map((x) => x.text).join(' '), /Blue shows 4 picks, not 5/);
  const base = proposeGame({ title: 'MLBB', raw: mlbbRaw(), roster: MLBB, heroes: mlbbHeroes });
  const g = confirmGame(base, { date: '2026-11-16', partner: 'ONIC', gameNo: 1, heroes: mlbbHeroes, base, draft: d });
  assert.equal(g.draft.filter((a) => a.action === 'ban' && a.team === 'partner').length, 3); assert.equal(g.firstPick, 'blue');
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

// A small season of confirmed games to compute facts on.
function season() {
  const base = proposeGame({ title: 'MLBB', raw: mlbbRaw(), roster: MLBB, heroes: mlbbHeroes });
  const gs = [];
  for (let i = 0; i < 12; i++) {
    const e = JSON.parse(JSON.stringify(base)); const long = i % 3 === 0;
    e.durationS = long ? 1500 : 840; e.result = long ? 'loss' : 'win'; e.players[0].stats.deaths = long ? 5 : 1;
    const g = confirmGame(e, { reportId: `RP-${i}`, date: `2026-11-${String(10 + Math.floor(i / 2)).padStart(2, '0')}`, partner: i < 6 ? 'ONIC' : 'RRQ', gameNo: (i % 2) + 1, heroes: mlbbHeroes, base });
    g.draft = [{ order: 1, side: 'red', team: 'partner', action: 'ban', hero: i % 2 ? 'Fanny' : 'Ling' }]; g.firstPick = i % 2 ? 'blue' : 'red'; g.createdAt = `2026-11-${10 + i}T10:00:00Z`;
    gs.push(g);
  }
  return gs;
}

test('facts: side, length, heroes, bans, partner level, stand-ins, per player; low samples marked', () => {
  const gs = season();
  const reports = gs.map((g, i) => ({ id: g.reportId, title: 'MLBB', date: g.date, partner: g.partner, partnerLevel: i < 6 ? 'Tier 1 domestic' : 'Tier 2', scrimId: i < 6 ? 'SC-1' : '', worked: 'early game', failed: 'late lord fights', adjust: 'vision' }));
  const scrims = [{ id: 'SC-1', title: 'MLBB', mirrors: 'Myanmar' }];
  const F = facts(gs, { reports, scrims, partners: [{ title: 'MLBB', name: 'RRQ', resembles: 'Malaysia' }] });
  const f = (id) => F.find((x) => x.id === id);
  assert.deepEqual([f('all').n, f('all').won, f('all').winRate], [12, 8, 67]);
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
  assert.match(dropped.map((d) => d.why).join(' | '), /low-sample/); assert.match(dropped.map((d) => d.why).join(' | '), /numbers not in the cited facts \(75\)/); assert.match(dropped.map((d) => d.why).join(' | '), /cites no fact/);
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
