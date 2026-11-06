// V1.13 screens end to end in a headless DOM, with a fake AI service: screenshot → check → confirm,
// draft screenshot, debrief dump, report save with games, Patterns tab, findings, promotion, trails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const p = (side, slot, name, hero, k, d, a) => ({ side, slot, name_seen: name, hero, kills: k, deaths: d, assists: a, gold: 9000, hero_damage: 60000, tower_damage: 3000, damage_taken: 40000, last_hits: -1, denies: -1, gpm: -1, xpm: -1, rating: 8, mvp: false, uncertain_fields: [] });
const board = (kMisread = 3) => ({ screen_kind: 'scoreboard', readable: true, winner_side: 'blue', duration_seconds: 1122, score: { blue: 18, red: 9 }, notes: '',
  players: [p('blue', 1, 'TLID Aran', 'Fredrinn', kMisread, 1, 9), p('blue', 2, 'TLID Kevin', 'Valentina', 6, 2, 8), p('blue', 3, 'TLID Drichel', 'Granger', 7, 1, 5), p('blue', 4, 'TLID Lyoni', 'Lapu-Lapu', 2, 3, 6), p('blue', 5, 'TLID Jull.', 'Chip', 0, 2, 12),
    p('red', 1, 'ONIC Kiboy', 'Hilda', 2, 4, 3), p('red', 2, 'ONIC Sanz', 'Pharsa', 3, 4, 2), p('red', 3, 'ONIC CW', 'Beatrix', 2, 3, 3), p('red', 4, 'ONIC Lutpi', 'Lukas', 1, 4, 2), p('red', 5, 'ONIC Kairi', 'Joy', 1, 3, 4)] });
const draft = { screen_kind: 'draft', readable: true, first_pick_side: 'blue', notes: '', actions: [
  { order: 1, side: 'red', action: 'ban', hero: 'Fanny', player_name: '', uncertain: false }, { order: 2, side: 'blue', action: 'ban', hero: 'Ling', player_name: '', uncertain: false },
  ...['Fredrinn', 'Valentina', 'Granger', 'Lapu-Lapu', 'Chip'].map((h, i) => ({ order: 3 + i, side: 'blue', action: 'pick', hero: h, player_name: '', uncertain: false })),
  ...['Hilda', 'Pharsa', 'Beatrix', 'Lukas', 'Joy'].map((h, i) => ({ order: 8 + i, side: 'red', action: 'pick', hero: h, player_name: '', uncertain: false }))] };

async function hub(aiImpl) {
  const calls = [];
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-reports', beforeParse(w) {
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
  return { dom, d, go, click, set, upload, calls, text: () => d.getElementById('main').textContent };
}

test('without the website AI, games are typed by hand and still feed the report result', async () => {
  const h = await hub(null);
  assert.match(h.text(), /AI screenshot reading works on the website/); assert.equal(h.d.querySelector('[data-cap-shot]'), null);
  await h.click('[data-cap-manual="MLBB"]');
  assert.equal(h.d.getElementById('cg-MLBB-0-player').value, 'Aran', 'roster pre-filled on our side');
  h.set('cg-MLBB-result', 'win'); h.set('cg-MLBB-dur', '14:05');
  for (let i = 0; i < 10; i++) { h.set(`cg-MLBB-${i}-hero`, ['Fredrinn', 'Valentina', 'Granger', 'Lapu-Lapu', 'Chip', 'Hilda', 'Pharsa', 'Beatrix', 'Lukas', 'Joy'][i]); if (i < 5) for (const k of ['kills', 'deaths', 'assists']) h.set(`cg-MLBB-${i}-${k}`, '1'); }
  await h.click('[data-cap-confirm="MLBB"]');
  assert.match(h.d.getElementById('capMsg-MLBB').textContent, /Game 1 confirmed \(win\)/);
  assert.equal(h.d.getElementById('rp-MLBB-won').value, '1'); assert.equal(h.d.getElementById('rp-MLBB-lost').value, '0');
  assert.match(h.text(), /typed/);
});

