// V1.20 coach AI on the website build, with a fake AI: weekly leadership summary, preparation packs,
// recurring weaknesses and PUBG Mobile results from screenshots.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';

let html;
before(() => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  aufa: { id: 'u-aufa', email: 'aufa@example.test', password: 'pw', name: 'Aufa Bassam', staffKey: 'aufa', roles: ['admin', 'assistant_coach'], titles: ['Dota 2', 'MLBB', 'PUBG Mobile'] },
  fayad: { id: 'u-fayad', email: 'fayad@example.test', password: 'pw', name: 'Fayad', staffKey: 'fayad', roles: ['head_coach'], titles: [] },
  indra: { id: 'u-indra', email: 'indra@example.test', password: 'pw', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB'] },
  ketua: { id: 'u-ketua', email: 'ketua@example.test', password: 'pw', name: 'Ketua BTN', roles: ['leadership'], titles: [] },
};
const at = new Date().toISOString(); const t0 = localDay();
function world() {
  const B = backend(); Object.values(people).forEach((p) => B.addUser(p));
  B.calls = []; B.answers = {};
  B.ai = async (body) => { B.calls.push(body); const a = B.answers[body.action]; return a ? { data: { raw: typeof a === 'function' ? a(body) : a, model: 'm' } } : { status: 400, error: 'no fake answer' }; };
  return B;
}
const doc = (B, table, id, title, data, by = 'u-indra') => B.tables[table].push({ id, title, data: { id, title, origin: 'operational', ...data }, created_by: by, created_at: at, updated_by: by, updated_at: at });
const report = (B, id, title, ago, failed, extra = {}) => doc(B, 'scrim_reports', id, title, { date: shiftDay(t0, -ago), by: 'x', partner: 'Team Q', result: { mode: 'wl', won: 1, lost: 2, drawn: 0 }, focus: 'f', progress: 3, worked: 'w', failed, adjust: 'ward earlier', notes: [], createdAt: at, ...extra });
async function open(B, who, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.__HUB_TEST_CLIENT__ = B.client(people[who].id); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document;
  for (let i = 0; i < 60 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(120);
  return { d, w: dom.window, text: () => d.getElementById('main').textContent, msg: (id) => d.getElementById(id)?.textContent || '',
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await sleep(60); },
    set: (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); },
    click: async (sel) => { const e = d.querySelector(sel); assert.ok(e, `no ${sel}`); e.click(); await sleep(150); } };
}

test('weekly summary: the Head Coach drafts with AI, an unchecked number is marked and left out, leadership sees the published text', async () => {
  const B = world(); report(B, 'R1', 'MLBB', 1, 'late vision', { result: { mode: 'wl', won: 2, lost: 1, drawn: 0 } });
  B.answers.summary = { headline: 'Latihan berjalan; MLBB rekor 2-1.', titles: [{ title: 'MLBB', line: 'Rekor 2-1 minggu ini.' }], attention: ['Naik 40 persen.'], next_week: [] };
  const f = await open(B, 'fayad', 'overview');
  await f.click('[data-co-brief]');
  assert.equal(B.calls[0].action, 'summary'); assert.ok(B.calls[0].material.titles.some((x) => x.title === 'MLBB' && x.record_7d === '2-1'));
  assert.match(f.text(), /1 line\(s\) with an unchecked number/); assert.match(f.text(), /number not in the figures: 40/);
  await f.click('[data-co-brief-publish]');
  const [b] = B.tables.leadership_briefs; assert.equal(b.data.status, 'published'); assert.equal(b.data.attention.length, 0); assert.equal(b.title, null);
  const k = await open(B, 'ketua', 'overview');
  assert.match(k.text(), /Latihan berjalan; MLBB rekor 2-1/); assert.equal(k.d.querySelector('[data-co-brief]'), null, 'leadership cannot draft');
  const i = await open(B, 'indra', 'overview'); assert.equal(i.d.querySelector('[data-co-brief]'), null, 'a title coach cannot draft');
});

