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


const p = (side, slot, name, hero, k, d, a) => ({ side, slot, name_seen: name, hero, kills: k, deaths: d, assists: a, gold: 9000, hero_damage: 60000, tower_damage: 3000, damage_taken: 40000, last_hits: -1, denies: -1, gpm: -1, xpm: -1, rating: 8, mvp: false, uncertain_fields: [] });
const board = { screen_kind: 'scoreboard', readable: true, winner_side: 'red', duration_seconds: 1500, score: { blue: 9, red: 18 }, notes: '',
  players: [p('blue', 1, 'ONIC Kiboy', 'Hilda', 2, 4, 3), p('blue', 2, 'ONIC Sanz', 'Pharsa', 3, 4, 2), p('blue', 3, 'ONIC CW', 'Beatrix', 2, 3, 3), p('blue', 4, 'ONIC Lutpi', 'Lukas', 1, 4, 2), p('blue', 5, 'ONIC Kairi', 'Joy', 1, 3, 4),
    p('red', 1, 'Aran', 'Fredrinn', 3, 1, 9), p('red', 2, 'Kevin', 'Valentina', 6, 2, 8), p('red', 3, 'Drichel', 'Granger', 7, 1, 5), p('red', 4, 'Lyoni', 'Lapu-Lapu', 2, 3, 6), p('red', 5, 'Jull.', 'Chip', 0, 2, 12)] };
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
  assert.equal(P.d.getElementById('cg-MLBB-our').value, 'red', 'our side found from the roster names'); assert.equal(P.d.getElementById('cg-MLBB-result').value, 'win');
  await P.click('[data-cap-confirm="MLBB"]');
  P.set('rp-MLBB-partner', 'ONIC'); P.set('rp-MLBB-focus', 'Lord setups'); P.set('rp-MLBB-worked', 'early game'); P.set('rp-MLBB-adjust', 'vision before lord'); P.set('rp-MLBB-progress', '3');
  await P.click('[data-report-save="MLBB"]'); await sleep(100);
  assert.match(P.d.getElementById('rpMsg-MLBB').textContent, /1-0 vs ONIC, 1 game with stats/);
  assert.equal(B.tables.scrim_games.length, 1);
  const g = B.tables.scrim_games[0]; const rep = B.tables.scrim_reports[0];
  assert.equal(g.data.reportId, rep.id); assert.equal(g.title, 'MLBB'); assert.equal(g.data.players.filter((x) => x.team === 'ours').map((x) => x.player).join(','), 'Aran,Kevin,Drichel,Lyoni,Jull.');
  // Aufa (assistant coach, all titles) sees it on the Patterns tab; a PUBG Mobile coach sees nothing.
  const A = await open(B, 'aufa', 'mlbb-patterns'); assert.match(A.text(), /Confirmed games1/);
  const C = await open(B, 'christie', 'mlbb-patterns'); assert.match(C.text(), /not assigned to MLBB/); assert.match(C.text(), /Confirmed games0/);
});

test('website: when the AI function is not deployed, the coach is told to type the game by hand', async () => {
  const B = world(); const P = await open(B, 'indra', 'mlbb-reports');
  await upload(P);
  assert.match(P.d.getElementById('capMsg-MLBB').textContent, /AI capture is not set up on the server yet/);
  assert.ok(P.d.querySelector('[data-cap-manual="MLBB"]'), 'by-hand path still there');
});

test('website: AI refusals reach the coach as plain sentences', async () => {
  const B = world(); B.ai = async () => ({ status: 429, error: 'Daily AI limit reached (300 calls). Enter the values by hand today, or ask the admin to raise the limit.' });
  const P = await open(B, 'indra', 'mlbb-reports'); await upload(P);
  assert.match(P.d.getElementById('capMsg-MLBB').textContent, /Daily AI limit reached/);
});
