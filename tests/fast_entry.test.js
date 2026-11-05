import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`, beforeParse(w) { w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  await new Promise((r) => setTimeout(r, 30));
  const d = dom.window.document; const wait = () => new Promise((r) => setTimeout(r, 15));
  return { dom, d, wait, text: () => d.getElementById('main').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); },
    as: async (who) => { const el = d.getElementById('meSel'); el.value = who; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(); } };
}

test('dates follow WIB, not UTC: 05:30 WIB on 6 Nov is 6 Nov', () => {
  const code = "import('./src/core/dates.js').then(({ localDay }) => process.stdout.write(localDay(new Date('2026-11-05T22:30:00Z'))))";
  assert.equal(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: 'Asia/Jakarta' }, cwd: new URL('..', import.meta.url) }).toString(), '2026-11-06');
  const code2 = "import('./src/core/dates.js').then(({ localDay }) => process.stdout.write(localDay(new Date('2026-11-05T22:30:00Z'))))";
  assert.equal(execFileSync(process.execPath, ['-e', code2], { env: { ...process.env, TZ: 'UTC' }, cwd: new URL('..', import.meta.url) }).toString(), '2026-11-05');
});

test('typing survives a colleague saving something else; focus stays in the field', async () => {
  const db = mock(); const h = await page('mlbb-reports', db); const d = h.d;
  const el = d.getElementById('rp-MLBB-worked'); el.focus(); el.value = 'Half-typed note'; el.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
  d.getElementById('rp-MLBB-partner').value = 'Team Z';
  await db.collection('rivals').doc('x').set({ origin: 'operational', title: 'MLBB', nation: 'Malaysia', note: 'n', source: 's', kind: 'observed', by: 'A', date: '2026-11-01' }); await h.wait();
  assert.equal(d.getElementById('rp-MLBB-worked').value, 'Half-typed note');
  assert.equal(d.getElementById('rp-MLBB-partner').value, 'Team Z');
  assert.equal(d.activeElement.id, 'rp-MLBB-worked');
});

test('quick picks, progress buttons, highlighted errors, kept setup and drafts', async () => {
  const db = mock(); const h = await page('mlbb-reports', db); const d = h.d;
  const click = async (sel) => { d.querySelector(sel).click(); await h.wait(); };
  // missing partner is highlighted and focused
  { const e = d.getElementById('rp-MLBB-by'); e.value = 'Coach Indra'; e.dispatchEvent(new h.dom.window.Event('input', { bubbles: true })); }
  await click('[data-report-save="MLBB"]');
  assert.equal(d.getElementById('rp-MLBB-partner').getAttribute('aria-invalid'), 'true'); assert.equal(d.activeElement.id, 'rp-MLBB-partner');
  // quick score and progress
  const chip = [...d.querySelectorAll('.chip')].find((b) => b.textContent === '2-1'); chip.click(); await h.wait();
  assert.equal(d.getElementById('rp-MLBB-won').value, '2'); assert.equal(d.getElementById('rp-MLBB-lost').value, '1');
  await click('[data-rp-prog="MLBB"][data-v="4"]');
  assert.equal(d.getElementById('rp-MLBB-progress').value, '4'); assert.equal(d.querySelector('[data-rp-prog="MLBB"][data-v="4"]').getAttribute('aria-pressed'), 'true');
  // missing progress → focus goes to the first progress button
  const set = (k, v) => { const e = d.getElementById(`rp-MLBB-${k}`); e.value = v; e.dispatchEvent(new h.dom.window.Event('input', { bubbles: true })); };
  set('partner', 'Team X'); set('focus', 'Early rotations'); set('worked', 'Lane swaps'); set('adjust', 'Faster turtle'); set('format', 'Bo3');
  // draft survives leaving the tab and coming back
  await h.go('mlbb'); await h.go('mlbb-reports');
  assert.equal(d.getElementById('rp-MLBB-partner').value, 'Team X'); assert.equal(d.getElementById('rp-MLBB-progress').value, '4');
  assert.match(h.text(), /Draft kept on this device/);
  assert.ok(d.querySelector('details.more').open, 'More details opens when it holds a draft value');
  await click('[data-report-save="MLBB"]');
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('scrim_reports/')).length, 1);
  assert.match(d.getElementById('rpMsg-MLBB').textContent, /Report saved \(2-1 vs Team X\)/);
  // setup kept for the next partner; results and notes cleared
  assert.equal(d.getElementById('rp-MLBB-focus').value, 'Early rotations'); assert.equal(d.getElementById('rp-MLBB-format').value, 'Bo3'); assert.equal(d.getElementById('rp-MLBB-by').value, 'Coach Indra');
  assert.equal(d.getElementById('rp-MLBB-partner').value, ''); assert.equal(d.getElementById('rp-MLBB-won').value, ''); assert.equal(d.getElementById('rp-MLBB-worked').value, ''); assert.equal(d.getElementById('rp-MLBB-progress').value, '');
  // copy setup from the last report and recent-partner chip
  assert.ok([...d.querySelectorAll('.chip')].some((b) => b.textContent === 'Team X'));
  await click('[data-rp-clear="MLBB"]'); assert.equal(d.getElementById('rp-MLBB-focus').value, '');
  const copy = [...d.querySelectorAll('.chip')].find((b) => b.textContent === 'Copy setup from last report'); copy.click(); await h.wait();
  assert.equal(d.getElementById('rp-MLBB-partner').value, 'Team X'); assert.equal(d.getElementById('rp-MLBB-focus').value, 'Early rotations');
});

test('a session planned for today is one tap: partner filled and the session closed on save', async () => {
  const db = mock(); const h = await page('mlbb-scrims', db); const d = h.d;
  d.getElementById('spP-MLBB').value = 'Team P'; d.getElementById('spO-MLBB').value = 'Coach Indra';
  d.querySelector('[data-scrim-plan="MLBB"]').click(); await h.wait();
  await h.go('mlbb-reports');
  const c = [...d.querySelectorAll('.chip.planned')].find((b) => /Planned today: Team P/.test(b.textContent)); assert.ok(c); c.click(); await h.wait();
  assert.equal(d.getElementById('rp-MLBB-partner').value, 'Team P'); assert.ok(d.getElementById('rp-MLBB-scrim').value.startsWith('SC-'));
  const set = (k, v) => { d.getElementById(`rp-MLBB-${k}`).value = v; };
  set('by', 'Coach Indra'); set('won', '1'); set('lost', '0'); set('focus', 'f'); set('progress', '3'); set('failed', 'x'); set('adjust', 'y');
  d.querySelector('[data-report-save="MLBB"]').click(); await h.wait();
  assert.equal([...db.store.entries()].find(([k]) => k.startsWith('scrims/'))[1].status, 'done');
});
