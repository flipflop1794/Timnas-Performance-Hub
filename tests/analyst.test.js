import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { gameBreakdown, breakdownText, ownVod, addMark, vodThemes, clipUrl, partnerPlan, daySummary, dayText, BASE_MIN } from '../src/core/analyst.js';
import { reportsCsv } from '../src/core/reports.js';

// A confirmed MLBB game with five of our players; `deaths` and `gold` vary per call.
const P = ['Aran', 'Drichel', 'Jull.', 'Kevin', 'Lyoni'];
let seq = 0;
const game = (date, { deaths = 3, gold = 10000, result = 'win', reportId = '' } = {}) => ({
  id: `GM-${++seq}`, title: 'MLBB', game: 'mlbb', reportId, date, partner: 'Team X', gameNo: 1, result, durationS: 900, mapSide: 'blue', ourSide: 'left', createdAt: `${date}T10:00:0${seq % 10}Z`,
  draft: [{ order: 1, side: 'left', team: 'ours', action: 'ban', hero: 'Fanny' }, { order: 2, side: 'left', team: 'ours', action: 'pick', hero: 'Ling' }, { order: 3, side: 'right', team: 'partner', action: 'pick', hero: 'Tigreal' }],
  players: P.map((p, i) => ({ team: 'ours', side: 'left', player: p, hero: ['Ling', 'Lunox', 'Beatrix', 'Khufra', 'Esmeralda'][i], stats: { kills: 3, deaths: p === 'Aran' ? deaths : 3, assists: 5, gold: p === 'Aran' ? gold : 10000, rating: 8, hero_damage: 50000 } })),
});

test('game breakdown: each player against their own median; stand-outs need enough history and a 30% gap', () => {
  const hist = ['2026-11-01', '2026-11-02', '2026-11-03'].map((d) => game(d));
  const g = game('2026-11-05', { deaths: 7, gold: 14000, reportId: 'RP-1' });
  const b = gameBreakdown(g, [...hist, g]);
  const aran = b.players.find((p) => p.player === 'Aran');
  assert.equal(aran.baseN, BASE_MIN);
  const d = aran.flags.find((f) => f.key === 'deaths'); assert.equal(d.pct, 133); assert.equal(d.better, false);
  const gd = aran.flags.find((f) => f.key === 'gold'); assert.equal(gd.pct, 40); assert.equal(gd.better, true);
  assert.equal(b.players.find((p) => p.player === 'Kevin').flags.length, 0);
  assert.deepEqual(b.draft.ourPicks, ['Ling']); assert.deepEqual(b.draft.ourBans, ['Fanny']); assert.deepEqual(b.draft.theirPicks, ['Tigreal']);
  const txt = breakdownText(b); assert.match(txt, /Aran \(Ling\): D 7 vs usual 3 \(\+133%\), worse/); assert.match(txt, /Analyst notes:/);
  assert.match(breakdownText(b, 'id'), /lebih buruk/);
  // Too little history: nothing flagged, said plainly.
  const early = gameBreakdown(g, [hist[0], g]); assert.equal(early.flagged, 0); assert.match(breakdownText(early), /not enough history/);
});

