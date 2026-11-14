import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { liveEntry, liveOf, liveSummary, opponentBrief, preMatchBrief, approveBrief, approvedBrief, briefShareText } from '../src/core/scouting.js';
import { board, coverage } from '../src/core/competitors.js';
import { localDay } from '../src/core/dates.js';

const base = { title: 'MLBB', nation: 'Myanmar', by: 'Analyst A', match: 'Myanmar vs Malaysia g1' };
const at = (h) => new Date(`2026-12-15T${String(h).padStart(2, '0')}:00:00+07:00`);

test('live entry: validation, phone-made id, WIB day, performance only', () => {
  assert.throws(() => liveEntry({ ...base, nation: 'Philippines', type: 'note', text: 'x' }), /not in the published MLBB field/);
  assert.throws(() => liveEntry({ ...base, type: 'dance', text: 'x' }), /Pick what you saw/);
  assert.throws(() => liveEntry({ ...base, type: 'pick', hero: '' }), /hero, map or item/);
  assert.throws(() => liveEntry({ ...base, type: 'player', text: 'aggressive', player: '' }), /Name the player/);
  assert.throws(() => liveEntry({ ...base, type: 'note', text: 'call 081234567890' }), /phone/);
  assert.throws(() => liveEntry({ ...base, type: 'note', text: 'x', t: '12.30' }), /12:30/);
  assert.throws(() => liveEntry({ ...base, type: 'note', text: 'x'.repeat(201) }), /200/);
  const e = liveEntry({ ...base, type: 'pick', hero: 'Ling', t: '0:45', phase: 'draft' }, at(1));
  assert.equal(e.kind, 'live'); assert.match(e.id, /^LV-20261214180000-/); assert.equal(e.date, '2026-12-15', '01:00 WIB is 15 Dec, though UTC is 14 Dec');
});

