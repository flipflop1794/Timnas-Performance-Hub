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
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`, beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  await new Promise((r) => setTimeout(r, 30));
  const d = dom.window.document; const wait = () => new Promise((r) => setTimeout(r, 15));
  return { dom, d, wait, text: () => d.getElementById('main').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); },
    as: async (who) => { const el = d.getElementById('meSel'); el.value = who; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(); } };
}

test('dates follow WIB even on a device set to UTC or Los Angeles', () => {
  const code = "import('./src/core/dates.js').then(({ localDay }) => process.stdout.write(localDay(new Date('2026-11-05T22:30:00Z'))))";
  for (const TZ of ['Asia/Jakarta', 'UTC', 'America/Los_Angeles']) {
    assert.equal(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ }, cwd: new URL('..', import.meta.url) }).toString(), '2026-11-06');
  }
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

// V1.38: MLBB and MLBB Women file games the Scrim Log way (tests/capture_ui.test.js); the typed-score form is tested on Dota 2.
test('quick picks, progress buttons, highlighted errors, kept setup and drafts', async () => {
  const db = mock(); const h = await page('dota-reports', db); const d = h.d;
  const click = async (sel) => { d.querySelector(sel).click(); await h.wait(); };
  // missing partner is highlighted and focused
  { const e = d.getElementById('rp-Dota_2-by'); e.value = 'Coach Indra'; e.dispatchEvent(new h.dom.window.Event('input', { bubbles: true })); }
  await click('[data-report-save="Dota 2"]');
  assert.equal(d.getElementById('rp-Dota_2-partner').getAttribute('aria-invalid'), 'true'); assert.equal(d.activeElement.id, 'rp-Dota_2-partner');
  // quick score and progress
  const chip = [...d.querySelectorAll('.chip')].find((b) => b.textContent === '2-1'); chip.click(); await h.wait();
  assert.equal(d.getElementById('rp-Dota_2-won').value, '2'); assert.equal(d.getElementById('rp-Dota_2-lost').value, '1');
  await click('[data-rp-prog="Dota_2"][data-v="4"]');
  assert.equal(d.getElementById('rp-Dota_2-progress').value, '4'); assert.equal(d.querySelector('[data-rp-prog="Dota_2"][data-v="4"]').getAttribute('aria-pressed'), 'true');
  // missing progress → focus goes to the first progress button
  const set = (k, v) => { const e = d.getElementById(`rp-Dota_2-${k}`); e.value = v; e.dispatchEvent(new h.dom.window.Event('input', { bubbles: true })); };
  set('partner', 'Team X'); set('focus', 'Early rotations'); set('worked', 'Lane swaps'); set('adjust', 'Faster turtle'); set('format', 'Bo3');
  // draft survives leaving the tab and coming back
  await h.go('dota-team'); await h.go('dota-reports');
  assert.equal(d.getElementById('rp-Dota_2-partner').value, 'Team X'); assert.equal(d.getElementById('rp-Dota_2-progress').value, '4');
  assert.match(h.text(), /Draft kept on this device/);
  assert.ok(d.querySelector('details.more').open, 'More details opens when it holds a draft value');
  await click('[data-report-save="Dota 2"]');
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('scrim_reports/')).length, 1);
  assert.match(d.getElementById('rpMsg-Dota_2').textContent, /Report saved \(2-1 vs Team X\)/);
  // setup kept for the next partner; results and notes cleared
  assert.equal(d.getElementById('rp-Dota_2-focus').value, 'Early rotations'); assert.equal(d.getElementById('rp-Dota_2-format').value, 'Bo3'); assert.equal(d.getElementById('rp-Dota_2-by').value, 'Coach Indra');
  assert.equal(d.getElementById('rp-Dota_2-partner').value, ''); assert.equal(d.getElementById('rp-Dota_2-won').value, ''); assert.equal(d.getElementById('rp-Dota_2-worked').value, ''); assert.equal(d.getElementById('rp-Dota_2-progress').value, '');
  // copy setup from the last report and recent-partner chip
  assert.ok([...d.querySelectorAll('.chip')].some((b) => b.textContent === 'Team X'));
  await click('[data-rp-clear="Dota_2"]'); assert.equal(d.getElementById('rp-Dota_2-focus').value, '');
  const copy = [...d.querySelectorAll('.chip')].find((b) => b.textContent === 'Copy setup from last report'); copy.click(); await h.wait();
  assert.equal(d.getElementById('rp-Dota_2-partner').value, 'Team X'); assert.equal(d.getElementById('rp-Dota_2-focus').value, 'Early rotations');
  // Last report's adjustment is one tap away as the next focus (V1.17 "Did we fix it?" block)
  const cont = [...d.querySelectorAll('.chip')].find((b) => b.textContent === "Make it today's focus"); assert.ok(cont, 'focus chip'); cont.click(); await h.wait();
  assert.equal(d.getElementById('rp-Dota_2-focus').value, 'Faster turtle');
  // V1.29: step 1 is the result, step 2 starts with "Say it once"; the Save bar says what is still needed
  const html = d.querySelector('.panel.rp').innerHTML; assert.ok(html.indexOf('>Result<') < html.indexOf('Say it once'));
  assert.match(d.getElementById('rpLeft-Dota_2').textContent, /of 3 done|Ready to save/);
});

test('a session planned for today is one tap: partner filled and the session closed on save', async () => {
  const db = mock(); const h = await page('dota-scrims', db); const d = h.d;
  d.getElementById('spP-Dota_2').value = 'Team P'; d.getElementById('spO-Dota_2').value = 'Coach Indra';
  d.querySelector('[data-scrim-plan="Dota 2"]').click(); await h.wait();
  await h.go('dota-reports');
  const c = [...d.querySelectorAll('.chip.planned')].find((b) => /Planned today: Team P/.test(b.textContent)); assert.ok(c); c.click(); await h.wait();
  assert.equal(d.getElementById('rp-Dota_2-partner').value, 'Team P'); assert.ok(d.getElementById('rp-Dota_2-scrim').value.startsWith('SC-'));
  const set = (k, v) => { d.getElementById(`rp-Dota_2-${k}`).value = v; };
  set('by', 'Coach Indra'); set('won', '1'); set('lost', '0'); set('focus', 'f'); set('progress', '3'); set('failed', 'x'); set('adjust', 'y');
  d.querySelector('[data-report-save="Dota 2"]').click(); await h.wait();
  assert.equal([...db.store.entries()].find(([k]) => k.startsWith('scrims/'))[1].status, 'done');
});
