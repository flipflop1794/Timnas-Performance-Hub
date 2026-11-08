// V1.13 on the website build: screenshot capture through the scrim-ai function, games saved with the
// report in the shared database, visible to other staff, hidden from other titles; AI unavailable = by hand.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';

let html;
before(() => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  aufa: { id: 'u-aufa', email: 'aufa@example.test', password: 'pw-aufa-123', name: 'Aufa Bassam', staffKey: 'aufa', roles: ['admin', 'assistant_coach'], titles: ['Dota 2', 'MLBB'] },
  fayad: { id: 'u-fayad', email: 'fayad@example.test', password: 'pw-fayad-123', name: 'Fayad', staffKey: 'fayad', roles: ['head_coach'], titles: [] },
  donny: { id: 'u-donny', email: 'donny@example.test', password: 'pw-donny-123', name: 'Donny Ardy Kusuma', staffKey: 'donny', roles: ['assistant_coach', 'readiness_owner'], titles: [] },
  indra: { id: 'u-indra', email: 'indra@example.test', password: 'pw-indra-123', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB'] },
  christie: { id: 'u-chr', email: 'christie@example.test', password: 'pw-chr-12345', name: 'Christie', roles: ['title_coach'], titles: ['PUBG Mobile'] },
  newbie: { id: 'u-new', email: 'new@example.test', password: 'pw-new-12345', name: 'new', roles: [], titles: [] },
};
function world() { const B = backend(); Object.values(people).forEach((p) => B.addUser(p)); return B; }
async function open(B, who, hash = 'today') {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: hash ? `https://hub.example.test/#${hash}` : 'https://hub.example.test/',
    beforeParse(w) { w.__HUB_TEST_CLIENT__ = B.client(who ? people[who].id : null); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document;
  for (let i = 0; i < 60 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(60);
  return { dom, d, w: dom.window, text: () => d.getElementById('main').textContent, nav: () => d.getElementById('titles').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await sleep(40); },
    set: (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); },
    click: async (sel) => { d.querySelector(sel).click(); await sleep(60); } };
}


const REAL = JSON.parse(readFileSync(new URL('../fixtures/mlbb_real_screens.json', import.meta.url), 'utf8'));
// A real screen where OUR five are on the right: the screenshot came from the partner's phone (VICTORY is theirs).
const board = JSON.parse(JSON.stringify(REAL[3].raw));
board.players.forEach((x) => { x.side = x.side === 'left' ? 'right' : 'left'; x.name_seen = x.side === 'right' ? ['Aran', 'Kevin', 'Drichel', 'Lyoni', 'Jull.'][x.slot - 1] : `Opp${x.slot}`; x.hero = REAL[3].truthHeroes[x.side === 'right' ? 'left' : 'right'][x.slot - 1]; x.hero_sure = true; });
board.score = { left: REAL[3].raw.score.right, right: REAL[3].raw.score.left };
async function upload(P) {
  const input = P.d.querySelector('[data-cap-shot="MLBB"]'); assert.ok(input, 'upload button');
  const file = new P.w.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])], 'shot.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] }); input.dispatchEvent(new P.w.Event('change', { bubbles: true })); await sleep(150);
}

test('website: a coach captures a game from a screenshot, saves the report; the game is shared, title-scoped and insert-only', async () => {
  const B = world(); const seen = [];
  B.ai = async (body, uid) => { seen.push({ action: body.action, title: body.title, uid }); return { data: { captureId: 'cap-1', raw: board, model: 'claude-sonnet-5-5' } }; };
  const P = await open(B, 'indra', 'mlbb-reports');
  await upload(P);
  assert.deepEqual(seen[0], { action: 'scoreboard', title: 'MLBB', uid: 'u-indra' });
  assert.equal(P.d.getElementById('cg-MLBB-our').value, 'right', 'our team found from the roster names'); assert.equal(P.d.getElementById('cg-MLBB-result').value, 'loss', 'VICTORY on the partner\'s screen = our loss');
  await P.click('[data-cap-confirm="MLBB"]');
  P.set('rp-MLBB-partner', 'ONIC'); P.set('rp-MLBB-focus', 'Lord setups'); P.set('rp-MLBB-worked', 'early game'); P.set('rp-MLBB-adjust', 'vision before lord'); P.set('rp-MLBB-progress', '3');
  await P.click('[data-report-save="MLBB"]'); await sleep(100);
  assert.match(P.d.getElementById('rpMsg-MLBB').textContent, /0-1 vs ONIC, 1 game with stats/);
  assert.equal(B.tables.scrim_games.length, 1);
  const g = B.tables.scrim_games[0]; const rep = B.tables.scrim_reports[0];
  assert.equal(g.data.reportId, rep.id); assert.equal(g.title, 'MLBB'); assert.equal(g.data.players.filter((x) => x.team === 'ours').map((x) => x.player).join(','), 'Aran,Kevin,Drichel,Lyoni,Jull.');
  // Aufa (assistant coach, all titles) sees it on the Patterns tab; a PUBG Mobile coach sees nothing.
  const A = await open(B, 'aufa', 'mlbb-patterns'); assert.match(A.text(), /Confirmed games1/);
  const C = await open(B, 'christie', 'mlbb-patterns'); assert.match(C.text(), /not assigned to MLBB/); assert.match(C.text(), /Confirmed games0/);
});

