import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { GUIDE, guidePage } from '../src/hub/guide.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tag = (c, t) => `<span class="tag ${c}">${t}</span>`;

test('guide: every section in English and Indonesian with the same number of steps, and links to real screens', () => {
  for (const g of GUIDE) {
    assert.equal(g.en.steps.length, g.id.steps.length, g.key);
    assert.ok(g.en.title && g.id.title);
  }
});

test('guide: parts not switched on are marked; the admin section only for admins; Indonesian text when ID is on', () => {
  const off = guidePage({ lang: 'en', feat: { capture: false, draftRoom: true, donny: true, ai: true }, isAdmin: false, esc, tag });
  assert.match(off, /Games from end-of-game screenshots<\/h2>\s*<p class="note">For: [^<]*<span class="tag s-proposed">not switched on yet on this site/);
  assert.doesNotMatch(off, /For admins/);
  const id = guidePage({ lang: 'id', feat: {}, isAdmin: true, esc, tag });
  assert.match(id, /Isi laporan scrim harian/); assert.match(id, /Untuk admin/); assert.doesNotMatch(id, /tag s-proposed/);
});

test('guide page in the hub: in the menu for everyone, jump links work, language switch translates it', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#guide', beforeParse(w) { w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  assert.match(main(), /How to use the hub/); assert.match(main(), /Draft Room/); assert.match(main(), /Coach Donny's system/);
  assert.ok([...d.querySelectorAll('#titles button')].some((b) => b.textContent === 'Guide'));
  d.querySelector('[data-guide-jump="draft"]').click(); await wait();
  d.getElementById('langBtn').click(); await wait();
  assert.match(main(), /Cara memakai hub/); assert.match(main(), /Kesiapan atlet \(sistem Coach Donny\)/);
  // Every "Open →" link leads to a real screen (the hub falls back to Today for unknown ones).
  for (const g of GUIDE.filter((x) => x.open && x.open !== 'today' && x.open !== 'admin-users')) {
    dom.window.location.hash = g.open; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
    assert.ok(d.querySelector(`#tabs a[href="#${g.open}"]`), `${g.key} → ${g.open}`);
  }
});
