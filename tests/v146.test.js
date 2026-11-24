// V1.46 (Phase 1, MLBB pilot): draft plan from rival drafts on record and our scrim games, "little public data"
// label, WhatsApp brief with tick boxes, "What repeats" on the Scrim reports page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { draftPlan, rivalDraftFacts, draftPlanText, lineText, dataDepth, isTeamOf } from '../src/core/draft_plan.js';
import { cardWhatsApp, cardPlan, approveCard } from '../src/core/oppcard.js';
import { seedRosters } from '../src/core/rosters.js';
import { scrimReport } from '../src/core/reports.js';
import { tagsOf, tagRecord } from '../src/core/weakness.js';
import { localDay, shiftDay } from '../src/core/dates.js';

const proGame = (i, o = {}) => ({ title: 'MLBB', blue: 'Team Malaysia', red: `Club ${i}`, winner: i < 3 ? 'blue' : 'red', blueBans: ['Freya', 'Masha'], redBans: ['Atlas'],
  bluePicks: ['Fanny', 'Ling', 'Kagura', 'Bruno', 'Khufra'], redPicks: ['Lancelot', 'Yve', 'Claude', 'Tigreal', 'Esmeralda'], date: `2026-11-0${i}`, event: 'Test Cup', origin: 'operational', id: `pro-${i}`, ...o });
const scrim = (i) => ({ result: i < 3 ? 'win' : 'loss', pickOrder: i % 2 ? 'FP' : 'SP', players: [{ team: 'ours', hero: 'Fanny' }, { team: 'ours', hero: 'Freya' }],
  draft: [{ action: 'ban', team: 'partner', hero: 'Ling' }, { action: 'ban', team: 'ours', hero: 'Atlas' }] });

test('rival drafts: only games of that nation count, on either side; Turkey matches Türkiye; a club named after the nation does not', () => {
  assert.ok(isTeamOf('Malaysia', 'Malaysia')); assert.ok(isTeamOf('Team Türkiye', 'Türkiye')); assert.ok(isTeamOf('Turkey', 'Türkiye'));
  assert.ok(!isTeamOf('Malaysia B', 'Malaysia')); assert.ok(!isTeamOf('Selangor Red Giants', 'Malaysia'));
  const pro = [proGame(1), proGame(2), proGame(3), proGame(4, { blue: 'Other', red: 'Malaysia', winner: 'red', redPicks: ['Fanny', 'Yve', 'Claude', 'Tigreal', 'Esmeralda'], redBans: ['Freya'] }), proGame(5, { blue: 'A', red: 'B' })];
  const f = rivalDraftFacts(pro, 'Malaysia');
  assert.equal(f.games, 4); assert.equal(f.won, 3); assert.equal(f.lowSample, true);
  assert.deepEqual(f.picks[0], { hero: 'Fanny', n: 4, won: 3, of: 4 }); assert.equal(f.bans[0].hero, 'Freya'); assert.equal(f.bans[0].n, 4);
  assert.equal(rivalDraftFacts(pro, 'Cambodia').games, 0);
});

test('draft plan: every line carries its count and a low-sample mark; our side only when nothing is on record', () => {
  const p = draftPlan({ nation: 'Malaysia', pro: [1, 2, 3].map((i) => proGame(i)), games: [1, 2, 3].map(scrim) });
  assert.equal(p.thin, true);
  const fanny = p.lines.find((l) => l.kind === 'ban' && l.hero === 'Fanny'); assert.equal(fanny.n, 3); assert.equal(fanny.us.n, 3); assert.equal(fanny.low, true);
  assert.match(lineText(fanny, 'en').evidence, /they picked it in 3 of 3 games on record \(won 2\); we play it too \(3 scrim games, 2 won\)/);
  assert.match(lineText(fanny, 'id').evidence, /mereka pick di 3 dari 3 game/);
  assert.ok(p.lines.some((l) => l.kind === 'expect' && l.hero === 'Freya'), 'they ban a hero we play');
  assert.ok(p.lines.some((l) => l.kind === 'against' && l.hero === 'Ling'));
  const side = p.lines.find((l) => l.kind === 'side'); assert.deepEqual([side.fp, side.sp], [{ n: 2, won: 1 }, { n: 1, won: 1 }]);
  assert.match(draftPlanText(p, 'id'), /\[data sedikit\]/); assert.match(draftPlanText(p, 'en'), /\[low sample\]/);
  const none = draftPlan({ nation: 'Nepal', pro: [1, 2, 3].map((i) => proGame(i)), games: [1, 2, 3].map(scrim) });
  assert.equal(none.rival.games, 0); assert.ok(none.lines.every((l) => l.kind === 'against' || l.kind === 'side'), 'no line about them without their games');
  // One mention is not a pattern: a hero needs to come up at least twice.
  assert.equal(draftPlan({ nation: 'Malaysia', pro: [proGame(1)], games: [] }).lines.length, 0);
});

