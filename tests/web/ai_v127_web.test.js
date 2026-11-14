// V1.27 on the website with a fake AI: Brainstorm (grounded reply → proposal for review), feedback saved, and the
// AI pre-match draft filling the key points (a line with an unknown number is left out).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten by another test file */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const indra = { id: 'u-indra', email: 'indra@example.test', password: 'pw', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB'] };
const at = new Date().toISOString(); const t0 = localDay();
function world() {
  const B = backend(); B.addUser(indra);
  B.aiActions = ['scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm'];
  B.calls = []; B.answers = {};
  B.ai = async (body) => { B.calls.push(body); const a = B.answers[body.action]; return a ? { data: { raw: typeof a === 'function' ? a(body) : a, model: 'm' } } : { status: 400, error: 'no fake answer' }; };
  const doc = (table, id, data) => B.tables[table].push({ id, title: 'MLBB', data: { id, title: 'MLBB', origin: 'operational', ...data }, created_by: 'u-indra', created_at: at, updated_by: 'u-indra', updated_at: at });
  for (let i = 0; i < 3; i++) {
    doc('scrim_reports', `R${i}`, { date: shiftDay(t0, -i - 1), by: 'Coach Indra', partner: 'Team Q', result: { mode: 'wl', won: 1, lost: 2, drawn: 0 }, focus: 'f', progress: 3, worked: 'w', failed: 'no vision at lord', adjust: 'ward early', notes: [], createdAt: at });
    doc('weakness_tags', `WT-R${i}`, { reportId: `R${i}`, date: shiftDay(t0, -i - 1), tags: ['vision'], source: 'coach', by: 'x', at });
  }
  return B;
}
async function open(B, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(indra.id); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  return { dom, d, text: () => d.getElementById('main').textContent,
    wait: async (sel) => { for (let i = 0; i < 80 && !d.querySelector(sel); i++) await sleep(50); return d.querySelector(sel); } };
}

test('Brainstorm: a grounded reply, a suggestion with an unknown number left out, a proposal sent for review, feedback saved', async () => {
  const B = world();
  B.answers.brainstorm = (body) => ({ reply: 'Vision came back 3 times. Plan 77 wards before lord.', sources: ['WK-vision', 'made-up'], follow_ups: ['Which drill fits best?'],
    suggestions: [{ kind: 'proposal', title: 'Vision before lord', detail: 'Ward drill before each lord', sources: ['WK-vision'] }, { kind: 'session', title: 'Too many wards', detail: '99 wards', sources: ['WK-vision'] }] });
  const p = await open(B, 'mlbb-brain');
  const q = await p.wait('#brQ-MLBB'); assert.ok(q, 'Brainstorm is on');
  q.value = 'What should tomorrow focus on?'; p.d.querySelector('[data-br-send="MLBB"]').click();
  for (let i = 0; i < 60 && !/Vision came back/.test(p.text()); i++) await sleep(50);
  const sent = B.calls.find((c) => c.action === 'brainstorm'); assert.equal(sent.purpose, 'plan'); assert.ok(JSON.stringify(sent.material).includes('"WK-vision"'));
  assert.match(p.text(), /from WK-vision/); assert.doesNotMatch(p.text(), /made-up/);
  assert.match(p.text(), /Numbers not found in the records: 77/);
  assert.match(p.text(), /Turn into a coaching proposal: Vision before lord/); assert.doesNotMatch(p.text(), /Too many wards/);
  p.d.querySelector('[data-br-turn]').click(); for (let i = 0; i < 40 && !B.tables.coaching_objectives.length; i++) await sleep(50);
  const o = B.tables.coaching_objectives.find((x) => x.data.rec?.problem === 'Vision before lord'); assert.ok(o); assert.equal(o.data.status, 'proposed');
  const useful = [...p.d.querySelectorAll('[data-fb]')].find((b) => JSON.parse(b.dataset.fb).rating === 'useful'); useful.click();
  for (let i = 0; i < 40 && !B.tables.scouting_notes.some((r) => r.data.kind === 'ai_feedback'); i++) await sleep(50);
  const fb = B.tables.scouting_notes.find((r) => r.data.kind === 'ai_feedback'); assert.equal(fb.data.feature, 'brainstorm'); assert.equal(fb.data.rating, 'useful');
});

test('Live scouting: the AI pre-match draft fills the key points; a line with an unknown number is left out', async () => {
  const B = world();
  B.answers.prematch = () => ({ likely: [{ text: 'They pick early-game junglers', sources: ['K1'] }], threats: [], watch: [],
    key_points: [{ text: 'Ward their jungle entrances early', sources: ['K1'] }, { text: 'Expect 97 bans', sources: ['K1'] }, { text: 'Win lane 1', sources: ['nope'] }], tbd: ['Their WEC draft order'] });
  const p = await open(B, 'tour-scout');
  const ai = await p.wait('#scAI'); assert.ok(ai, 'AI draft button shown');
  ai.click(); for (let i = 0; i < 60 && !/AI pre-match draft/.test(p.text()); i++) await sleep(50);
  assert.equal(p.d.getElementById('scK0').value, 'Ward their jungle entrances early');
  assert.match(p.text(), /2 line\(s\) left out/); assert.match(p.text(), /TBD: Their WEC draft order/);
});
