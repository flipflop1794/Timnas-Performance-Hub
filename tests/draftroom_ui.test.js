import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

function mock({ denyWellbeing = false } = {}) {
  const store = new Map(); const subs = [];
  const notify = () => subs.forEach((s) => s());
  const ref = (path) => ({ set: async (d) => { store.set(path, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(path), data: () => store.get(path) }); subs.push(f); f(); return () => {}; } });
  let n = 0;
  return { store, doc: ref, collection: (col) => ({ doc: (id) => ref(`${col}/${id}`), add: async (d) => { store.set(`${col}/a${++n}`, structuredClone(d)); notify(); },
    onSnapshot: (next, err) => { if (denyWellbeing && col.startsWith('wellbeing')) { err?.({ code: 'permission_denied' }); return () => {}; } const f = () => { const docs = [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })); next({ docs }); }; subs.push(f); f(); return () => {}; } }) };
}
async function page(hash, db) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`, beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  await new Promise((r) => setTimeout(r, 30));
  const d = dom.window.document; const wait = () => new Promise((r) => setTimeout(r, 15));
  return { dom, d, wait, text: () => d.getElementById('main').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); },
    as: async (who) => { const el = d.getElementById('meSel'); el.value = who; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(); } };
}

const click = async (h, sel) => { const el = h.d.querySelector(sel); assert.ok(el, `no ${sel}`); el.click(); await h.wait(); await h.wait(); };
const set = (h, id, v) => { const el = h.d.getElementById(id); assert.ok(el, `no #${id}`); el.value = v; };
const msg = (h, id) => h.d.getElementById(id)?.textContent || '';

test('Draft Room: tab on MLBB titles only; a full mock draft with the clock, saved with its timing', async () => {
  const db = mock(); const h = await page('mlbb', db);
  assert.ok([...h.d.querySelectorAll('#tabs a')].some((a) => a.textContent === 'Draft Room'));
  await h.go('dota-team'); assert.ok(![...h.d.querySelectorAll('#tabs a')].some((a) => a.textContent === 'Draft Room'));
  await h.go('mlbb-draft'); assert.match(h.text(), /Draft Room — MLBB/); assert.doesNotMatch(h.d.body.innerHTML, /Draft Lab|claude\.ai\/(code\/)?artifact/);
  set(h, 'drOpp', 'Myanmar'); set(h, 'drBy', 'Aufa Bassam');
  await click(h, '[data-dr-start]');
  assert.match(h.text(), /Step 1 \/ 20/); assert.ok(h.d.getElementById('drClock'));
  set(h, 'drHero', 'fanny'); await click(h, '[data-dr-lock]');
  assert.match(h.d.querySelector('.dr-side.blue').textContent, /Fanny/);
  set(h, 'drHero', 'Fanny'); await click(h, '[data-dr-lock]'); assert.match(msg(h, 'msg-dr-mock'), /already banned or picked/);
  await click(h, '[data-dr-skip]'); assert.match(h.d.querySelector('.dr-side.red').textContent, /no ban/);
  const names = ['Ling', 'Joy', 'Kalea', 'Atlas', 'Masha', 'Gloo', 'Hilda', 'Chou', 'Aulus', 'Layla', 'Tigreal', 'Valir', 'Akai', 'Lancelot', 'Esmeralda', 'Zhuxin', 'Selena', 'Alice'];
  for (const n of names) { if (!h.d.getElementById('drHero')) break; set(h, 'drHero', n); await click(h, '[data-dr-lock]'); }
  assert.match(h.text(), /Draft complete/);
  set(h, 'drResult', 'win'); await click(h, '[data-dr-finish]');
  const saved = [...db.store.entries()].filter(([k]) => k.startsWith('mock_drafts/')).map(([, v]) => v);
  assert.equal(saved.length, 1); assert.equal(saved[0].actions.length, 20); assert.equal(saved[0].result, 'win'); assert.equal(saved[0].opponent, 'Myanmar');
  assert.match(h.text(), /Recent mock drafts/); assert.match(h.text(), /Myanmar/);
});

