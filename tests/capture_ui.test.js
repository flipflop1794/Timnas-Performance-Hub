// V1.13 screens end to end in a headless DOM, with a fake AI service fed with REAL MLBB result screens
// (tests/fixtures/mlbb_real_screens.json): screenshot → check (hero picks) → confirm; second screenshot;
// draft; duplicates; debrief; report save with games; fixing a saved game; Patterns; findings; trails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
const REAL = JSON.parse(readFileSync(new URL('./fixtures/mlbb_real_screens.json', import.meta.url), 'utf8'));
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));
// The fake AI returns a real screen; heroes "sure" only where the reading was sure.
const screen = (i, { allSure = false, killsMisread = null } = {}) => {
  const r = clone(REAL[i].raw);
  if (allSure) r.players.forEach((p) => { p.hero = REAL[i].truthHeroes[p.side][p.slot - 1]; p.hero_sure = true; p.hero_candidates = []; });
  if (killsMisread != null) r.players[0].kills = killsMisread;
  return r;
};
const dataTab = (i) => { const r = clone(REAL[i].raw); r.screen_kind = 'stats_detail'; r.players.forEach((p) => { p.kills = -1; p.deaths = -1; p.assists = -1; p.gold = -1; p.rating = -1; p.hero_damage = 50000 + p.slot; p.damage_taken = 30000; p.tower_damage = 1000; }); return r; };

async function hub(aiImpl) {
  const calls = [];
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-reports', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en');
    w.claude = { use: async () => null };
    if (aiImpl) w.__HUB_PLATFORM__ = { ai: { call: async (b) => { calls.push(b); return aiImpl(b); } } };
    w.console.error = (...a) => { throw new Error(a.join(' ')); };
  } });
  await wait();
  const d = dom.window.document;
  const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  const click = async (sel) => { const el = d.querySelector(sel); assert.ok(el, `missing ${sel}`); el.click(); await wait(); };
  const set = (id, v) => { const e = d.getElementById(id); assert.ok(e, `missing #${id}`); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const upload = async (sel) => {
    const input = d.querySelector(sel); assert.ok(input, `missing ${sel}`);
    const file = new dom.window.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], 'shot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(80);
  };
  const pickAllHeroes = (i) => { for (let r = 0; r < 10; r++) { const el = d.getElementById(`cg-MLBB-${r}-hero`); if (!el.value) set(`cg-MLBB-${r}-hero`, REAL[i].truthHeroes[r < 5 ? 'left' : 'right'][r % 5]); } };
  const fillReport = (partner) => { set('rp-MLBB-partner', partner); set('rp-MLBB-focus', 'Lord setups'); set('rp-MLBB-worked', 'early game'); set('rp-MLBB-adjust', 'vision before lord'); set('rp-MLBB-progress', '3'); };
  return { dom, d, go, click, set, upload, calls, pickAllHeroes, fillReport, text: () => d.getElementById('main').textContent };
}

test('without the website AI, games are typed by hand and still feed the report result', async () => {
  const h = await hub(null);
  assert.match(h.text(), /AI screenshot reading works on the website/); assert.equal(h.d.querySelector('[data-cap-shot]'), null);
  await h.click('[data-cap-manual="MLBB"]');
  assert.equal(h.d.getElementById('cg-MLBB-0-player').value, 'Aran', 'roster pre-filled on our side');
  assert.equal(h.d.getElementById('cg-MLBB-our').value, 'left');
  h.set('cg-MLBB-result', 'win'); h.set('cg-MLBB-dur', '14:05'); h.set('cg-MLBB-map', 'blue');
  h.pickAllHeroes(0);
  for (let i = 0; i < 5; i++) for (const k of ['kills', 'deaths', 'assists']) h.set(`cg-MLBB-${i}-${k}`, '1');
  await h.click('[data-cap-confirm="MLBB"]');
  assert.match(h.d.getElementById('capMsg-MLBB').textContent, /Game 1 confirmed \(win\)/);
  assert.equal(h.d.getElementById('rp-MLBB-won').value, '1'); assert.equal(h.d.getElementById('rp-MLBB-lost').value, '0');
  assert.match(h.text(), /Blue side/); assert.match(h.text(), /typed/);
});