test('live summary and opponent brief: known with sources, TBD gaps, watch-for from repeats (2+)', () => {
  const L = [
    liveEntry({ ...base, type: 'pick', hero: 'Ling' }, at(9)), liveEntry({ ...base, type: 'pick', hero: 'ling ' }, at(10)),
    liveEntry({ ...base, type: 'ban', hero: 'Fanny' }, at(10)),
    liveEntry({ ...base, type: 'tendency', text: 'Invades our jungle at 0:30' }, at(11)), liveEntry({ ...base, match: 'g2', type: 'tendency', text: 'invades our jungle at 0:30' }, at(12)),
    liveEntry({ ...base, type: 'player', player: 'J3X', text: 'Roams early' }, at(12)),
  ];
  const S = liveSummary(L);
  assert.deepEqual(S.picks[0], { label: 'Ling', n: 2, matches: 1 }); assert.equal(S.strategies[0].n, 2); assert.equal(S.strategies[0].matches, 2);
  const card = { tier: 'main threat', tierWhy: 'AG gold', tierBy: 'Aufa', roster: [{ ign: 'J3X', captain: true }, { ign: 'Coin' }], coach: 'Thet Lynn Htut',
    observed: [{ note: 'Won AG 2026 gold', source: 'AG26', date: '2026-10-01' }], hypotheses: [{ note: 'Greedy drafts', source: 'VOD' }],
    results: [{ event: 'AG 2026', date: '2026-10-01', result: 'Gold', source: 'AESF' }, { event: 'X', date: '2026-07', result: 'r', source: 's', check: true }],
    vods: [], gaps: ['No reviewed VOD.'], banCandidates: [] };
  const B = opponentBrief({ title: 'MLBB', nation: 'Myanmar', card, live: L, standIn: { n: 2, won: 1, lowSample: true }, book: null,
    rosterChanged: { date: '2026-11-13', added: ['J3X'], removed: ['KidX'] } });
  assert.ok(B.known.some((k) => /Staff tier: main threat — AG gold/.test(k.text)));
  assert.ok(B.known.some((k) => /Roster: J3X \(C\), Coin; coach Thet Lynn Htut/.test(k.text)));
  assert.ok(B.known.some((k) => /1-1 in 2 game\(s\) \(small sample/.test(k.text)), 'small samples labelled');
  assert.ok(B.tbd.some((k) => /to confirm/.test(k.text))); assert.ok(B.tbd.some((k) => /No reviewed VOD/.test(k.text)));
  assert.ok(B.watch.some((k) => /Roster changed on 2026-11-13/.test(k.text)));
  assert.ok(B.watch.some((k) => /Picked Ling 2×/.test(k.text))); assert.ok(!B.watch.some((k) => /Fanny/.test(k.text)), 'a single ban is not a pattern');
  assert.ok(B.watch.every((k) => k.src), 'every line has a source');
  const P = preMatchBrief({ match: { id: 'M1', date: '2026-12-16' }, brief: B, liveToday: L.slice(3) });
  assert.ok(P.suggested.length >= 1 && P.suggested.length <= 3); assert.match(P.suggested[0], /Invades our jungle at 0:30 \(seen 2×\)/);
  assert.equal(P.tendencies[0].today, true);
  const empty = opponentBrief({ title: 'MLBB', nation: 'Nepal', card: { gaps: [] }, live: [] });
  assert.ok(empty.tbd.some((k) => /No live observation yet/.test(k.text)));
});

test('approval: 1–3 short points, stable id per match, share text only from the approved points', () => {
  assert.throws(() => approveBrief({ title: 'MLBB', nation: 'Myanmar', points: ['', ''], by: 'A' }), /1 to 3/);
  assert.throws(() => approveBrief({ title: 'MLBB', nation: 'Myanmar', points: ['x'.repeat(161)], by: 'A' }), /160/);
  assert.throws(() => approveBrief({ title: 'MLBB', nation: 'Myanmar', points: ['ok'], by: '' }), /approved/);
  const a = approveBrief({ title: 'MLBB', nation: 'Myanmar', matchId: 'M1', points: ['Ward their jungle early', '', 'Ban Ling'], by: 'Coach Indra' });
  const b = approveBrief({ title: 'MLBB', nation: 'Myanmar', matchId: 'M1', points: ['Changed'], by: 'Coach Indra' });
  assert.equal(a.id, b.id, 'a second approval replaces the first'); assert.deepEqual(a.points, ['Ward their jungle early', 'Ban Ling']);
  assert.equal(approvedBrief([a], 'MLBB', 'Myanmar', 'M1', '2026-12-16').approvedBy, 'Coach Indra');
  const txt = briefShareText({ title: 'MLBB', nation: 'Myanmar', match: { date: '2026-12-16' }, likely: [{ text: 'Pick: Ling', n: 2 }] }, a, 'id');
  assert.match(txt, /3 poin utama:/); assert.match(txt, /1\. Ward their jungle early/); assert.match(txt, /Disetujui oleh Coach Indra/);
  // Live entries and briefs never count as scouting notes.
  assert.equal(board('MLBB', [a, liveEntry({ ...base, type: 'note', text: 'x' })]).covered, board('MLBB').covered);
  assert.equal(coverage({ rivals: [a] }).find((c) => c.title === 'MLBB').noted, coverage().find((c) => c.title === 'MLBB').noted);
  assert.equal(liveOf([a], 'MLBB', 'Myanmar').length, 0);
});

test('page: Live scouting — log a tendency twice, it shows in the log and as watch-for; approve, then share', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  let copied = '';
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#tour-scout', beforeParse(w) {
    w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (x) => { copied = x; } } }); } });
  const wait = () => new Promise((r) => setTimeout(r, 40)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  assert.match(main(), /Live scouting/); assert.match(main(), /Opponent brief — /); assert.match(main(), /Not approved yet: sharing is off/);
  d.getElementById('scT').value = 'MLBB'; d.getElementById('scT').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  d.getElementById('scN').value = 'Myanmar'; d.getElementById('scN').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  d.querySelector('[data-sc-type="tendency"]').click(); await wait();
  for (let i = 0; i < 2; i++) { d.getElementById('scX').value = 'Invades our jungle at 0:30'; d.getElementById('scSave').click(); await wait(); }
  assert.match(d.getElementById('scMsg').textContent, /Saved/);
  assert.match(main(), /Log — Myanmar \(2 today, 2 in total\)/); assert.match(main(), /Invades our jungle at 0:30 \(seen 2×\)/);
  if (localDay() <= '2026-11-27') assert.match(main(), /Roster changed on 2026-11-13/, 'the 13 Nov roster re-read shows as watch-for (14 days)');
  d.getElementById('scX').value = ''; d.getElementById('scSave').click(); await wait();
  assert.match(d.getElementById('scMsg').textContent, /Write what you saw/);
  assert.match(d.getElementById('scK0').value, /Invades our jungle/, 'suggested key point prefilled');
  d.getElementById('scApprove').click(); await wait();
  assert.match(main(), /approved by/);
  d.getElementById('scShare').click(); await wait();
  assert.match(copied, /MLBB: Indonesia vs Myanmar/); assert.match(copied, /1\. They tend to: Invades our jungle at 0:30/);
});