test('preparation pack: drafted with AI from the opponent material, approved by another coach, sessions go into the plan', async () => {
  const B = world(); report(B, 'RP-1', 'MLBB', 1, 'late vision');
  doc(B, 'wec_matches', 'WM-1', 'MLBB', { date: shiftDay(t0, 6), time: '10:00', opponent: 'Malaysia', stage: 'Group', result: null }, 'u-aufa');
  doc(B, 'sparring_partners', 'P1', 'MLBB', { name: 'Team Q', level: 'Tier 2', resembles: 'Malaysia' }, 'u-aufa');
  B.answers.prep = { summary: 'Butuh vision sebelum lord.', their_tendencies: [], our_focus: [{ focus: 'Vision before lord', drill: 'Ward 30 s before', measure: 'Lord fights with vision', sources: ['RP-1'] }],
    scrims: [{ day: 2, partner: 'Team Q', focus: 'Vision before lord' }], watch_out: ['Lord cepat.'] };
  const a = await open(B, 'aufa', 'tour-prep');
  assert.match(a.text(), /MLBB vs Malaysia/);
  await a.click('[data-co-prep="WM-1"]');
  assert.ok(B.calls[0].material.PARTNERS.some((p) => p.name === 'Team Q')); assert.equal(B.calls[0].material.MATCH.days_left, 6);
  const [p] = B.tables.prep_packs; assert.equal(p.data.status, 'draft'); assert.equal(p.data.scrims.length, 1);
  await sleep(400);   // let the live refresh after the save redraw first
  await a.click('[data-co-prep-approve="WM-1"]'); assert.match(a.msg('ppMsg-WM-1'), /writer of this version/);
  assert.equal(B.tables.prep_packs[0].data.status, 'draft');
  const f = await open(B, 'fayad', 'tour-prep'); await f.click('[data-co-prep-approve="WM-1"]');
  assert.equal(B.tables.prep_packs[0].data.status, 'approved'); assert.equal(B.tables.prep_packs[0].data.approvedBy, 'Fayad');
  await sleep(200); await f.click('[data-co-prep-plan="WM-1"]');
  const s = B.tables.scrim_sessions.find((x) => x.data.prepPack === 'PP-WM-1');
  assert.ok(s, 'planned session'); assert.equal(s.data.date, shiftDay(t0, 2)); assert.equal(s.data.partner, 'Team Q'); assert.equal(s.data.mirrors, 'Malaysia'); assert.equal(s.data.focus, 'Vision before lord');
});

test('weaknesses: AI labels reports, a label seen 3 times is flagged and becomes a proposal; coaches correct labels by tapping', async () => {
  const B = world(); for (let i = 0; i < 3; i++) report(B, `R${i}`, 'MLBB', i + 1, 'late vision before lord');
  B.answers.tags = (body) => ({ reports: body.reports.map((r) => ({ id: r.id, tags: ['vision', 'objective timing'] })) });
  const i = await open(B, 'indra', 'mlbb-weak');
  assert.match(i.text(), /3 report\(s\) with something failing are not labelled yet/);
  await i.click('[data-co-tag="MLBB"]');
  assert.equal(B.tables.weakness_tags.length, 3); assert.match(i.text(), /vision\s*keeps coming back/);
  await i.click('[data-co-weak-propose="MLBB|vision"]');
  const o = B.tables.coaching_objectives.find((x) => x.data.rec?.problem === 'Recurring weakness: vision'); assert.ok(o, 'proposal created'); assert.equal(o.data.status, 'proposed');
  await i.click('[data-co-wt="R0|objective timing"]');
  const t = B.tables.weakness_tags.find((x) => x.data.reportId === 'R0'); assert.deepEqual([...t.data.tags], ['vision']); assert.equal(t.data.source, 'coach');
});

test('PUBG Mobile: a result screenshot becomes match-log rows after the coach checks it', async () => {
  const B = world();
  B.answers.br_result = { screen_kind: 'team_result', readable: true, map: 'Miramar', placement: 2, team_kills: 7, players: [{ name_seen: 'AKxVinz', kills: 4, damage: 600, survived_seconds: 1650, uncertain: false }], lobby: [{ rank: 1, team_name: 'RRQ', kills: 10, points: 25 }], notes: '' };
  const a = await open(B, 'aufa', 'pubgm-log');
  const input = a.d.querySelector('[data-co-br-file]'); assert.ok(input, 'upload button');
  Object.defineProperty(input, 'files', { value: [new a.w.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])], 's.png', { type: 'image/png' })] });
  input.dispatchEvent(new a.w.Event('change', { bubbles: true })); await sleep(250);
  assert.equal(B.calls[0].action, 'br_result'); assert.equal(a.d.getElementById('brPlace').value, '2'); assert.equal(a.d.getElementById('brMap').value, 'Miramar');
  a.set('brKills', '8');   // the coach corrects a value
  await a.click('[data-co-br-save]');
  const [log] = B.tables.pubgm_logs; assert.equal(log.data.kind, 'matches');
  assert.deepEqual(log.data.rows.map((r) => [r.team, r.placement, r.elims, r.map]), [['INA', 2, 8, 'Miramar'], ['RRQ', 1, 10, 'Miramar']]);
});
