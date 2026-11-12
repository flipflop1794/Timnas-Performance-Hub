import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { weeklyBrief } from '../src/core/brief.js';
import { scrimReport } from '../src/core/reports.js';

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

const localDay = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

test('every title has its own section with Team, Scrims, Scrim reports and Competitors; no outside draft tool links', async () => {
  const h = await page('today', mock());
  const nav = h.d.getElementById('titles').textContent;
  for (const t of ['Dota 2', 'PUBG Mobile', 'MLBB', 'MLBB Women', 'eFootball', 'CS2', 'CS2 Women']) assert.match(nav, new RegExp(t), `${t} in the top menu`);
  const want = { mlbb: ['MLBB', true], 't-mlbbw': ['MLBB Women', true], 't-efootball': ['eFootball', false], 't-cs2': ['CS2', false], 't-cs2w': ['CS2 Women', false] };
  for (const [team, [title, draft]] of Object.entries(want)) {
    await h.go(team); const tabs = [...h.d.querySelectorAll('#tabs a')].map((a) => a.textContent);
    assert.deepEqual(tabs, ['Team', 'Scrims & practice', 'Scrim reports', 'Trends', 'Weaknesses', ...(draft ? ['Patterns'] : []), 'Competitors', ...(draft ? ['Draft Room'] : [])], title); // V1.13 Patterns, V1.14 the hub's own Draft Room, V1.16 Trends
    await h.go(`${team}-trends`); assert.match(h.text(), new RegExp(`${title}: trends`));
    assert.match(h.text(), new RegExp(title));
    await h.go(`${team}-scrims`); assert.match(h.text(), new RegExp(`Scrims & practice — ${title}`));
    await h.go(`${team}-reports`); assert.match(h.text(), new RegExp(`Scrim reports — ${title}`));
    await h.go(`${team}-rivals`); assert.match(h.text(), new RegExp(`Competitors — ${title}`));
    assert.doesNotMatch(h.d.body.innerHTML, /claude\.ai\/(code\/)?artifact|Draft Lab/i, `${title}: no link to an outside personal tool`);
  }
  for (const v of ['dota-reports', 'pubgm-reports']) { await h.go(v); assert.match(h.text(), /Scrim reports —/); }
  await h.go('t-cs2w-rivals'); assert.match(h.text(), /Field: 11 nations/);
});

test('a coach files a report: saved, shown by day, closes the planned session, corrections appended, CSV offered', async () => {
  const db = mock(); const h = await page('mlbb-scrims', db); const d = h.d; const t0 = localDay();
  d.getElementById('spP-MLBB').value = 'Team X'; d.getElementById('spO-MLBB').value = 'Coach Indra'; d.getElementById('spD-MLBB').value = t0;
  d.querySelector('[data-scrim-plan="MLBB"]').click(); await h.wait();
  const planned = [...db.store.entries()].filter(([k]) => k.startsWith('scrims/'));
  assert.equal(planned.length, 1);
  await h.go('mlbb-reports');
  const f = (k, v) => { d.getElementById(`rp-MLBB-${k}`).value = v; };
  d.querySelector('[data-report-save="MLBB"]').click(); await h.wait();
  assert.match(d.getElementById('rpMsg-MLBB').textContent, /Who wrote|sparring partner/);
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('scrim_reports/')).length, 0, 'nothing saved when incomplete');
  f('by', 'Coach Indra'); f('partner', 'Team X'); f('won', '2'); f('lost', '1'); f('focus', 'Early rotations'); f('progress', '4'); f('worked', 'Lane swaps'); f('adjust', 'Faster turtle setup'); f('players', 'Aran: strong first lane'); f('scrim', planned[0][1].id);
  d.querySelector('[data-report-save="MLBB"]').click(); await h.wait();
  const saved = [...db.store.entries()].filter(([k]) => k.startsWith('scrim_reports/'));
  assert.equal(saved.length, 1); assert.equal(saved[0][1].result.won, 2); assert.equal(saved[0][1].origin, 'operational');
  assert.equal([...db.store.entries()].find(([k]) => k.startsWith('scrims/'))[1].status, 'done', 'planned session closed by the report');
  assert.match(h.text(), new RegExp(t0)); assert.match(h.text(), /2-1/);
  assert.match(h.text(), /Last 14 days/); assert.match(h.text(), /Win rate by day \(games won\)/); assert.equal(d.querySelectorAll('.trend .tb').length, 1); assert.match(d.querySelector('.trend .tm title').textContent, /2-1 \(67%\), 1 session/); assert.match(h.text(), /Faster turtle setup/); assert.match(h.text(), /Start the next session from here/);
  assert.ok(d.querySelector('[data-report-csv="MLBB"]'));
  // correction
  const id = saved[0][1].id; d.getElementById(`rpN-${id}`).value = 'Score was 2-0, not 2-1';
  d.querySelector(`[data-report-note="${id}"]`).click(); await h.wait();
  const after = db.store.get(`scrim_reports/${id}`);
  assert.equal(after.notes.length, 1); assert.equal(after.result.lost, 1, 'original untouched'); assert.match(h.text(), /Score was 2-0, not 2-1/);
  // overview and Today
  await h.go('reports-all'); assert.match(h.text(), /MLBB/); assert.match(h.text(), /Next session starts from/); assert.match(h.text(), /Faster turtle setup/);
  await h.go('today'); await h.as('aufa'); assert.match(h.text(), /report filed today/);
  await h.go('t-mlbbw-reports'); assert.match(h.text(), /No report yet/);
});