test('website: when the AI function is not deployed, AI buttons are hidden and the by-hand path stays', async () => {
  const B = world(); const P = await open(B, 'indra', 'mlbb-reports');
  assert.equal(P.d.querySelector('[data-cap-shot="MLBB"]'), null, 'no screenshot upload without AI');
  assert.ok(P.d.querySelector('[data-cap-manual="MLBB"]'), 'by-hand path still there');
});

test('website updated before the database (V1.13–V1.15 tables missing): the hub works as before, new parts hidden, admin sees what is pending', async () => {
  const B = world(); B.missing = new Set(['scrim_games', 'scrim_captures', 'pattern_findings', 'player_aliases', 'ai_usage', 'draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games', 'readiness_store']);
  const P = await open(B, 'indra', 'mlbb-reports');
  assert.doesNotMatch(P.text(), /Something failed/); assert.match(P.text(), /No report yet|Scrim reports/);
  const tabs = [...P.d.querySelectorAll('#tabs a')].map((a) => a.textContent);
  assert.ok(!tabs.includes('Patterns') && !tabs.includes('Draft Room'), tabs.join());
  assert.equal(P.d.querySelector('[data-cap-manual="MLBB"]'), null);
  const A = await open(B, 'aufa', 'admin-users'); for (let i = 0; i < 30 && !/What is switched on/.test(A.text()); i++) await sleep(50);
  assert.match(A.text(), /What is switched on/); assert.match(A.text(), /pending Scrim capture/); assert.match(A.text(), /RUN_ON_LIVE_V1_13_TO_V1_15\.sql/);
  await A.go('readiness'); assert.match(A.text(), /switches on after the V1.15 database update/); assert.doesNotMatch(A.text(), /Something failed/);
});

test('website: AI refusals reach the coach as plain sentences', async () => {
  const B = world(); B.ai = async () => ({ status: 429, error: 'Daily AI limit reached (300 calls). Enter the values by hand today, or ask the admin to raise the limit.' });
  const P = await open(B, 'indra', 'mlbb-reports'); await upload(P);
  assert.match(P.d.getElementById('capMsg-MLBB').textContent, /Daily AI limit reached/);
});

test('website: after the first load, a new game fetches only new rows, not every game again', async () => {
  const B = world(); B.ai = async () => ({ data: { captureId: `cap-${Math.random()}`, raw: board, model: 'm' } });
  const P = await open(B, 'indra', 'mlbb-reports');
  for (let r = 0; r < 3; r++) {
    B.skew = r * 3600_000;   // sessions an hour apart
    await upload(P); await P.click('[data-cap-confirm="MLBB"]');
    P.set('rp-MLBB-partner', `P${r}`); P.set('rp-MLBB-focus', 'f'); P.set('rp-MLBB-worked', 'w'); P.set('rp-MLBB-adjust', 'a'); P.set('rp-MLBB-progress', '3');
    await P.click('[data-report-save="MLBB"]'); await sleep(400);
  }
  assert.equal(B.tables.scrim_games.length, 3);
  B.skew = 3 * 3600_000;
  const before = B.selected.scrim_games || 0;
  await upload(P); await P.click('[data-cap-confirm="MLBB"]');
  P.set('rp-MLBB-partner', 'P9'); P.set('rp-MLBB-focus', 'f'); P.set('rp-MLBB-worked', 'w'); P.set('rp-MLBB-adjust', 'a'); P.set('rp-MLBB-progress', '3');
  await P.click('[data-report-save="MLBB"]'); await sleep(600);
  const fetched = (B.selected.scrim_games || 0) - before;
  assert.ok(fetched >= 1 && fetched <= 2, `fetched ${fetched} game rows for one new game (would be 4 with full reloads)`);
  await P.go('mlbb-patterns'); assert.match(P.text(), /Confirmed games4/);
});

test('website before the database update: every screen opens for the admin and a title coach without an error', async () => {
  const B = world(); B.missing = new Set(['scrim_games', 'scrim_captures', 'pattern_findings', 'player_aliases', 'ai_usage', 'draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games', 'readiness_store']);
  for (const who of ['aufa', 'indra']) {
    const P = await open(B, who, 'today'); const seen = new Set(); const queue = ['today'];
    const collect = () => { for (const a of P.d.querySelectorAll('a[href^="#"]')) { const h = a.getAttribute('href').slice(1); if (h && !seen.has(h) && !queue.includes(h)) queue.push(h); } };
    collect();
    while (queue.length) { const v = queue.shift(); seen.add(v); await P.go(v); collect(); assert.doesNotMatch(P.text(), /Something failed/, `${who} ${v}`); }
    assert.ok(seen.size > (who === "aufa" ? 20 : 5), `${who} visited ${seen.size} screens`); // a title coach has the short coach menu
  }
});

test('website with everything switched on: every screen opens for admin, Head Coach, Coach Donny and a title coach', async () => {
  const B = world(); B.ai = async () => ({ data: { ok: true } });
  for (const who of ['aufa', 'fayad', 'donny', 'indra']) {
    const P = await open(B, who, 'today'); const seen = new Set(); const queue = ['today'];
    const collect = () => { for (const a of P.d.querySelectorAll('a[href^="#"]')) { const h = a.getAttribute('href').slice(1); if (h && !seen.has(h) && !queue.includes(h)) queue.push(h); } };
    collect();
    while (queue.length) { const v = queue.shift(); seen.add(v); await P.go(v); collect(); assert.doesNotMatch(P.text(), /Something failed|NaN|undefined|\[object Object\]/, `${who} ${v}`); }
    assert.ok(seen.size > 5, `${who} visited ${seen.size} screens`);
  }
});
