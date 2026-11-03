// V1.1 acceptance checks. Demo fixtures test software behaviour only; nothing here is evidence
// that the coaching workflow improves performance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseHeroes, parsePlayerMatches } from '../src/dota/data.js';
import { importMatch } from '../src/dota/importer.js';
import { parseCSV, scorer } from '../src/pubgm/scoring.js';
import { tagOrigin, recommendationRecord, evidence, sufficiency, DemoLeakError } from '../src/core/records.js';
import { DEFAULT_RULES, snapshot, updateRule, changedSince } from '../src/core/rules.js';
import { propose, review, logSession, decide, nextStep, trail } from '../src/core/cycle.js';
import { dotaTeamPipeline, dotaMatchPipeline, pubgmPipeline, todayList } from '../src/hub/pipeline.js';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const heroes = parseHeroes(rd('data/dota/heroes.csv'));
const players = parsePlayerMatches(rd('data/dota/ina_pro_matches.csv'));
const matches = JSON.parse(rd('data/dota/matches_parsed.json')).matches;
const ACC = Object.values(players).map((p) => p.account);
const sc = scorer(JSON.parse(rd('data/pubgm/scoring_profiles.json')).profiles.standard_10_6);
const demoRows = tagOrigin(parseCSV(rd('data/pubgm/demo_matches.csv')), 'demo');
const demoFights = tagOrigin(parseCSV(rd('data/pubgm/demo_fights.csv')), 'demo');
const html = rd('dist/hub.html');

