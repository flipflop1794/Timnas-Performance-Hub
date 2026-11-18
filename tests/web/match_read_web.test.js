// V1.30 on the website with a fake AI: an eFootball match stats screenshot and a CS2 scoreboard fill the scrim
// report's result after the coach checks them, and the games are saved with the report.
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
const coach = { id: 'u-rio', email: 'rio@example.test', password: 'pw', name: 'Coach Rio', roles: ['title_coach'], titles: ['eFootball', 'CS2'] };
function world() {
  const B = backend(); B.addUser(coach);
  B.aiActions = ['scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm', 'match_result'];
  B.calls = []; B.answers = {};
  B.ai = async (body) => { B.calls.push(body); const a = B.answers[body.title]; return a ? { data: { raw: a, model: 'm', captureId: `cap-${B.calls.length}` } } : { status: 400, error: 'no fake answer' }; };
  return B;
}
async function open(B, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(coach.id); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document; const w = dom.window;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  const upload = async (title) => {
    let input; for (let i = 0; i < 60 && !(input = d.querySelector(`[data-mr-file="${title}"]`)); i++) await sleep(50);
    assert.ok(input, `upload button for ${title}`);
    Object.defineProperty(input, 'files', { value: [new w.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])], 's.png', { type: 'image/png' })] });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    for (let i = 0; i < 60 && !d.querySelector('[data-mr-ok]'); i++) await sleep(50);
  };
  const set = (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
  return { d, w, upload, set, text: () => d.getElementById('main').textContent };
}
const stats = (o) => Object.fromEntries(['possession', 'shots', 'shots_on_target', 'passes', 'successful_passes', 'tackles', 'interceptions', 'fouls', 'offsides', 'corners', 'free_kicks', 'saves']
  .map((k) => [k, o[k] ? { home: o[k][0], away: o[k][1] } : { home: -1, away: -1 }]));

test('eFootball: a match stats screenshot fills the result after the coach checks it; the match is saved with the report', async () => {
  const B = world();
  B.answers.eFootball = { screen_kind: 'match_stats', readable: true, home_name: 'Rival FC', away_name: 'INA Timnas', home_goals: 1, away_goals: 3, penalties: { home: -1, away: -1 },
    stats: stats({ possession: [42, 58], shots_on_target: [2, 7] }), notes: '' };
  const p = await open(B, 't-efootball-reports');
  await p.upload('eFootball');
  assert.equal(B.calls[0].action, 'match_result'); assert.equal(B.calls[0].title, 'eFootball');
  assert.equal(p.d.getElementById('mrSide-eFootball').value, 'away', 'our side found from the name');
  assert.equal(p.d.getElementById('mrO-eFootball').value, '3'); assert.equal(p.d.getElementById('mrT-eFootball').value, '1');
  assert.match(p.text(), /Possession %\s*42\s*58/);
  p.d.querySelector('[data-mr-ok="eFootball"]').click(); await sleep(100);
  assert.equal(p.d.getElementById('rp-eFootball-won').value, '1'); assert.equal(p.d.getElementById('rp-eFootball-lost').value, '0');
  assert.match(p.text(), /Match 1:\s*win · 3-1 · possession 58% · on target 7-2/);
  for (const [k, v] of Object.entries({ partner: 'Rival FC', focus: 'Pressing high', worked: 'Wing play', adjust: 'Shoot earlier' })) p.set(`rp-eFootball-${k}`, v);
  p.d.querySelector('[data-rp-prog="eFootball"][data-v="4"]').click(); await sleep(30);
  p.d.querySelector('[data-report-save="eFootball"]').click();
  for (let i = 0; i < 60 && !B.tables.scrim_games.length; i++) await sleep(50);
  const rep = B.tables.scrim_reports[0].data; assert.deepEqual([rep.result.won, rep.result.lost], [1, 0]);
  const g = B.tables.scrim_games[0].data; assert.equal(g.game, 'efootball'); assert.equal(g.reportId, rep.id); assert.deepEqual(g.stats.possession, { ours: 58, theirs: 42 }); assert.deepEqual(g.captureIds, ['cap-1']);
});

test('CS2: a scoreboard matches our players from the roster; a wrong score is refused; the map fills the result', async () => {
  const B = world();
  B.tables.roster_players.push({ title: 'CS2', ign: 'Ricky', sort_order: 1 }, { title: 'CS2', ign: 'Fatur', sort_order: 2 });
  const pl = (team, name, k) => ({ team, name_seen: name, kills: k, deaths: 10, assists: 3, adr: 80, hs_pct: 45, mvps: 1, score: 40, uncertain: false });
  B.answers.CS2 = { screen_kind: 'scoreboard', readable: true, map: 'Inferno', team_a_name: 'INA', team_b_name: 'Rivals', rounds_a: 13, rounds_b: 7, players: [pl('a', 'Ricky', 21), pl('a', 'Fatur', 17), pl('b', 'zeus', 9)], notes: '' };
  const p = await open(B, 't-cs2-reports');
  await p.upload('CS2');
  assert.equal(p.d.getElementById('mrMap-CS2').value, 'Inferno'); assert.equal(p.d.getElementById('mrSide-CS2').value, 'a', 'our team found from the roster');
  p.set('mrO-CS2', '99'); p.d.querySelector('[data-mr-ok="CS2"]').click(); await sleep(60);
  assert.match(p.d.getElementById('mrMsg-CS2').textContent, /Rounds \(us\) must be a whole number from 0 to 40/);
  p.set('mrO-CS2', '13'); p.d.querySelector('[data-mr-ok="CS2"]').click(); await sleep(100);
  assert.equal(p.d.getElementById('rp-CS2-won').value, '1');
  assert.match(p.text(), /Map 1:\s*win · Inferno 13-7/);
});