test('screenshot → flagged check → confirm; draft screenshot; debrief fills the fields; report saved with its games', async () => {
  let shots = 0;
  const h = await hub(async (b) => {
    if (b.action === 'scoreboard') return { captureId: `cap-${Math.random()}`, raw: board(shots++ ? 3 : 8), model: 'm' };
    if (b.action === 'draft') return { captureId: 'cap-d', raw: draft, model: 'm' };
    if (b.action === 'debrief') return { raw: { focus: 'rotasi early ke turtle', worked: 'Draft bagus, Kevin rotasi cepat', failed: 'Lord fight masih telat', adjust: 'set up vision sebelum lord', player_notes: 'Kevin: rotasi cepat', detail: '', not_placed: '' }, model: 'm' };
    throw new Error('unexpected');
  });
  await h.upload('[data-cap-shot="MLBB"]');
  assert.equal(h.calls[0].action, 'scoreboard'); assert.equal(h.calls[0].image.mediaType, 'image/png'); assert.ok(h.calls[0].image.data.length > 4);
  assert.match(h.text(), /Blue kills add up to 23, but the score shows 18/, 'the misread K is caught');
  assert.equal(h.d.getElementById('cg-MLBB-our').value, 'blue'); assert.equal(h.d.getElementById('cg-MLBB-result').value, 'win');
  assert.equal(h.d.getElementById('cg-MLBB-3-hero').value, 'Lapu-Lapu'); assert.equal(h.d.getElementById('cg-MLBB-1-player').value, 'Kevin');
  await h.upload('[data-cap-draft="MLBB"]');
  assert.equal(h.d.getElementById('cd-MLBB-first').value, 'blue'); assert.equal(h.d.getElementById('cd-MLBB-0-hero').value, 'Fanny');
  h.set('cg-MLBB-0-kills', '3');   // the coach fixes the misread value
  await h.click('[data-cap-confirm="MLBB"]');
  assert.match(h.text(), /Game 1/); assert.match(h.text(), /from screenshot, 1 value corrected/); assert.match(h.text(), /draft 12 actions/);
  // second game straight from a clean screenshot
  await h.upload('[data-cap-shot="MLBB"]'); assert.match(h.text(), /Read cleanly/);
  await h.click('[data-cap-confirm="MLBB"]');
  assert.equal(h.d.getElementById('rp-MLBB-won').value, '2');
  // debrief dump
  h.set('rp-MLBB-dump', 'Fokus rotasi early ke turtle. Draft bagus, Kevin rotasi cepat. Lord fight masih telat. Next set up vision sebelum lord.');
  await h.click('[data-cap-debrief="MLBB"]');
  assert.equal(h.d.getElementById('rp-MLBB-focus').value, 'rotasi early ke turtle'); assert.equal(h.d.getElementById('rp-MLBB-adjust').value, 'set up vision sebelum lord');
  assert.equal(h.d.getElementById('rp-MLBB-players').value, 'Kevin: rotasi cepat');
  // save the report
  h.set('rp-MLBB-partner', 'ONIC'); h.set('rp-MLBB-progress', '4');
  await h.click('[data-report-save="MLBB"]');
  assert.match(h.d.getElementById('rpMsg-MLBB').textContent, /Report saved \(2-0 vs ONIC, 2 games with stats\)/);
  assert.doesNotMatch(h.text(), /Game 1 ·/, 'capture state cleared after saving');
  // Patterns tab: facts from the two games
  await h.go('mlbb-patterns');
  assert.match(h.text(), /Patterns — MLBB/); assert.match(h.text(), /Confirmed games2/); assert.match(h.text(), /From screenshots2/);
  assert.match(h.text(), /Only 2 game\(s\): every split below is an early sign/); assert.match(h.text(), /Fanny/);
  // Player trail on the plan page
  await h.click('[data-pat-player="MLBB|Kevin"]');
  assert.match(h.text(), /Scrim trail — Kevin/); assert.match(h.text(), /Fewer than 5 games/);
});

test('report save is refused while a game is still being checked', async () => {
  const h = await hub(async () => ({ captureId: 'c', raw: board(), model: 'm' }));
  await h.upload('[data-cap-shot="MLBB"]');
  h.set('rp-MLBB-partner', 'ONIC'); h.set('rp-MLBB-focus', 'f'); h.set('rp-MLBB-worked', 'w'); h.set('rp-MLBB-adjust', 'a'); h.set('rp-MLBB-progress', '3'); h.set('rp-MLBB-won', '1');
  await h.click('[data-report-save="MLBB"]');
  assert.match(h.d.getElementById('rpMsg-MLBB').textContent, /Confirm or discard the game/);
  await h.click('[data-cap-discard="MLBB"]'); assert.doesNotMatch(h.text(), /Our side/);
});

test('findings: checked against the facts, marked by the coach, promoted into a coaching proposal', async () => {
  let digestAnswer;
  const h = await hub(async (b) => (b.action === 'digest' ? { raw: digestAnswer, model: 'claude-sonnet-5-5' } : { captureId: `c${Math.random()}`, raw: board(), model: 'm' }));
  // six confirmed games over three reports
  for (let r = 0; r < 3; r++) {
    for (let g = 0; g < 2; g++) { await h.upload('[data-cap-shot="MLBB"]'); if (r === 2) h.set('cg-MLBB-result', 'loss'); await h.click('[data-cap-confirm="MLBB"]'); }
    h.set('rp-MLBB-partner', `Team ${r}`); h.set('rp-MLBB-focus', 'f'); h.set('rp-MLBB-worked', 'w'); h.set('rp-MLBB-adjust', 'a'); h.set('rp-MLBB-progress', '3');
    await h.click('[data-report-save="MLBB"]');
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