test('own VOD review: validation, marks, clip links, recurring themes need 3 marks in 2+ games', () => {
  assert.throws(() => ownVod({ title: 'MLBB', url: 'youtube', event: 'x', date: '2026-11-10', by: 'A' }), /video link/);
  assert.throws(() => ownVod({ title: 'MLBB', url: 'https://youtu.be/a', event: '', date: '2026-11-10', by: 'A' }), /which game/);
  let v1 = ownVod({ title: 'MLBB', url: 'https://www.youtube.com/watch?v=abc', event: 'Scrim vs X g1', date: '2026-11-10', by: 'Analyst' });
  assert.equal(v1.kind, 'own'); assert.equal(v1.nation, '');
  assert.throws(() => addMark(v1, { t: '12.30', player: 'Aran', tag: 'vision', note: 'x', by: 'A' }), /12:30/);
  assert.throws(() => addMark(v1, { t: '12:30', player: 'Aran', tag: 'dance', note: 'x', by: 'A' }), /label/);
  assert.throws(() => addMark(v1, { t: '12:30', player: 'Aran', tag: 'vision', note: 'call 081234567890', by: 'A' }), /phone/);
  v1 = addMark(v1, { t: '12:30', player: 'Aran', tag: 'vision', note: 'no ward before lord', by: 'A' });
  v1 = addMark(v1, { t: '1:02:05', player: 'Aran', tag: 'vision', note: 'face-checked bush', by: 'A' });
  assert.equal(clipUrl(v1.url, '12:30'), 'https://www.youtube.com/watch?v=abc&t=750');
  let themes = vodThemes([v1], 'MLBB', '2026-11-14');
  assert.equal(themes[0].n, 2); assert.equal(themes[0].recurring, false);
  let v2 = ownVod({ title: 'MLBB', url: 'https://youtu.be/def', event: 'Scrim vs Y g2', date: '2026-11-12', by: 'Analyst' });
  v2 = addMark(v2, { t: '5:00', player: 'Aran', tag: 'vision', note: 'again no vision', by: 'A' });
  themes = vodThemes([v1, v2], 'MLBB', '2026-11-14');
  assert.equal(themes[0].recurring, true); assert.equal(themes[0].games, 2); assert.equal(themes[0].clips[0].date, '2026-11-12');
  assert.equal(vodThemes([v1, v2], 'MLBB', '2026-12-30').length, 0, 'older than 28 days drops out');
  assert.equal(vodThemes([{ ...v1, kind: undefined }], 'MLBB', '2026-11-14').length, 0, 'rival VODs are not ours');
});

test('partner plan: record per partner, weakness re-test, stand-ins for rated rivals, Tier 1 share, cold contacts', () => {
  const rep = (id, date, partner, won, lost, level = 'Tier 2') => ({ id, title: 'MLBB', date, partner, partnerLevel: level, result: { mode: 'wl', won, lost, drawn: 0 }, progress: 3, createdAt: `${date}T10:00Z` });
  const reports = [rep('R1', '2026-11-10', 'Team A', 1, 2), rep('R2', '2026-11-11', 'Team A', 0, 2), rep('R3', '2026-11-12', 'Team A', 2, 1), rep('R4', '2026-11-13', 'Team B', 2, 0), rep('R5', '2026-11-13', 'Unknown FC', 1, 1)];
  const wtags = ['R1', 'R2', 'R3'].map((r, i) => ({ title: 'MLBB', reportId: r, date: `2026-11-1${i}`, tags: ['vision'] }));
  const partners = [{ title: 'MLBB', name: 'Team A', level: 'Tier 2', resembles: '' }, { title: 'MLBB', name: 'Team B', level: 'Tier 2', resembles: 'Myanmar' },
    { title: 'MLBB', name: 'Elite', level: 'Tier 1 international', resembles: '' }];
  const tiers = { 'MLBB|Myanmar': { tier: 'main threat' }, 'MLBB|Malaysia': { tier: 'contender' } };
  const p = partnerPlan('MLBB', { partners, reports, wtags, tiers, scrims: [], asOf: '2026-11-14' });
  const a = p.rows.find((r) => r.name === 'Team A'); assert.equal(a.sessions, 3); assert.equal(`${a.won}-${a.lost}`, '3-5'); assert.equal(a.labels.vision, 3);
  assert.deepEqual(p.unbanked, ['Unknown FC']);
  const kinds = p.suggestions.map((s) => s.kind);
  assert.ok(kinds.includes('weakness')); assert.match(p.suggestions.find((s) => s.kind === 'weakness').text, /Re-test "vision" against Team A: it showed up in 3 of 3/);
  assert.match(p.suggestions.find((s) => s.kind === 'standin').text, /Book Team B as a stand-in for Myanmar/);
  assert.match(p.suggestions.find((s) => s.kind === 'standin-missing').text, /No partner in the bank plays like Malaysia/);
  assert.match(p.suggestions.find((s) => s.kind === 'level').text, /Only 0 of 5 sessions .* book Elite/);
  assert.ok(p.suggestions.length <= 5);
});

