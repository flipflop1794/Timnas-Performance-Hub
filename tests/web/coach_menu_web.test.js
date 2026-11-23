// V1.46–V1.47 on the website: the MLBB title coach (the template category) gets the category workspace: five tabs —
// My team, Opponents, Meta, Ask AI, Match prep — and nothing from other games. "More" shows everything else.
// Other title coaches keep the full menu until their workspace switches on; removed screens still open by link.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten by another test file */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  indra: { id: 'u-indra', email: 'indra@example.test', password: 'pw', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB'] },
  rama: { id: 'u-rama', email: 'rama@example.test', password: 'pw', name: 'Coach Rama', roles: ['title_coach'], titles: ['Dota 2'] },
  fayad: { id: 'u-fayad', email: 'fayad@example.test', password: 'pw', name: 'Coach Fayad', roles: ['head_coach'], titles: [] },
};
async function open(who, hash = '', lang = 'en', B = null) {
  B ||= backend(); Object.values(people).forEach((p) => B.addUser(p));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/${hash ? `#${hash}` : ''}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', lang); w.__HUB_TEST_CLIENT__ = B.client(people[who].id); } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  const groups = () => [...d.querySelectorAll('#titles button[data-go]')].filter((b) => b.id !== 'homeBtn').map((b) => b.textContent.trim());
  const tabs = () => [...d.querySelectorAll('#tabs a')].map((a) => a.textContent.trim());
  const current = () => d.querySelector('#tabs a[aria-current="page"]')?.textContent.trim();
  return { B, d, w: dom.window, groups, tabs, current, text: () => d.getElementById('main').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await sleep(80); } };
}
const FIVE = ['My team', 'Opponents', 'Meta', 'Ask AI', 'Match prep'];

test('MLBB coach: one workspace, five tabs, lands on My team; every tab stays inside MLBB', async () => {
  const c = await open('indra');
  assert.deepEqual(c.groups(), ['MLBB']); assert.deepEqual(c.tabs(), FIVE);
  assert.equal(c.w.location.hash, '#mlbb-reports'); assert.equal(c.current(), 'My team');
  assert.equal(c.d.getElementById('modeBtn'), null, 'no demo sandbox button in the workspace');
  assert.match(c.text(), /Scrim reports — MLBB/); assert.ok(c.d.querySelector('nav.subnav[aria-label="My team"]'));
  await c.go('mlbb-trends'); assert.equal(c.current(), 'My team', 'trends belong to My team'); assert.deepEqual(c.tabs(), FIVE);
  await c.go('comp-card'); assert.equal(c.current(), 'Opponents'); assert.equal(c.d.getElementById('ocT'), null, 'no title picker: the coach has one category');
  assert.match(c.text(), /Indonesia vs Malaysia/); assert.match(c.text(), /Draft plan/);
  const opts = [...c.d.querySelectorAll('#ocN option')].map((o) => o.textContent);
  assert.deepEqual(opts, ['Malaysia', 'Cambodia', 'Myanmar', 'Türkiye', 'Egypt', 'Nepal', 'Dominican Republic'], 'only the MLBB Men field');
  await c.go('mlbb-meta'); assert.equal(c.current(), 'Meta'); assert.match(c.text(), /Strong right now \(official\)/); assert.match(c.text(), /Obsidia/);
  await c.go('mlbb-brain'); assert.equal(c.current(), 'Ask AI'); assert.match(c.text(), /Ask AI — MLBB/);
  assert.ok([...c.d.querySelectorAll('.chip')].some((b) => /Malaysia/.test(b.textContent)), 'starter questions name a real opponent');
  assert.doesNotMatch(c.text(), /Purpose/, 'no menu of analysis types');
  await c.go('tour-runbook'); assert.equal(c.current(), 'Match prep'); assert.match(c.text(), /Match-day runbook — MLBB/);
  assert.doesNotMatch(c.d.getElementById('tabs').textContent + c.d.getElementById('titles').textContent, /Dota|CS2|PUBG|eFootball/);
});

test('opponents: hide one, add one, show again; the list stays per category', async () => {
  const c = await open('indra', 'comp-card');
  c.d.querySelector('details summary.note')?.click();
  c.d.querySelector('[data-fe]').click(); await sleep(400);
  assert.ok(![...c.d.querySelectorAll('#ocN option')].some((o) => o.textContent === 'Malaysia'), 'Malaysia hidden');
  assert.match(c.text(), /Hidden: Malaysia \(show again\)/);
  c.d.getElementById('feAdd').value = 'RRQ Hoshi'; c.d.querySelector('[data-fe-add]').click(); await sleep(400);
  assert.match(c.text(), /Indonesia vs RRQ Hoshi/); assert.ok([...c.d.querySelectorAll('#ocN option')].some((o) => o.textContent === 'RRQ Hoshi'));
  [...c.d.querySelectorAll('[data-fe]')].find((b) => /show again/.test(b.textContent)).click(); await sleep(400);
  assert.ok([...c.d.querySelectorAll('#ocN option')].some((o) => o.textContent === 'Malaysia'));
  const saved = c.B.tables.scouting_notes.map((r) => r.data).filter((x) => x.kind === 'field');
  assert.deepEqual(saved.map((x) => [x.title, x.nation, x.action]), [['MLBB', 'Malaysia', 'hide'], ['MLBB', 'RRQ Hoshi', 'add'], ['MLBB', 'Malaysia', 'show']]);
});

