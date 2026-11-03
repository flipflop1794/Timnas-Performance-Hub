import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Renders every hub view in a headless DOM and checks it produced content without errors.
const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
const VIEWS = ['today', 'mlbb', 'dota-team', 'dota-draft', 'dota-post', 'dota-scout', 'dota-review', 'pubgm-team', 'pubgm-log', 'pubgm-sim', 'pubgm-review', 'staff-measure', 'staff-sources'];

test('hub: every view renders without errors', async () => {
  const errors = [];
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#today' });
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  dom.window.console.error = (...a) => errors.push(a.join(' '));
  const main = dom.window.document.getElementById('main');
  for (const v of VIEWS) {
    dom.window.location.hash = v;
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    assert.ok(main.textContent.length > 80, `${v} rendered too little`);
    assert.ok(!/Something failed/.test(main.textContent), `${v}: ${main.textContent.slice(0, 200)}`);
  }
  assert.deepEqual(errors, []);
});

test('hub: draft room locks heroes and compares drafts', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#dota-draft' });
  const d = dom.window.document;
  // Click the first suggestion 8 times (walks bans + picks for both sides).
  for (let i = 0; i < 8; i++) d.querySelector('.sugg button')?.click();
  const filled = [...d.querySelectorAll('.slot .h')].filter((x) => x.textContent !== '—').length;
  assert.ok(filled >= 6, `filled ${filled}`);
  d.getElementById('dSaveA').click();
  d.getElementById('dUndo').click(); d.querySelector('.sugg button')?.click();
  d.getElementById('dSaveB').click();
  assert.match(d.getElementById('main').textContent, /scores higher on these terms/);
});

test('hub: PUBGM CSV validation rejects a broken log and accepts a good one', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#pubgm-log' });
  const d = dom.window.document;
  await new Promise((r) => setTimeout(r, 30)); // let the capability probe finish its first render
  d.getElementById('lMatches').value = 'match_id,map,team,placement,elims\nX,Erangel,INA,1,3\nX,Erangel,B,1,2';
  d.getElementById('lSave').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.match(d.getElementById('lMsg').textContent, /two teams placed 1/);
  d.getElementById('lMatches').value = 'match_id,date,session,map,team,placement,elims,survival_s,died_phase,drop_spot\nX,2026-11-10,D1,Erangel,INA,1,3,1800,0,School\nX,2026-11-10,D1,Erangel,B,2,2,1700,6,Pochinki';
  d.getElementById('lSave').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.match(d.getElementById('main').textContent, /Logged so far2 match rows|2 match rows/);
});