test('real screen → only sure heroes filled → coach taps suggestions → Data tab merged → draft → duplicate warned → report saved with games', async () => {
  let n = 0;
  const h = await hub(async (b) => {
    if (b.action === 'scoreboard') { n++; return { captureId: `cap-${n}`, raw: n === 2 ? dataTab(1) : n === 1 ? screen(1, { killsMisread: 8 }) : screen(1), model: 'm' }; }
    if (b.action === 'draft') return { captureId: 'cap-d', raw: { screen_kind: 'draft', readable: true, first_pick_side: 'left', notes: '', actions: [
      { order: 1, side: 'right', action: 'ban', hero: 'Fanny', hero_sure: true, hero_candidates: [], player_name: '', order_sure: true },
      { order: 2, side: 'left', action: 'ban', hero: 'Ling', hero_sure: true, hero_candidates: [], player_name: '', order_sure: true }] }, model: 'm' };
    if (b.action === 'debrief') return { raw: { focus: 'rotasi early ke turtle', worked: 'Draft bagus, Kevin rotasi cepat', failed: 'Lord fight masih telat', adjust: 'set up vision sebelum lord', player_notes: 'Kevin: rotasi cepat', detail: '', not_placed: '' }, model: 'm' };
    throw new Error('unexpected');
  });
  await h.upload('[data-cap-shot="MLBB"]');
  assert.equal(h.calls[0].action, 'scoreboard'); assert.equal(h.calls[0].image.mediaType, 'image/png');
  assert.match(h.text(), /Left team kills add up to 36, but the score shows 35/, 'a misread K is caught');
  assert.equal(h.d.getElementById('cg-MLBB-our').value, 'left'); assert.equal(h.d.getElementById('cg-MLBB-result').value, 'win');
  assert.match(h.text(), /8 heroes to pick/, 'only the two heroes read as sure are filled');
  assert.equal(h.d.getElementById('cg-MLBB-2-hero').value, 'Lancelot', 'a sure reading is filled even when wrong — the coach must still look');
  // Suggestions under an unsure hero: the AI's best guess first.
  const chip = h.d.querySelector('[data-cap-hero^="MLBB|4|"]'); assert.equal(chip.textContent, 'Wanwan');
  await h.click('[data-cap-hero="MLBB|4|Wanwan"]'); assert.equal(h.d.getElementById('cg-MLBB-4-hero').value, 'Wanwan');
  h.set('cg-MLBB-0-kills', '7');          // the coach fixes the misread value (7 on the screen)
  // Data tab: fills damage, keeps what the coach typed.
  await h.upload('[data-cap-more="MLBB"]');
  assert.match(h.d.getElementById('capMsg-MLBB').textContent, /1 more screen merged/);
  assert.equal(h.d.getElementById('cg-MLBB-0-hero_damage').value, '50001'); assert.equal(h.d.getElementById('cg-MLBB-0-kills').value, '7', 'typed value kept');
  assert.equal(h.d.getElementById('cg-MLBB-4-hero').value, 'Wanwan', 'picked hero kept');
  await h.upload('[data-cap-draft="MLBB"]'); assert.equal(h.d.getElementById('cd-MLBB-0-hero').value, 'Fanny');
  h.set('cg-MLBB-2-hero', 'Alucard'); h.pickAllHeroes(1); h.set('cg-MLBB-map', 'red');
  await h.click('[data-cap-confirm="MLBB"]');
  assert.match(h.text(), /Game 1/); assert.match(h.text(), /Red side/); assert.match(h.text(), /draft 2 actions/);
  // The same screenshot again: warned as a duplicate.
  await h.upload('[data-cap-shot="MLBB"]'); assert.match(h.text(), /looks like a game already added \(.*game 1\)/);
  await h.click('[data-cap-discard="MLBB"]');
  // Debrief dump and save.
  h.set('rp-MLBB-dump', 'Fokus rotasi early ke turtle. Draft bagus, Kevin rotasi cepat. Lord fight masih telat. Next set up vision sebelum lord.');
  await h.click('[data-cap-debrief="MLBB"]');
  assert.equal(h.d.getElementById('rp-MLBB-focus').value, 'rotasi early ke turtle'); assert.equal(h.d.getElementById('rp-MLBB-players').value, 'Kevin: rotasi cepat');
  h.set('rp-MLBB-partner', 'ONIC'); h.set('rp-MLBB-progress', '4');
  await h.click('[data-report-save="MLBB"]');
  assert.match(h.d.getElementById('rpMsg-MLBB').textContent, /Report saved \(1-0 vs ONIC, 1 game with stats\)/);
  // The saved report lists its game with a Fix button; fixing writes a new version and a correction note.
  assert.match(h.text(), /Alucard/);
  await h.click('[data-cap-fix]');
  assert.match(h.text(), /Fixing game 1 of the report vs ONIC/);
  h.set('cg-MLBB-0-deaths', '2');
  await h.click('[data-cap-confirm="MLBB"]');
  assert.match(h.d.getElementById('capMsg-MLBB').textContent, /Game 1 fixed \(Aran deaths 2 → 2|Game 1 fixed/);
  assert.match(h.text(), /Correction .* Game 1 corrected/);
  assert.match(h.text(), /1 game version\(s\) corrected/);
  // Patterns: one game (the fix replaced the old version), map side from the coach.
  await h.go('mlbb-patterns');
  assert.match(h.text(), /Confirmed games1/); assert.match(h.text(), /Played on red side/); assert.match(h.text(), /Fanny/);
  await h.click('[data-pat-player="MLBB|Kevin"]');
  assert.match(h.text(), /Scrim trail — Kevin/); assert.match(h.text(), /Fewer than 5 games/);
});

test('report save is refused while a game is still being checked; a voided game cannot be confirmed', async () => {
  const h = await hub(async () => ({ captureId: 'c', raw: { ...screen(0), outcome: 'invalid' }, model: 'm' }));
  await h.upload('[data-cap-shot="MLBB"]');
  assert.match(h.text(), /voided/); assert.equal(h.d.querySelector('[data-cap-confirm]'), null);
  h.fillReport('ONIC'); h.set('rp-MLBB-won', '1');
  await h.click('[data-report-save="MLBB"]');
  assert.match(h.d.getElementById('rpMsg-MLBB').textContent, /Confirm or discard the game/);
  await h.click('[data-cap-discard="MLBB"]'); assert.doesNotMatch(h.text(), /Our team/);
});

test('findings: checked against the facts, marked by the coach, promoted into a coaching proposal', async () => {
  let digestAnswer; let k = 0;
  const h = await hub(async (b) => (b.action === 'digest' ? { raw: digestAnswer, model: 'claude-sonnet-5-5' } : { captureId: `c${k}`, raw: screen(k++ % REAL.length, { allSure: true }), model: 'm' }));
  for (let r = 0; r < 3; r++) {
    for (let g = 0; g < 2; g++) { await h.upload('[data-cap-shot="MLBB"]'); h.set('cg-MLBB-result', r === 2 ? 'loss' : 'win'); await h.click('[data-cap-confirm="MLBB"]'); }
    h.fillReport(`Team ${r}`); await h.click('[data-report-save="MLBB"]');
  }
  await h.go('mlbb-patterns');
  assert.match(h.text(), /Confirmed games6/);
  digestAnswer = { findings: [
    { fact_ids: ['all'], kind: 'strength', claim: 'Won 4 of 6 games (67%).', why_it_matters: 'Keep the early rotation.' },
    { fact_ids: ['all'], kind: 'problem', claim: 'Won 90% of games.', why_it_matters: 'x' },
  ] };
  await h.click('[data-pat-run="MLBB"]');
  const sent = h.calls.at(-1); assert.equal(sent.action, 'digest'); assert.ok(sent.facts.some((f) => f.id === 'all')); assert.ok(!sent.facts.some((f) => 'games' in f));
  assert.match(h.d.getElementById('patRunMsg-MLBB').textContent, /1 finding\(s\) added, 1 dropped/);
  assert.match(h.text(), /Won 4 of 6 games \(67%\)/); assert.match(h.text(), /numbers not in the cited facts \(90\)/);
  await h.click('[data-pat-mark$="|useful"]'); assert.match(h.text(), /Marked useful by/);
  const id = h.d.querySelector('[data-pat-promote]').dataset.patPromote;
  h.set(`patS-${id}`, 'Win 3 of the next 5 games');
  await h.click(`[data-pat-promote="${id}"]`);
  await h.go('staff-cycle'); assert.match(h.text(), /Won 4 of 6 games \(67%\)/, 'proposal in the coaching cycle');
});

test('V1.17: result screen and draft picked together → the draft is recognised, read as a draft and fills heroes', async () => {
  let n = 0;
  const truth = REAL[1].truthHeroes.left;
  const h = await hub(async (b) => {
    if (b.action === 'scoreboard') { n++; return n === 1 ? { captureId: 'cap-1', raw: screen(1), model: 'm' } : { captureId: `cap-x${n}`, raw: { screen_kind: 'draft_or_loading', readable: false, outcome: 'not_shown', duration_seconds: -1, score: { left: -1, right: -1 }, team_names: { left: '', right: '' }, players: [], notes: '' }, model: 'm' }; }
    if (b.action === 'draft') return { captureId: 'cap-d', raw: { screen_kind: 'draft', readable: true, first_pick_side: 'left', notes: '', actions: truth.map((hero, i) => ({ order: 11 + i, side: 'left', action: 'pick', hero, hero_sure: true, hero_candidates: [], player_name: '', order_sure: false })) }, model: 'm' };
    throw new Error('unexpected');
  });
  const input = h.d.querySelector('[data-cap-shot="MLBB"]'); assert.ok(input.multiple, 'several files can be picked');
  const f = () => new h.dom.window.File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])], 's.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [f(), f()] });
  input.dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); await wait(250);
  // Two files are read one after the other; slower machines need more than 250 ms (wait up to 3 s).
  for (let i = 0; i < 55 && h.calls.length < 3; i++) await wait(50);
  await wait(50);
  assert.deepEqual(h.calls.map((c) => c.action), ['scoreboard', 'scoreboard', 'draft']);
  assert.match(h.d.getElementById('capMsg-MLBB').textContent, /draft read: heroes filled/);
  assert.match(h.text(), /Draft/, 'the draft table is shown on the check screen');
  const sugg = h.d.getElementById('main').textContent;
  for (const hero of truth) assert.ok(sugg.includes(hero), `${hero} offered from the draft`);
});

