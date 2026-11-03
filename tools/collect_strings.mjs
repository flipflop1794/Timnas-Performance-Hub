// Collects every visible UI string from every view (for the Bahasa Indonesia dictionary).
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://x.test/#today', beforeParse(w) { w.claude = { use: async () => null }; } });
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms)); await wait();
const d = dom.window.document; const seen = new Map();
const add = (s, where) => { s = s.replace(/\s+/g, ' ').trim(); if (!s || !/[A-Za-z]{2}/.test(s)) return; if (!seen.has(s)) seen.set(s, where); };
const all = new Set();
const n0 = d.querySelectorAll('#titles button[data-go]').length;
for (let i = 0; i < n0; i++) { d.querySelectorAll('#titles button[data-go]')[i].click(); await wait(); for (const a of d.querySelectorAll('#tabs a')) all.add(a.getAttribute('href').slice(1)); }
for (const me of ['aufa', 'fayad', 'donny']) for (const v of all) {
  const sel = d.getElementById('meSel'); sel.value = me; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  dom.window.location.hash = v; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  const walk = d.createTreeWalker(d.body, 4); let n; while ((n = walk.nextNode())) { if (n.parentElement.closest('script,style')) continue; add(n.nodeValue, v); }
  for (const el of d.querySelectorAll('[placeholder],[aria-label],[title]')) for (const a of ['placeholder', 'aria-label', 'title']) if (el.getAttribute(a)) add(el.getAttribute(a), v + '@' + a);
}
writeFileSync(process.argv[2], JSON.stringify([...seen.entries()], null, 0));
console.log(all.size, 'views', seen.size, 'strings');