test('Draft Room: draft book versions, approval by another coach, shown on the opponent card', async () => {
  const db = mock(); const h = await page('mlbb-draft', db);
  await click(h, '[data-dr-section="book"]');
  set(h, 'drBookOpp', 'Myanmar'); h.d.getElementById('drBookOpp').dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); await h.wait();
  set(h, 'drBans', 'Fanny, Ling'); set(h, 'drProtect', 'Fanny'); set(h, 'drBookBy', 'Aufa Bassam');
  await click(h, '[data-dr-savebook]'); assert.match(msg(h, 'msg-dr-book'), /both the ban list and the protect list/);
  set(h, 'drProtect', 'Joy'); set(h, 'drBlue', 'Take Joy first');
  await click(h, '[data-dr-savebook]'); assert.match(msg(h, 'msg-dr-book'), /version 1/);
  set(h, 'drApprover', 'Aufa Bassam'); await click(h, '[data-dr-approve]'); assert.match(msg(h, 'msg-dr-book'), /cannot approve/);
  set(h, 'drApprover', 'Fayad'); await click(h, '[data-dr-approve]'); assert.match(h.text(), /approved by Fayad/);
  await h.go('comp-card'); set(h, 'ocT', 'MLBB'); h.d.getElementById('ocT').dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); await h.wait();
  set(h, 'ocN', 'Myanmar'); h.d.getElementById('ocN')?.dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); await h.wait();
  assert.match(h.text(), /Draft book \(Draft Room, v1, approved by Fayad\)/); assert.match(h.text(), /Bans: Fanny, Ling/);
});

test('Draft Room: hero pools, pro-game import kept apart, patterns and pool gaps, drills', async () => {
  const db = mock(); const h = await page('mlbb-draft', db);
  await click(h, '[data-dr-section="pools"]');
  assert.match(h.text(), /Hero pool —/);
  set(h, 'drPoolHero', 'Ling'); set(h, 'drPoolTier', 'main'); await click(h, '[data-dr-rate]');
  assert.match(h.d.querySelector('.dr-tier').textContent, /Ling/);
  await click(h, '[data-dr-section="pro"]');
  const rows = [1, 2, 3, 4, 5].map((i) => `2026-11-0${i},MPL ID S18,AE,BTR,blue,Fanny|Ling,Masha,Esmeralda|Zhuxin|Selena|Alice|Lancelot,Hayabusa|Layla|Tigreal|Valir|Akai,https://liquipedia.net/x`);
  set(h, 'drCsv', ['date,event,blue,red,winner,blue_bans,red_bans,blue_picks,red_picks,source', ...rows, '2026-11-09,MPL ID S18,AE,BTR,blue,Nobody,,,,'].join('\n'));
  await click(h, '[data-dr-check]'); assert.match(h.text(), /1 row\(s\) left out/); assert.match(h.text(), /5 game\(s\) ready/);
  await click(h, '[data-dr-import]'); assert.match(h.text(), /MPL ID S18: 5 games/);
  await click(h, '[data-dr-section="patterns"]');
  assert.match(h.text(), /Ours — national-team scrims/); assert.match(h.text(), /Public pro games/); assert.match(h.text(), /blue side won 100%/);
  const gaps = h.d.querySelector('.panel.pro').textContent; assert.match(gaps, /nobody on our squad rates/); assert.match(gaps, /Fanny/); assert.doesNotMatch(gaps.split('nobody on our squad')[1], /Ling ·/);
  await click(h, '[data-dr-section="drills"]');
  set(h, 'drDName', 'Answer Fanny'); set(h, 'drDSide', 'red'); set(h, 'drDPrefill', 'Ling,,Joy,Kalea,Atlas,Masha,Fanny'); set(h, 'drDPrompt', 'What first?'); set(h, 'drDAccept', 'Khufra'); set(h, 'drDSec', '20');
  await click(h, '[data-dr-newdrill]'); assert.match(h.text(), /Answer Fanny/);
  await click(h, '[data-dr-run]'); await click(h, '[data-dr-go]');
  set(h, 'drDrillHero', 'Khufra'); await click(h, '[data-dr-answer]');
  assert.match(msg(h, 'msg-dr-drill'), /Khufra in \d+ s: an accepted answer/);
  const dr = [...db.store.entries()].find(([k]) => k.startsWith('draft_drills/'))[1]; assert.equal(dr.attempts.length, 1); assert.equal(dr.prefill[1].hero, '');
});