test('V1.17: microphone buttons fill the Say it once note (browser speech recognition)', async () => {
  let inst = null;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-reports', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en');
    w.claude = { use: async () => null };
    w.__HUB_PLATFORM__ = { ai: { call: async () => ({ raw: {}, model: 'm' }) } };
    w.webkitSpeechRecognition = class { constructor() { inst = this; this.started = false; } start() { this.started = true; } stop() { this.started = false; this.onend?.(); } };
    w.console.error = (...a) => { throw new Error(a.join(' ')); };
  } });
  await wait();
  const d = dom.window.document;
  const btn = d.querySelector('[data-cap-mic="MLBB|id-ID"]'); assert.ok(btn, 'mic button shown when the browser supports speech');
  btn.click(); await wait();
  assert.ok(inst?.started); assert.equal(inst.lang, 'id-ID');
  assert.equal(d.querySelector('[data-cap-mic="MLBB|id-ID"]').textContent, '■ Stop');
  inst.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'fokus rotasi early' }], { isFinal: true })] });
  inst.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'lord fight telat' }], { isFinal: true })] });
  assert.equal(d.getElementById('rp-MLBB-dump').value, 'fokus rotasi early. lord fight telat.');
  d.querySelector('[data-cap-mic="MLBB|id-ID"]').click(); await wait();
  assert.equal(inst.started, false); assert.match(d.querySelector('[data-cap-mic="MLBB|id-ID"]').textContent, /Bicara/);
});
