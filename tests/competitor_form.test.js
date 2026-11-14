import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { localDay } from '../src/core/dates.js';
import { FIELDS, FORM, EVENTS, formOf, fieldForm, coverage } from '../src/core/competitors.js';
import { autoCard, cardMarkdown } from '../src/core/oppcard.js';

const DATE = /^\d{4}(-\d\d(-\d\d)?)?$/;

test('public results: every line names a nation in that title\'s published field, a date and a source', () => {
  for (const f of FORM) {
    assert.ok(FIELDS[f.title], `${f.title} is a WEC title`);
    assert.ok(FIELDS[f.title].includes(f.nation), `${f.nation} is in the ${f.title} field`);
    assert.match(f.date, DATE, `${f.title}|${f.nation} date`);
    assert.ok(f.event && f.result && f.source, `${f.title}|${f.nation} has event, result and source`);
  }
  for (const e of EVENTS) { assert.ok(FIELDS[e.title]); assert.match(e.date, DATE); assert.ok(e.source); }
});

test('formOf: own line replaces the bare podium for the same event; newest first', () => {
  const my = formOf('MLBB', 'Malaysia');
  assert.equal(my.filter((x) => x.event === 'WEC25 Kuala Lumpur').length, 1, 'no duplicate for WEC25');
  assert.ok(my.some((x) => x.event === 'Asian Games 2026 Aichi-Nagoya' && x.result === 'Bronze' && x.podium));
  assert.deepEqual(my.map((x) => x.date), [...my.map((x) => x.date)].sort().reverse());
  assert.ok(formOf('MLBB Women', 'Egypt').length >= 2, 'Egypt women: two WEC bronzes');
  assert.deepEqual(formOf('MLBB Women', 'Argentina'), []);
  const mm = formOf('MLBB', 'Myanmar');
  assert.equal(mm.filter((x) => /Asian Games 2026/.test(x.event)).length, 1); assert.match(mm[0].result, /4–0 over Indonesia/);
  assert.deepEqual(fieldForm('Dota 2').without, ['Egypt']);
});

test('fieldForm lists the gaps; public results do not change scouting coverage', () => {
  const w = fieldForm('MLBB Women');
  assert.deepEqual(w.without, ['Argentina']);
  assert.ok(w.events.length >= 2);
  const d = coverage().find((x) => x.title === 'Dota 2');
  assert.equal(d.noted, 2, 'coverage still counts staff notes only');
});

test('page: competitors tab — last change, roster-changed flag, sort by latest change, public result to note, Today panel', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-rivals', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  assert.match(main(), /Recent results on record — MLBB/); assert.match(main(), /Last change/);
  const rowOf = (n) => [...d.querySelectorAll('#main table.comp-t tbody tr')].find((tr) => tr.cells[0]?.textContent.startsWith(n));
  assert.match(rowOf('Myanmar').textContent, /roster changed/);
  d.querySelector('[data-comp-sort="recent"]').click(); await wait();
  assert.equal(d.querySelector('[data-comp-sort="recent"]').getAttribute('aria-pressed'), 'true');
  const first = d.querySelector('#main table.comp-t tbody tr td b').textContent;
  assert.ok(['Myanmar', 'Türkiye', 'Cambodia'].includes(first), `latest change first, got ${first}`);
  const btn = [...d.querySelectorAll('[data-form-note]')].find((b) => JSON.parse(b.dataset.formNote).nation === 'Türkiye');
  btn.click(); await wait();
  assert.equal(d.getElementById('rvN-MLBB').value, 'Türkiye'); assert.match(d.getElementById('rvT-MLBB').value, /WEC25/); assert.ok(d.getElementById('rvD-MLBB').open);
  assert.equal(d.querySelectorAll('[data-form-note]').length > 0, true);
  // Today lists the 13 Nov roster changes while they are less than 14 days old.
  if (localDay() <= '2026-11-27') { dom.window.location.hash = 'today'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); assert.match(main(), /Rival roster changes/); assert.match(main(), /J3X/); }
});

test('page: Today opens with a ranked "needs attention" list, each item linking to the screen that fixes it', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#today', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document;
  const panel = d.querySelector('#main .attention'); assert.ok(panel, 'panel shown');
  assert.match(panel.textContent, /Needs attention now/);
  const levels = [...panel.querySelectorAll('li .tag')].map((x) => x.textContent);
  const rank = { now: 0, today: 1, 'this week': 2 };
  assert.deepEqual(levels, [...levels].sort((a, b) => rank[a] - rank[b]), 'most urgent first');
  assert.ok([...panel.querySelectorAll('a.btn')].every((a) => a.getAttribute('href').startsWith('#')), 'each item links to a screen');
  // Panel comes before the personal queue.
  const panels = [...d.querySelectorAll('#main > .panel, #main .panel')];
  assert.ok(panels.indexOf(panel) < panels.findIndex((p) => /To review/.test(p.textContent)));
  // The Head Coach follows every title. CS2 rosters were last read on 3 Nov (MLBB, Dota 2 and PUBG Mobile were
  // re-read on 13 Nov), so their weekly checks are due, grouped per title.
  const sel = d.getElementById('meSel'); sel.value = 'fayad'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  const p2 = d.querySelector('#main .attention').textContent;
  assert.match(p2, /Rival roster checks due \(weekly\): \d+/); assert.match(p2, /CS2: \d+/);
  if (localDay() < '2026-11-20') assert.doesNotMatch(p2, /MLBB: \d+ ·|Dota: \d+/, 're-read on 13 Nov: not due before 20 Nov');
});