test('"little public data": thin until there are notes or enough rival drafts', () => {
  const a = { observed: [], hypotheses: [], results: [{}, {}, {}], vods: [], scrimsDone: 0 };
  assert.equal(dataDepth(a, 0).thin, true); assert.equal(dataDepth(a, 5).thin, false); assert.equal(dataDepth(a).thin, false, 'other titles: public results count');
  assert.equal(dataDepth({ ...a, results: [] }).thin, true); assert.equal(dataDepth({ ...a, observed: [{}, {}] }, 0).thin, false);
  assert.deepEqual(dataDepth(a, 2).counts, { notes: 0, results: 3, vods: 0, scrims: 0, drafts: 2 });
});

test('WhatsApp brief: only ticked lines; DRAFT until approved; the draft plan only when ticked', () => {
  const plan = cardPlan({ keys: ['Ban Fanny', 'Watch the roam'], theirPlan: 'Early invades', ourAnswer: 'Ward the buff', focus: { Aran: 'Hold the lane' }, by: 'Coach A' });
  const a = { title: 'MLBB', nation: 'Malaysia' };
  const all = cardWhatsApp(a, plan, { lang: 'id' });
  assert.match(all, /^\*MLBB: Indonesia vs Malaysia\*\n_DRAF, belum disetujui_/); assert.match(all, /1\. Ban Fanny\n2\. Watch the roam/); assert.match(all, /\*Jawaban kita:\* Ward the buff/); assert.match(all, /- Aran: Hold the lane/);
  assert.doesNotMatch(all, /Draft:/);
  const some = cardWhatsApp(a, approveCard(plan, { by: 'Coach B' }), { lang: 'en', draftText: '- Ban candidate: Fanny', pick: { keys: [false, true], their: false, answer: true, focus: false, draft: true } });
  assert.match(some, /Approved by Coach B/); assert.doesNotMatch(some, /Ban Fanny\n/); assert.match(some, /1\. Watch the roam/); assert.doesNotMatch(some, /Early invades|Aran/); assert.match(some, /Draft:\n- Ban candidate: Fanny$/);
  assert.throws(() => cardWhatsApp(a, plan, { pick: { keys: [false, false], their: false, answer: false, focus: false } }), /Tick at least one line/);
  assert.throws(() => cardWhatsApp(a, null), /Write the plan first/);
});

test('Malaysia MLBB: roles and clubs from the research are on the roster, flagged to confirm', () => {
  const R = seedRosters(JSON.parse(readFileSync(new URL('../data/wec/rival_rosters.json', import.meta.url), 'utf8')));
  const kyym = R['MLBB|Malaysia'].players.find((p) => p.ign === 'Kyym');
  assert.equal(kyym.role, 'Mid'); assert.equal(kyym.club, 'RRQ Tora'); assert.ok(kyym.flags.some((f) => /confirm/.test(f)));
  assert.equal(R['MLBB|Malaysia'].players.find((p) => p.ign === 'Rokji').role, '');
});