// In-memory stand-in for the artifact db capability (same call shapes the page uses).
function mockDb() {
  const store = new Map(); const subs = [];
  const notify = () => subs.forEach((s) => s());
  const docsIn = (col) => [...store.entries()].filter(([k]) => k.startsWith(`${col}/`) && k.split('/').length === col.split('/').length + 1).map(([k, v]) => ({ id: k.split('/').pop(), data: () => structuredClone(v), exists: true }));
  const docRef = (path) => ({ set: async (d) => { store.set(path, structuredClone(d)); notify(); }, get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    onSnapshot: (next) => { const f = () => next({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path) }); subs.push(f); f(); return () => {}; } });
  let n = 0;
  return { store, doc: docRef,
    collection: (col) => ({ doc: (id) => docRef(`${col}/${id ?? `auto${++n}`}`), add: async (d) => { const p = `${col}/auto${++n}`; store.set(p, structuredClone(d)); notify(); return docRef(p); },
      onSnapshot: (next) => { const f = () => { const docs = docsIn(col); next({ docs, size: docs.length, empty: !docs.length }); }; subs.push(f); f(); return () => {}; } }) };
}
async function hub(hash, db = mockDb()) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`,
    beforeParse(w) { w.claude = { use: async (name) => (name === 'db' ? db : null) }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  await new Promise((r) => setTimeout(r, 30));
  const d = dom.window.document;
  const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await new Promise((r) => setTimeout(r, 5)); };
  const click = async (el) => { el.click(); await new Promise((r) => setTimeout(r, 15)); };
  const text = () => d.getElementById('main').textContent;
  const as = async (who) => { const el = d.getElementById('meSel'); el.value = who; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 5)); };
  return { dom, d, db, go, click, text, as };
}

// 1. Synthetic data never enters operational summaries or recommendations.
test('AC1 synthetic data is blocked from every operational path', async () => {
  assert.throws(() => pubgmPipeline({ rows: demoRows, fights: demoFights, team: 'INA (demo)', sc, origin: 'operational', scoringId: 'x' }), DemoLeakError);
  const demo = pubgmPipeline({ rows: demoRows, fights: demoFights, team: 'INA (demo)', sc, origin: 'demo', scoringId: 'x' });
  assert.equal(demo.recs.length, 0, 'demo produces no recommendation records');
  assert.ok(demo.evidence.every((e) => e.origin === 'demo' && e.context === 'demo'));
  const ev = evidence({ id: 'X1', title: 't', kind: 'observed', n: 1, confidence: 'Low', limitations: [] }, { source: 's', retrieved: 'r', origin: 'demo', context: 'demo' });
  assert.throws(() => recommendationRecord({ problem: 'p', findings: ['X1'] }, [ev]), DemoLeakError);
  assert.throws(() => propose({ problem: 'p' }, { title: 'PUBG Mobile', by: 'x', origin: 'demo' }), /Demo data cannot/);
  const h = await hub('today');
  await h.as('fayad');
  assert.match(h.text(), /Not enough operational evidence/);
  assert.doesNotMatch(h.text(), /INA \(demo\)/);
  await h.click(h.d.getElementById('modeBtn'));
  assert.match(h.text(), /Today shows operational evidence only/);
  await h.go('pubgm-team');
  assert.match(h.text(), /DEMO SANDBOX/);
  assert.match(h.text(), /recommendations are not generated from demo data/);
  assert.equal(h.d.querySelectorAll('[data-propose]').length, 0);
  await h.click(h.d.getElementById('modeBtn')); await h.go('pubgm-log');
  h.d.getElementById('lMatches').value = rd('data/pubgm/demo_matches.csv');
  await h.click(h.d.getElementById('lSave'));
  assert.match(h.d.getElementById('lMsg').textContent, /SYNTHETIC/);
  assert.equal([...h.db.store.keys()].filter((k) => k.startsWith('pubgm_logs/')).length, 0, 'nothing saved');
});

// 2. An unreviewed objective is visibly proposed.
test('AC2 an engine proposal sent to review shows as proposed everywhere', async () => {
  const h = await hub('dota-team');
  const btn = h.d.querySelector('[data-propose]'); assert.ok(btn, 'a proposal button exists');
  await h.click(btn);
  const saved = [...h.db.store.entries()].filter(([k]) => k.startsWith('cycle/'));
  assert.equal(saved.length, 1); assert.equal(saved[0][1].status, 'proposed'); assert.equal(saved[0][1].origin, 'operational');
  await h.go('today');
  assert.match(h.text(), /Proposed — awaiting coach review/);
  await h.go('staff-cycle');
  assert.match(h.text(), /Waiting for review by Aufa Bassam/);
});

// 3 + 4. Coach can modify/reject with a preserved reason; sessions link to objective and next decision.
test('AC3/AC4 review reasons are kept and sessions link forward to decisions', async () => {
  const h = await hub('dota-team');
  await h.click(h.d.querySelector('[data-propose]'));
  await h.go('staff-cycle');
  const id = [...h.db.store.keys()].find((k) => k.startsWith('cycle/')).split('/')[1];
  const set = (k, v) => { h.d.getElementById(`${k}-${id}`).value = v; };
  set('rv-d', 'modified'); set('rv-n', 'Coach Arvin');
  await h.click(h.d.querySelector(`[data-act="review"][data-id="${id}"]`));
  assert.match(h.d.getElementById(`msg-${id}`).textContent, /reason is required/);
  set('rv-d', 'modified'); set('rv-n', 'Coach Arvin'); set('rv-r', 'Too long for one session'); set('rv-s', '2 of 3 reps');
  await h.click(h.d.querySelector(`[data-act="review"][data-id="${id}"]`));
  let o = h.db.store.get(`cycle/${id}`);
  assert.equal(o.status, 'modified'); assert.equal(o.reviews[0].reason, 'Too long for one session');
  assert.equal(o.objective.success, '2 of 3 reps'); assert.notEqual(o.reviews[0].before.success, '2 of 3 reps');
  set('ss-o', 'Analyst TBD'); set('ss-e', 'as-planned'); set('ss-r', 'met'); set('ss-m', '2 of 3 reps');
  await h.click(h.d.querySelector(`[data-act="session"][data-id="${id}"]`));
  o = h.db.store.get(`cycle/${id}`);
  assert.equal(o.sessions.length, 1); assert.equal(o.sessions[0].objective.success, '2 of 3 reps');
  assert.match(nextStep(o), /decide continue/);
  set('dc-d', 'continue'); set('dc-b', 'Coach Arvin'); set('dc-r', 'Met once; repeat with a stronger scrim partner');
  await h.click(h.d.querySelector(`[data-act="decide"][data-id="${id}"]`));
  o = h.db.store.get(`cycle/${id}`);
  const tr = trail(o); assert.equal(tr[0].decision.decision, 'continue'); assert.equal(tr[0].decision.sessionId, 'S1');
  // Reject path keeps its reason too.
  const r = review(propose({ problem: 'x', drill: 'd', success: 's', evidence: [], uncertainty: [] }, { title: 'Dota 2', by: 'Hub' }), { decision: 'rejected', reviewer: 'HC', reason: 'Not our priority' });
  assert.equal(r.status, 'rejected'); assert.match(nextStep(r), /Not our priority/);
  assert.throws(() => logSession(r, { owner: 'a', date: '2026-11-10', execution: 'as-planned', result: 'met', measure: '1' }), /Review it first/);
});

// 5. Sparse or incomplete data produces a limitation.
test('AC5 sparse data gives an explicit limitation, not a recommendation', async () => {
  const ops = tagOrigin(demoRows.filter((r) => ['S001', 'S002', 'S003'].includes(r.match_id)).map(({ origin, ...r }) => r), 'operational');
  const p = pubgmPipeline({ rows: ops, fights: [], team: 'INA (demo)', sc, origin: 'operational', scoringId: 'x' });
  assert.match(p.insufficient, /3 logged matches .* at least 6/);
  assert.equal(p.recs.length, 0);
  assert.equal(sufficiency({ kind: 'inferred', n: 3, confidence: 'Low' }).ok, false);
  assert.equal(sufficiency({ kind: 'hypothesis', n: 50, confidence: 'High' }).ok, false);
  const m = { ...matches[0], parsed: false, gadv: null, tf: [] };
  const r = dotaMatchPipeline({ m, origin: 'operational', retrieved: 'x' }, ACC, heroes);
  assert.ok(r.evidence[0].limitations.some((l) => /not parsed/.test(l)));
});

// 6. Club-game evidence is never presented as national-team performance.
test('AC6 club evidence is labelled club and excluded from national review', async () => {
  const t = dotaTeamPipeline(players, heroes, 1793696400, '2026-11-03');
  assert.ok(t.evidence.every((e) => e.context === 'club'));
  assert.ok(t.recs.every((r) => r.contexts.includes('club') && r.uncertainty.some((u) => /club games/.test(u))));
  const r = dotaMatchPipeline({ m: matches[0], origin: 'operational', retrieved: 'x' }, ACC, heroes);
  assert.equal(r.context.context, 'club');
  const h = await hub('dota-review');
  assert.match(h.text(), /No national-team matches imported yet/);
  await h.go('dota-team');
  assert.match(h.text(), /not the national five together/);
  assert.doesNotMatch(h.text(), /Ready heroes/);
});

// 7. A rule-profile change flags affected analysis.
test('AC7 changing a rule profile flags affected views and objectives', async () => {
  const snap = snapshot(DEFAULT_RULES, ['pubgm-scoring']);
  const { rules, affected } = updateRule(DEFAULT_RULES, 'pubgm-scoring', { version: 'WEC26 v1', status: 'confirmed' }, { by: 'PB ESI', reason: 'rulebook' });
  assert.ok(affected.includes('pubgm-sim'));
  assert.equal(changedSince(snap, rules)[0].to, 'WEC26 v1');
  assert.throws(() => updateRule(DEFAULT_RULES, 'pubgm-scoring', { version: 'x' }, { by: '', reason: 'r' }), /name/);
  const h = await hub('dota-team');
  await h.click(h.d.querySelector('[data-propose]'));
  await h.go('staff-rules');
  h.d.getElementById('ruId').value = 'dota-patch'; h.d.getElementById('ruVer').value = '7.41e'; h.d.getElementById('ruSt').value = 'provisional';
  h.d.getElementById('ruBy').value = 'Asst HC'; h.d.getElementById('ruWhy').value = 'Patch notes';
  await h.click(h.d.getElementById('ruSave'));
  assert.match(h.text(), /Objectives flagged: 1/);
  await h.go('staff-cycle');
  assert.match(h.text(), /Rules changed since proposal/);
});

// 8. Failed or incomplete imports give actionable feedback.
test('AC8 import failures explain what to do', () => {
  assert.match(importMatch('<html>').problems[0], /api\.opendota\.com\/api\/matches/);
  assert.match(importMatch('{"match_id": 1, "players": [').problems[0], /cut off/);
  assert.match(importMatch('{"error":"Not Found"}').problems[0], /Check the match ID/);
  const raw = { match_id: 5, duration: 2000, radiant_win: true, players: Array.from({ length: 10 }, (_, i) => ({ account_id: 1000 + i, player_slot: i < 5 ? i : 123 + i, hero_id: 1 })) };
  const r = importMatch(JSON.stringify(raw), { ourAccounts: ACC });
  assert.equal(r.ok, false); assert.match(r.problems[0], /None of the national players/);
  raw.players[0].account_id = ACC[0];
  const ok = importMatch(JSON.stringify(raw), { ourAccounts: ACC });
  assert.equal(ok.ok, true); assert.ok(ok.warnings.some((w) => /Request a parse/.test(w)));
});

test('AC8b the page reports a failed import and keeps going', async () => {
  const h = await hub('dota-post');
  h.d.getElementById('mPaste').value = '{"match_id": 1, "players": [';
  await h.click(h.d.getElementById('mParse'));
  assert.match(h.text(), /Import failed/); assert.match(h.text(), /Save the page as a file/);
});

// 9. End-to-end in the intended environment: simulated here with an in-memory store.
test('AC9 (simulated) operational PUBGM log → proposal → Today, with a stand-in store', async () => {
  const h = await hub('pubgm-log');
  const ops = rd('data/pubgm/demo_matches.csv').split('\n').filter((l) => !l.startsWith('#')).join('\n').replace(/SYNTHETIC scrims/g, 'Fixture').replace(/INA \(demo\)/g, 'INA');
  h.d.getElementById('lMatches').value = ops;
  await h.click(h.d.getElementById('lSave'));
  assert.match(h.d.getElementById('lMsg').textContent, /Saved 384 match rows/);
  await h.go('pubgm-team');
  assert.doesNotMatch(h.text(), /Not enough evidence/);
  const b = h.d.querySelector('[data-propose]'); assert.ok(b); await h.click(b);
  await h.go('today'); await h.as('fayad');
  assert.match(h.text(), /Proposed — awaiting coach review/);
  assert.match(h.text(), /To review1/, 'PUBGM proposal lands in the Head Coach queue');
  assert.equal(todayList([], [], 'PUBG Mobile').length, 0);
});