test('V1.23 staff keep public results current: add, correct (same event and date replaces), retire; never counted as notes', async () => {
  const { rivalResult, retireResult, formKey, board } = await import('../src/core/competitors.js');
  assert.throws(() => rivalResult({ title: 'MLBB', nation: 'Myanmar', event: 'X', date: '13-11-2026', result: 'r', source: 's', by: 'A' }), /YYYY/);
  assert.throws(() => rivalResult({ title: 'MLBB', nation: 'Philippines', event: 'X', date: '2026-11', result: 'r', source: 's', by: 'A' }), /not in the published MLBB field/);
  assert.throws(() => rivalResult({ title: 'MLBB', nation: 'Myanmar', event: 'X', date: '2026-12-30', result: 'r', source: 's', by: 'A', asOf: '2026-11-14' }), /future/);
  assert.throws(() => rivalResult({ title: 'MLBB', nation: 'Myanmar', event: 'X', date: '2026-11', result: 'r', source: '', by: 'A' }), /Source is required/);
  const added = rivalResult({ title: 'MLBB Women', nation: 'Argentina', event: 'WEC26 Americas qualifier', date: '2026-09', result: 'Qualified, 2–1 in the final', source: 'iesf.org', by: 'Aufa' });
  const fix = rivalResult({ title: 'MLBB', nation: 'Myanmar', event: 'Asian Games 2026 Aichi-Nagoya', date: '2026-10-01', result: 'Gold: 4–0 over Indonesia (best of seven).', source: 'AESF', by: 'Aufa' });
  const shipped = formOf('MLBB', 'Myanmar').find((f) => f.event === 'Asian Games 2026 Aichi-Nagoya');
  const out = retireResult({ title: 'MLBB', nation: 'Nepal', key: formKey(formOf('MLBB', 'Nepal')[0]), why: 'superseded', by: 'Aufa' });
  assert.throws(() => retireResult({ title: 'MLBB', key: 'x', why: '', by: 'A' }), /Say why/);
  const staff = [added, fix, out];
  assert.equal(formOf('MLBB Women', 'Argentina', staff).length, 1, 'gap filled by the staff');
  assert.deepEqual(fieldForm('MLBB Women', staff).without, []);
  const mm = formOf('MLBB', 'Myanmar', staff).filter((f) => f.event === 'Asian Games 2026 Aichi-Nagoya');
  assert.equal(mm.length, 1); assert.equal(mm[0].staff, true); assert.notEqual(mm[0].result, shipped.result);
  assert.equal(formOf('MLBB', 'Nepal', staff).length, formOf('MLBB', 'Nepal').length - 1, 'retired line hidden');
  assert.equal(board('MLBB', staff).covered, board('MLBB').covered, 'results and retirements are not scouting notes');
  assert.equal(coverage({ rivals: staff }).find((c) => c.title === 'MLBB Women').noted, coverage().find((c) => c.title === 'MLBB Women').noted);
});

test('page: a coach corrects a public result in the Competitors tab; the Indonesian guide quotes the Indonesian button names', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-rivals', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  const btn = [...d.querySelectorAll('[data-result-edit]')].find((b) => JSON.parse(b.dataset.resultEdit).nation === 'Cambodia');
  btn.click(); await wait();
  assert.ok(d.getElementById('rrD-MLBB').open); assert.equal(d.getElementById('rrN-MLBB').value, 'Cambodia');
  d.getElementById('rrR-MLBB').value = 'Silver in MLBB (0–3 to Malaysia) and in MLBB Women.'; d.getElementById('rrB-MLBB').value = 'Aufa Bassam';
  d.querySelector('[data-result-save="MLBB"]').click(); await wait();
  assert.match(main(), /Silver in MLBB \(0–3 to Malaysia\) and in MLBB Women\./); assert.match(main(), /entered by Aufa Bassam/);
  assert.match(d.getElementById('rrMsg-MLBB').textContent, /Result saved/);
  d.querySelector('[data-result-save="MLBB"]').click(); await wait();   // second save of the same line is just a newer correction
  d.getElementById('rrW-MLBB').value = ''; d.getElementById('rrX-MLBB').value = ''; d.querySelector('[data-result-retire="MLBB"]').click(); await wait();
  assert.match(d.getElementById('rrMsg-MLBB').textContent, /Pick the result/);
  // Guide in Bahasa Indonesia
  d.getElementById('langBtn').click(); await wait();
  dom.window.location.hash = 'guide'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /"Salin pengaturan dari laporan terakhir"/); assert.doesNotMatch(main(), /"Copy setup from last report"/);
});

test('opponent card carries recent public results in the markdown', () => {
  const a = autoCard({ title: 'MLBB', nation: 'Türkiye', per: null, team: null, data: {}, asOf: '2026-11-13' });
  assert.ok(a.results.length >= 1);
  const md = cardMarkdown(a, null);
  assert.match(md, /## Recent results \(public\)/);
  assert.match(md, /bronze match/);
  // Egypt is the one Dota 2 rival with no public result on record (Belarus got one in iteration 2).
  const b = autoCard({ title: 'Dota 2', nation: 'Egypt', per: null, team: null, data: {}, asOf: '2026-11-13' });
  assert.doesNotMatch(cardMarkdown(b, null), /Recent results/);
});