// ---- pages (the offline hub file)
const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
function mock() {
  const store = new Map(); const subs = []; const notify = () => subs.forEach((s) => s());
  const ref = (path) => ({ set: async (d) => { store.set(path, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(path), data: () => store.get(path) }); subs.push(f); f(); return () => {}; } });
  return { store, doc: ref, collection: (col) => ({ doc: (id) => ref(`${col}/${id}`), add: async () => {},
    onSnapshot: (next) => { const f = () => next({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }); subs.push(f); f(); return () => {}; } }) };
}
async function page(hash, db) {
  let copied = '';
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`, beforeParse(w) {
    w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async (nm) => (nm === 'db' ? db : null) };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } } });
  } });
  const wait = () => new Promise((r) => setTimeout(r, 40)); await wait();
  const d = dom.window.document;
  return { d, w: dom.window, copied: () => copied, wait, text: () => d.getElementById('main').textContent };
}

test('page: MLBB opponent page shows what stands behind it and the draft plan; the brief copies only ticked lines', async () => {
  const db = mock(); for (const i of [1, 2, 3]) db.store.set(`pro_games/pro-${i}`, proGame(i));
  const h = await page('comp-card', db);
  const sel = h.d.getElementById('ocT'); sel.value = 'MLBB'; sel.dispatchEvent(new h.w.Event('change', { bubbles: true })); await h.wait();
  assert.match(h.text(), /Indonesia vs Malaysia/); assert.match(h.text(), /Behind this page: .*3 rival drafts/);
  assert.doesNotMatch(h.text(), /Little public data/, 'Malaysia has research notes on record');
  const nat = h.d.getElementById('ocN'); const pickNation = async (n) => { nat.ownerDocument.getElementById('ocN').value = n; h.d.getElementById('ocN').dispatchEvent(new h.w.Event('change', { bubbles: true })); await h.wait(); };
  await pickNation('Nepal');
  assert.match(h.text(), /Indonesia vs Nepal/); assert.match(h.text(), /Little public data/); assert.match(h.text(), /No drafts of Nepal on record yet/);
  await pickNation('Malaysia');
  assert.match(h.text(), /Draft plan/); assert.match(h.text(), /Ban candidate: Fanny — they picked it in 3 of 3 games on record/); assert.match(h.text(), /low sample/);
  assert.match(h.text(), /Kyym/); assert.match(h.text(), /Mid/);
  assert.equal(h.d.getElementById('ocWa'), null, 'nothing to send before a plan is written');
  const set = (id, v) => { h.d.getElementById(id).value = v; };
  set('ocK0', 'Ban Fanny first'); set('ocK1', 'Their roam leaves early'); set('ocA', 'Ward the buff at 0:30'); set('ocBy', 'Coach A');
  h.d.getElementById('ocSave').click(); await h.wait(); await h.wait();
  assert.ok(h.d.getElementById('ocWa'), h.d.getElementById('ocSaveMsg')?.textContent);
  h.d.querySelector('[data-oc-wa="key1"]').checked = false; h.d.querySelector('[data-oc-wa="draft"]').checked = true;
  h.d.getElementById('ocWa').click(); await h.wait();
  assert.match(h.copied(), /^\*MLBB: Indonesia vs Malaysia\*/); assert.match(h.copied(), /1\. Ban Fanny first/); assert.doesNotMatch(h.copied(), /roam leaves early/);
  assert.match(h.copied(), /Draft:\n- Ban candidate: /); assert.match(h.copied(), /- Ban candidate: Fanny \(they picked it in 3 of 3/); assert.match(h.copied(), /DRAFT, not approved yet/);
  // Another title: no draft plan section, and the label follows its own data.
  const sel2 = h.d.getElementById('ocT'); sel2.value = 'CS2'; sel2.dispatchEvent(new h.w.Event('change', { bubbles: true })); await h.wait();
  assert.doesNotMatch(h.text(), /Draft plan/); assert.match(h.text(), /Behind this page:/); assert.doesNotMatch(h.text(), /rival draft\(s\)/);
});

test('page: "What repeats" appears on Scrim reports only when a label came back, with the reports behind it', async () => {
  const db = mock(); const t0 = localDay(); const tg = tagsOf('CS2')[0];
  const mk = (d, partner, failed) => scrimReport({ title: 'CS2', date: d, by: 'Coach B', partner, won: '0', lost: '1', failed, adjust: 'Fix it' });
  const reps = [mk(t0, 'Team D', 'Lost both pistols'), mk(shiftDay(t0, -2), 'Team E', 'Pistol rounds again'), mk(shiftDay(t0, -3), 'Team F', 'Late rotations')];
  for (const r of reps) db.store.set(`scrim_reports/${r.id}`, { ...r, origin: 'operational' });
  const h = await page('t-cs2-reports', db);
  assert.doesNotMatch(h.text(), /What repeats/, 'no panel without a repeated label');
  for (const r of reps.slice(0, 2)) { const t = tagRecord(r, [tg], { by: 'Coach B', source: 'coach' }); await db.collection('weakness_tags').doc(t.id).set(t); }
  await h.wait();
  const panel = [...h.d.querySelectorAll('.panel')].find((p) => /What repeats/.test(p.textContent)); assert.ok(panel);
  assert.match(panel.textContent, new RegExp(`${tg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · 2 reports`));
  assert.match(panel.textContent, /Team D/); assert.match(panel.textContent, /Lost both pistols/); assert.doesNotMatch(panel.textContent, /Team F/);
  assert.equal(panel.querySelector('[data-co-weak-propose]'), null, 'a training focus is offered from 3 reports');
});