test('V1.31 rows: CS2 maps from the Active Duty pool fill the result; PUBG Mobile placement and eliminations give WEC points; CS2 map pool on Trends', async () => {
  const B = world(); B.answers = {};
  const p = await open(B, 't-cs2-reports');
  for (let i = 0; i < 60 && !p.d.getElementById('rpr-CS2-0-map'); i++) await sleep(50);
  assert.deepEqual([...p.d.getElementById('rpr-CS2-0-map').options].map((o) => o.value).filter(Boolean), ['Ancient', 'Anubis', 'Cache', 'Dust II', 'Inferno', 'Mirage', 'Nuke']);
  p.set('rpr-CS2-0-map', 'Mirage'); p.set('rpr-CS2-0-us', '13'); p.set('rpr-CS2-0-them', '9');
  p.d.querySelector('[data-rr-add="CS2"]').click(); await sleep(80);
  p.set('rpr-CS2-1-map', 'Inferno'); p.set('rpr-CS2-1-us', '11'); p.set('rpr-CS2-1-them', '13');
  assert.equal(p.d.getElementById('rp-CS2-won').value, '1'); assert.equal(p.d.getElementById('rp-CS2-lost').value, '1');
  assert.match(p.d.getElementById('rpr-CS2-sum').textContent, /2 maps: 1 won, 1 lost/);
  for (const [k, v] of Object.entries({ partner: 'Team Z', focus: 'Retakes', worked: 'B retakes', adjust: 'Faster rotate' })) p.set(`rp-CS2-${k}`, v);
  p.d.querySelector('[data-rp-prog="CS2"][data-v="3"]').click(); await sleep(30);
  p.d.querySelector('[data-report-save="CS2"]').click();
  for (let i = 0; i < 60 && !B.tables.scrim_reports.length; i++) await sleep(50);
  const rep = B.tables.scrim_reports[0].data; assert.deepEqual(rep.rows.map((r) => r.map), ['Mirage', 'Inferno']); assert.deepEqual([rep.result.won, rep.result.lost], [1, 1]);
  p.w.location.hash = 't-cs2-trends'; p.w.dispatchEvent(new p.w.HashChangeEvent('hashchange')); await sleep(150);
  for (let i = 0; i < 60 && !/Mirage\s*1\s*1-0/.test(p.text()); i++) { await sleep(100); p.w.dispatchEvent(new p.w.HashChangeEvent('hashchange')); }
  assert.match(p.text(), /Map pool/); assert.match(p.text(), /Mirage\s*1\s*1-0\s*13-9/); assert.match(p.text(), /Not practised in the last 14 days:\s*Ancient, Anubis, Cache, Dust II, Nuke/);
});

test('V1.31 rows: PUBG Mobile placement and eliminations give WEC points', async () => {
  const B = world(); B.addUser({ id: 'u-ari', email: 'ari@example.test', password: 'pw', name: 'Coach Ari', roles: ['title_coach'], titles: ['PUBG Mobile'] });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://hub.example.test/#pubgm-reports',
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client('u-ari'); } });
  const d = dom.window.document; const set = (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  for (let i = 0; i < 120 && !d.getElementById('rpr-PUBG_Mobile-0-place'); i++) await sleep(25);
  set('rpr-PUBG_Mobile-0-place', '1'); set('rpr-PUBG_Mobile-0-kills', '8');
  assert.equal(d.getElementById('rpr-PUBG_Mobile-0-pts').textContent, '= 18 pts');
  d.querySelector('[data-rr-add="PUBG_Mobile"]').click(); await sleep(80);
  set('rpr-PUBG_Mobile-1-place', '5'); set('rpr-PUBG_Mobile-1-kills', '3');
  assert.equal(d.getElementById('rp-PUBG_Mobile-played').value, '2'); assert.equal(d.getElementById('rp-PUBG_Mobile-points').value, '24');
  assert.match(d.getElementById('rpr-PUBG_Mobile-sum').textContent, /2 matches: 24 pts \(placement 13 \+ eliminations 11\) · average place 3 · 1 chicken dinner$/);
  set('rpr-PUBG_Mobile-1-place', '17');
  assert.match(d.getElementById('rpr-PUBG_Mobile-sum').textContent, /Match 2: placement must be a whole number from 1 to 16/);
});
