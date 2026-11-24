// V1.52 on the website build, with a fake AI: paste a WhatsApp recap → the report form is filled (rows and
// text), save → one "after" call gives the labels and the note, Use → "Before today's session" shows the focus.
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
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coach = { id: 'u-elga', email: 'elga@example.test', password: 'pw', name: 'Coach Elga', roles: ['title_coach'], titles: ['eFootball'] };
const at = new Date(Date.now() - 86400000).toISOString(); const t0 = localDay();
const ALL = ['scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'match_result', 'recap', 'after'];
function world(actions = ALL) {
  const B = backend(); B.addUser(coach); B.aiActions = actions;
  B.calls = []; B.answers = {};
  B.ai = async (body) => { B.calls.push(body); const a = B.answers[body.action]; return a ? { data: { raw: typeof a === 'function' ? a(body) : a, model: 'm' } } : { status: 400, error: 'no fake answer' }; };
  B.tables.scrim_reports.push({ id: 'R0', title: 'eFootball', data: { id: 'R0', title: 'eFootball', origin: 'operational', date: shiftDay(t0, -1), by: 'Coach Elga', partner: 'Team Q', result: { mode: 'wl', won: 1, lost: 1, drawn: 0 },
    focus: '', progress: null, worked: '', failed: 'kebobolan dari set piece', adjust: 'latihan bertahan corner', notes: [], roster: 'Not applicable', createdAt: at }, created_by: coach.id, created_at: at, updated_by: coach.id, updated_at: at });
  return B;
}
async function open(B, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(coach.id); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document;
  for (let i = 0; i < 60 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  for (let i = 0; i < 80 && !d.querySelector('[data-report-save]'); i++) await sleep(50);
  await sleep(150);
  return { d, w: dom.window, text: () => d.getElementById('main').textContent, val: (id) => d.getElementById(id)?.value,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await sleep(100); },
    set: (id, v) => { const e = d.getElementById(id); assert.ok(e, `no #${id}`); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); },
    click: async (sel) => { let e = d.querySelector(sel); for (let i = 0; !e && i < 60; i++) { await sleep(50); e = d.querySelector(sel); } assert.ok(e, `no ${sel}`); e.click(); await sleep(250); } };
}
const RECAP = 'Sparring vs Team Zeta: 2-1, 0-1. Formasi 4-2-3-1. Kebobolan dari set piece lagi. Next: latihan bertahan corner.';

test('paste a recap → rows and text filled; save → one call for labels and note; Use → the focus carries to the next session', async () => {
  const B = world();
  B.answers.recap = { date: '', partner: 'Team Zeta', rows: [{ us: 2, them: 1, extra: '', pen_us: -1, pen_them: -1 }, { us: 0, them: 1, extra: '', pen_us: -1, pen_them: -1 }, { us: 5, them: 5, extra: '', pen_us: -1, pen_them: -1 }],
    focus: '', worked: '', failed: 'Kebobolan dari set piece lagi.', adjust: 'latihan bertahan corner.', player_notes: '', detail: 'Formasi 4-2-3-1.', not_placed: '' };
  B.answers.after = { tags: [], repeats: 'Kebobolan dari set piece muncul lagi.', focus: 'Jaga tiang dekat saat corner.', question: 'Siapa yang menjaga tiang dekat saat corner?', based_on: ['R0'] };
  const p = await open(B, 't-efootball-reports');
  assert.match(p.text(), /Paste your WhatsApp recap: the AI fills the report/); assert.match(p.text(), /Before today's session — eFootball/);
  assert.ok(p.d.querySelector('details.capdump').compareDocumentPosition(p.d.getElementById('rp-eFootball-partner')) & 4, 'the paste box comes before the partner field');
  p.set('rp-eFootball-dump', RECAP);
  await p.click('[data-cap-debrief]');
  assert.equal(B.calls[0].action, 'recap'); assert.equal(B.calls[0].text, RECAP);
  assert.equal(p.val('rp-eFootball-partner'), 'Team Zeta'); assert.equal(p.val('rp-eFootball-adjust'), 'latihan bertahan corner.'); assert.equal(p.val('rp-eFootball-failed'), 'Kebobolan dari set piece lagi.');
  assert.equal(p.val('rpr-eFootball-0-us'), '2'); assert.equal(p.val('rpr-eFootball-1-them'), '1'); assert.equal(p.d.getElementById('rpr-eFootball-2-us'), null, 'the 5-5 line is not in the recap: left out');
  assert.equal(p.val('rp-eFootball-won'), '1'); assert.equal(p.val('rp-eFootball-lost'), '1');
  assert.match(p.d.getElementById('capDbMsg-eFootball').textContent, /Filled 4 boxes and 2 result lines\./); assert.match(p.text(), /1 result line was left out/);

  await p.click('[data-report-save]');
  for (let i = 0; i < 40 && B.calls.length < 2; i++) await sleep(50);
  for (let i = 0; i < 80 && !/For the next session/.test(p.text()); i++) await sleep(50);   // the saved report arrives through the live feed
  assert.equal(B.tables.scrim_reports.length, 2);
  assert.deepEqual(B.calls.map((c) => c.action), ['recap', 'after'], 'one call after saving (no separate labels call)');
  assert.deepEqual(B.calls[1].material.earlier.map((r) => r.id), ['R0']);
  const row = B.tables.weakness_tags[0]; assert.equal(row.data.after.status, 'new'); assert.match(row.data.after.repeats, /set piece/);
  assert.match(p.text(), /For the next session/); assert.match(p.text(), /Siapa yang menjaga tiang dekat/);
  await p.click('[data-co-aft$="|used"]');
  assert.equal(B.tables.weakness_tags[0].data.after.status, 'used'); assert.equal(B.tables.weakness_tags[0].data.after.decidedBy, 'Coach Elga');
  assert.match(p.text(), /next-session focus/); assert.doesNotMatch(p.text(), /Use as next focus/);
  const card = [...p.d.querySelectorAll('.panel')].find((x) => /Before today's session/.test(x.textContent)).textContent;
  assert.match(card, /Focus:\s*Jaga tiang dekat saat corner\./); assert.match(card, /Ask the players:/);
  // My day shows the same card for a coach with one title.
  await p.go('today'); assert.match(p.text(), /Before today's session — eFootball/);
});

test('without the new server function the form and the labels work as before', async () => {
  const B = world(ALL.filter((a) => a !== 'recap' && a !== 'after'));
  const p = await open(B, 't-efootball-reports');
  assert.doesNotMatch(p.text(), /Paste your WhatsApp recap/); assert.match(p.text(), /Say it once: one note, AI fills the fields/);
});