test('PUBG Mobile reports use points; future dates and phone numbers are refused', async () => {
  const db = mock(); const h = await page('pubgm-reports', db); const d = h.d;
  const f = (k, v) => { d.getElementById(`rp-PUBG_Mobile-${k}`).value = v; };
  assert.ok(d.getElementById('rp-PUBG_Mobile-points') && !d.getElementById('rp-PUBG_Mobile-won'));
  f('by', 'Christie Onibala'); f('partner', 'Lobby'); f('played', '6'); f('points', '71'); f('focus', 'Fallback drops'); f('progress', '3'); f('failed', 'Late rotation'); f('adjust', 'Rotate at zone 3');
  f('date', '2999-01-01'); d.querySelector('[data-report-save="PUBG Mobile"]').click(); await h.wait();
  assert.match(d.getElementById('rpMsg-PUBG_Mobile').textContent, /future/);
  f('date', localDay()); f('players', 'call 0812 3456 7890'); d.querySelector('[data-report-save="PUBG Mobile"]').click(); await h.wait();
  assert.match(d.getElementById('rpMsg-PUBG_Mobile').textContent, /remove phone/);
  f('players', ''); d.querySelector('[data-report-save="PUBG Mobile"]').click(); await h.wait();
  const saved = [...db.store.entries()].filter(([k]) => k.startsWith('scrim_reports/'));
  assert.equal(saved.length, 1); assert.equal(saved[0][1].result.points, 71); assert.match(h.text(), /71 pts in 6 matches/);
});

test('weekly brief includes a scrim report table and flags titles without a report', () => {
  const asOf = '2026-11-12';
  const reports = [scrimReport({ title: 'MLBB', date: '2026-11-10', by: 'Coach Indra', partner: 'X', focus: 'f', progress: 4, worked: 'w', adjust: 'Do A | B', won: 2, lost: 1 })];
  const md = weeklyBrief({ asOf, cycle: [], scrims: [], rivals: [], tiers: {}, checkins: [], roster: {}, rules: [], pending: [], reports });
  assert.match(md, /## Scrim reports, last 7 days/); assert.match(md, /\| MLBB \| 1 \| 2-1 \| 4 \|/); assert.match(md, /Do A \/ B/);
  assert.match(md, /Dota 2: no scrim report filed this week\./); assert.doesNotMatch(md, /MLBB: no scrim report filed/);
  const old = weeklyBrief({ asOf, cycle: [], scrims: [], rivals: [], tiers: {}, checkins: [], roster: {}, rules: [], pending: [] });
  assert.doesNotMatch(old, /Scrim reports/, 'unchanged when no reports are passed');
});