test('end of day: today only, unlogged sessions, unfixed adjustments, recurring labels, carry-over; message in both languages', () => {
  const day = '2026-11-14';
  const reports = [
    { id: 'R1', title: 'MLBB', date: day, partner: 'A', result: { mode: 'wl', won: 2, lost: 1, drawn: 0 }, progress: 4, fixCheck: 'No change', prevAdjust: 'Ward before lord', adjust: 'Rotate mid at 4:00', createdAt: `${day}T09:00Z` },
    { id: 'R2', title: 'MLBB', date: day, partner: 'B', result: { mode: 'wl', won: 0, lost: 2, drawn: 0 }, progress: 2, fixCheck: 'Fixed', adjust: 'Faster turtle', createdAt: `${day}T12:00Z` },
    { id: 'R0', title: 'MLBB', date: '2026-11-13', partner: 'C', result: { mode: 'wl', won: 1, lost: 0, drawn: 0 }, progress: 5, adjust: 'old', createdAt: '2026-11-13T09:00Z' },
  ];
  const scrims = [{ title: 'MLBB', date: day, status: 'planned', partner: 'Team Q' }, { title: 'MLBB', date: day, status: 'done', partner: 'A' }];
  const wtags = [{ title: 'MLBB', reportId: 'R1', date: day, tags: ['vision'] }, { title: 'MLBB', reportId: 'x', date: '2026-11-12', tags: ['vision'] }, { title: 'MLBB', reportId: 'y', date: '2026-11-11', tags: ['vision'] }];
  const [m, d] = daySummary(['MLBB', 'Dota 2'], day, { reports, scrims, wtags });
  assert.equal(m.sessions, 2); assert.equal(m.result, '2-3'); assert.equal(m.progress, 3); assert.equal(m.notLogged, 1);
  assert.deepEqual(m.fix, { 'No change': 1, Fixed: 1 });
  assert.deepEqual(m.priorities.map((p) => p.kind), ['log', 'unfixed', 'recurring']);
  assert.equal(d.sessions, 0);
  const en = dayText([m, d], day); assert.match(en, /\*MLBB\*: 2 reports, 2-3, plan followed 3\/5, 1 session\(s\) not logged\./); assert.doesNotMatch(en, /Dota 2/);
  assert.match(dayText([m], day, 'id'), /Prioritas besok:/);
  assert.match(dayText([d], day), /No sessions or reports today yet/);
});

test('page: Today shows End of day; Scrims, Weaknesses and Patterns open with the new panels without errors', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#today', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 40)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  assert.match(main(), /End of day/);
  for (const v of ['mlbb-scrims', 'mlbb-weak', 'mlbb-patterns', 'dota-scrims', 'dota-patterns', 'pubgm-scrims', 'pubgm-weak']) { await go(v); assert.doesNotMatch(main(), /Something failed/, v); }
  await go('mlbb-weak'); assert.match(main(), /VOD review — our games/);
  // Add a VOD of our game and two marks.
  d.getElementById('ovU-MLBB').value = 'https://youtu.be/abc'; d.getElementById('ovE-MLBB').value = 'Scrim vs X g1';
  d.querySelector('[data-ov-add="MLBB"]').click(); await wait();
  assert.match(d.getElementById('ovMsg-MLBB').textContent, /VOD added/);
  d.getElementById('ovT-MLBB').value = '12:30'; d.getElementById('ovL-MLBB').value = 'vision'; d.getElementById('ovN-MLBB').value = 'no ward before lord';
  d.querySelector('[data-ov-mark="MLBB"]').click(); await wait();
  assert.match(main(), /Themes \(28 days\)/); assert.match(main(), /vision/);
  // Rival VOD library stays rival-only.
  await go('mlbb-rivals'); assert.doesNotMatch(main(), /Scrim vs X g1/);
  assert.ok(reportsCsv([]).startsWith('id,'));
});