test('"More" brings the full menu back and the workspace returns; Bahasa labels', async () => {
  const c = await open('indra');
  const btn = () => c.d.getElementById('focusBtn');
  assert.equal(btn().textContent, 'More'); btn().click(); await sleep(60);
  assert.ok(c.groups().includes('Competitors')); assert.equal(btn().textContent, 'Short menu');
  btn().click(); await sleep(60); assert.deepEqual(c.groups(), ['MLBB']);
  const id = await open('indra', 'mlbb-reports', 'id');
  assert.deepEqual(id.tabs(), ['Tim saya', 'Lawan', 'Meta', 'Tanya AI', 'Persiapan laga']); assert.equal(id.d.getElementById('focusBtn').textContent, 'Lainnya');
});

test('other coaches keep the full menu; removed screens are off the menus but open by link; the Head Coach keeps the board', async () => {
  const r = await open('rama', 'today');
  assert.ok(r.groups().includes('Competitors')); assert.equal(r.d.getElementById('focusBtn').textContent, 'Show all tools');
  r.d.getElementById('focusBtn').click(); await sleep(60);
  assert.ok(!r.tabs().includes('Juara Umum board'), 'not even under "Show all tools" for a title coach');
  await r.go('staff-measure'); assert.match(r.text(), /Is the hub helping/);
  const f = await open('fayad', 'today'); f.d.getElementById('focusBtn').click(); await sleep(60);
  assert.ok(f.tabs().includes('Juara Umum board')); await f.go('staff-cycle'); assert.ok(!f.tabs().includes('Is it working?'));
});

test('Ask AI: a starter question about Malaysia sends the workspace, the opponent and the official meta; the answer saves to Malaysia\'s profile', async () => {
  const B = backend(); B.aiActions = ['scoreboard', 'draft', 'brainstorm']; const calls = [];
  B.ai = async (body) => { calls.push(body); return { data: { raw: { reply: 'Ban the heroes they rely on; see W2 and R1.', sources: ['W2', 'R1'], follow_ups: ['What about Cambodia?'], suggestions: [] } } }; };
  const c = await open('indra', 'mlbb-brain', 'en', B);
  const chip = [...c.d.querySelectorAll('.chip')].find((b) => b.textContent === 'What should we ban against Malaysia?'); assert.ok(chip, 'starter chip');
  chip.click(); await sleep(60); assert.equal(c.d.getElementById('brQ-MLBB').value, 'What should we ban against Malaysia?');
  c.d.querySelector('[data-br-send="MLBB"]').click(); for (let i = 0; i < 40 && !calls.length; i++) await sleep(50); await sleep(200);
  const body = calls[0]; assert.equal(body.action, 'brainstorm'); assert.equal(body.purpose, 'opponent');
  assert.deepEqual(body.material.WORKSPACE.map((x) => x.id).slice(0, 3), ['W1', 'W2', 'W3']); assert.match(body.material.WORKSPACE[1].text, /Malaysia, Cambodia, Myanmar/);
  assert.match(body.material.PURPOSE, /about Malaysia/); assert.ok(body.material.META.some((m) => m.id === 'R1' && /Obsidia win 52.88%/.test(m.text)));
  assert.match(c.text(), /Ban the heroes they rely on/); assert.match(c.text(), /from W2, R1/);
  c.d.querySelector('[data-ask-save]').click(); await sleep(400);
  const note = c.B.tables.scouting_notes.map((r) => r.data).find((x) => x.kind === 'hypothesis');
  assert.equal(note.nation, 'Malaysia'); assert.equal(note.title, 'MLBB'); assert.match(note.source, /Ask AI, .*from W2, R1.*saved by Coach Indra/); assert.match(c.text(), /saved to Malaysia/);
  // A question with no opponent in it: no opponent material.
  c.d.getElementById('brQ-MLBB').value = 'Plan three scrims for this week.'; c.d.querySelector('[data-br-send="MLBB"]').click();
  for (let i = 0; i < 40 && calls.length < 2; i++) await sleep(50);
  assert.equal(calls[1].purpose, 'plan'); assert.match(calls[1].material.PURPOSE, /^answer the coach's question$/);
});
