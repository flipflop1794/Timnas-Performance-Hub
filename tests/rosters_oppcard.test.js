import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { seedRosters, editPlayers, recordCheck, checkStatus, dotaPool, rosterKey } from '../src/core/rosters.js';
import { autoCard, cardPlan, approveCard, cardMarkdown } from '../src/core/oppcard.js';
import { FIELDS, nationProfile } from '../src/core/competitors.js';

const rd = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const DATA = { rivalRosters: rd('../data/wec/rival_rosters.json'), rivalPools: rd('../data/wec/rival_dota_pools.json'), opp: { MGL: rd('../data/dota/opp_MGL.json') } };
const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('seeded rosters cover every published rival team in six titles, with flags kept', () => {
  const R = seedRosters(DATA.rivalRosters);
  for (const [t, f] of Object.entries(FIELDS)) if (t !== 'eFootball') for (const n of f) assert.ok(R[rosterKey(t, n)], `${t} ${n}`);
  assert.equal(R['PUBG Mobile|Egypt'].players.map((p) => p.ign).join(), 'AGA1N,APKRINO,NASSER74,ZUXXY隋');
  assert.match(R['MLBB|Cambodia'].players.find((p) => p.ign === 'PPPPPP').flags[0], /five/);
  assert.equal(R['Dota 2|Mongolia'].players.find((p) => p.ign === 'NARMAN').account, '343084576');
  assert.ok(R['Dota 2|Greece'].players.find((p) => p.ign === 'SsaSpartan-').flags.some((f) => /probable/.test(f)));
});

test('player edits, weekly check flags added and removed players, check due after 7 days', () => {
  const tm = seedRosters(DATA.rivalRosters)['MLBB|Myanmar'];
  assert.throws(() => editPlayers(tm, { KidX: { note: 'call 0812345678901' } }, 'Aufa'), /phone/);
  const e = editPlayers(tm, { KidX: { role: 'Jungle', club: 'Falcon' } }, 'Aufa Bassam');
  assert.equal(e.players[0].role, 'Jungle');
  const c = recordCheck(e, { date: '2026-11-10', by: 'Aufa Bassam', names: 'KidX\nLucky\nNewCold\nOp\nNewGuy' });
  const last = c.checks.at(-1);
  assert.equal(last.result, 'changed'); assert.deepEqual(last.added, ['NewGuy']); assert.deepEqual(last.removed, ['Ps']);
  assert.equal(checkStatus(c, '2026-11-12').due, false); assert.equal(checkStatus(c, '2026-11-17').due, true);
  assert.equal(checkStatus(c, '2026-11-12').changed.length, 1);
  assert.equal(recordCheck(c, { date: '2026-11-17', by: 'A', names: 'KidX, Lucky, NewCold, Op, NewGuy' }).checks.at(-1).result, 'no change');
});

test('Dota pools for rivals: shipped OpenDota aggregates and Mongolia, no data marked', () => {
  assert.equal(dotaPool('Belarus', 'young G', DATA).n, 253);
  assert.equal(dotaPool('Mongolia', 'NARMAN', DATA).n, 163);
  assert.equal(dotaPool('Iran', 'A9', DATA).n, 0);
  assert.equal(dotaPool('Egypt', 'Kemps', DATA), null);
});

test('opponent card: auto part, ban candidates by presence, plan rules, approval, markdown', () => {
  const R = seedRosters(DATA.rivalRosters);
  const per = nationProfile('Belarus', {}).per.find((x) => x.title === 'Dota 2');
  const a = autoCard({ title: 'Dota 2', nation: 'Belarus', per, team: R['Dota 2|Belarus'], data: DATA, heroes: { 13: { name: 'Puck' }, 69: { name: 'Doom' } } });
  assert.equal(a.banCandidates[0].hero, 'Puck'); assert.equal(a.banCandidates[0].games, 38); assert.equal(a.banCandidates[0].probable, true);
  assert.ok(a.gaps.some((g) => /No tournament data since 7.41 for: kur0patbI4, Byun, Onejey/.test(g)));
  assert.throws(() => cardPlan({ keys: ['', ''], ourAnswer: 'x', by: 'A' }), /at least one/);
  assert.throws(() => cardPlan({ keys: ['a'], ourAnswer: '', by: 'A' }), /our answer/);
  const p = cardPlan({ keys: ['young G is their mid: Puck, Lina, Bristleback'], ourAnswer: 'Ban Puck first phase', focus: { Fbz: 'win off lane', Mikoto: '' }, by: 'Aufa Bassam' });
  assert.deepEqual(p.focus, { Fbz: 'win off lane' }); assert.equal(p.status, 'draft');
  assert.throws(() => approveCard(p, { by: '' }), /Approver/);
  const ap = approveCard(p, { by: 'Gregorius Arvindra Prasetyo' });
  const md = cardMarkdown(a, ap);
  assert.match(md, /approved by Gregorius/); assert.match(md, /Ban Puck first phase/); assert.match(md, /Puck — young G, 38 of 253 games \(account probable\)/);
});

function mock() {
  const store = new Map(); const subs = []; const notify = () => subs.forEach((s) => s()); let n = 0;
  const ref = (p) => ({ set: async (d) => { store.set(p, JSON.parse(JSON.stringify(d))); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(p), data: () => store.get(p) }); subs.push(f); f(); return () => {}; } });
  return { store, doc: ref, collection: (c) => ({ doc: (id) => ref(`${c}/${id}`), add: async (d) => { store.set(`${c}/a${++n}`, JSON.parse(JSON.stringify(d))); notify(); },
    onSnapshot: (next) => { const f = () => next({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }); subs.push(f); f(); return () => {}; } }) };
}

test('page: rosters tab, weekly check, opponent card write → approve → download', async () => {
  const db = mock(); let saved = null;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#comp-rosters', beforeParse(w) {
    w.claude = { use: async (nm) => (nm === 'db' ? db : nm === 'downloads' ? { save: async (x) => { saved = x; return { status: 'saved' }; } } : null) }; w.print = () => {};
    w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 25)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  assert.match(main(), /Rosters & players|Every rival player/); assert.match(main(), /young G/); assert.match(main(), /Players with an account/);
  // weekly check with a change
  const fk = 'Dota_2_Belarus';
  d.getElementById(`rc-${fk}-names`).value = 'kur0patbI4\nByun\nMiyaoo\nOnejey\nNewMid';
  d.querySelector('[data-roster-check="Dota 2|Belarus"]').click(); await wait();
  const stored = db.store.get('rival_rosters/Dota_2_Belarus');
  assert.equal(stored.checks.at(-1).result, 'changed'); assert.deepEqual(stored.checks.at(-1).removed, ['young G']);
  assert.match(main(), /roster changed/);
  // edit a role
  d.getElementById('rr-Dota_2_Mongolia-3-role').value = 'pos 1'; d.querySelector('[data-roster-save="Dota 2|Mongolia"]').click(); await wait();
  assert.equal(db.store.get('rival_rosters/Dota_2_Mongolia').players[3].role, 'pos 1');
  // opponent card
  await go('comp-card');
  assert.match(main(), /Indonesia vs Mongolia/); assert.match(main(), /ban candidates/); assert.match(main(), /Gaps before this card is match-ready/);
  d.getElementById('ocA').value = 'Ban their offlaner\'s comfort'; d.getElementById('ocSave').click(); await wait();
  assert.match(d.getElementById('ocSaveMsg').textContent, /at least one/);
  d.getElementById('ocK0').value = 'NARMAN plays with Jhocam at Team Nemesis'; d.querySelector('input[data-player="Fbz"]').value = 'lane vs NARMAN';
  d.getElementById('ocSave').click(); await wait();
  assert.equal(db.store.get('opp_cards/Dota_2_Mongolia').status, 'draft');
  d.getElementById('ocApprove').click(); await wait();
  assert.equal(db.store.get('opp_cards/Dota_2_Mongolia').status, 'approved');
  d.getElementById('ocDl').click(); await wait();
  assert.match(saved.filename, /opponent-card-Dota_2-Mongolia\.md/); assert.match(saved.data, /Fbz: lane vs NARMAN/);
  // from the nation profile
  await go('comp-nation'); d.getElementById('cnN').value = 'Myanmar'; d.getElementById('cnN').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait();
  assert.match(main(), /KidX \(C\)/);
  d.querySelector('[data-card="MLBB|Myanmar"]').click(); await wait(); dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /Indonesia vs Myanmar/); assert.match(main(), /Asian Games/);
});

test('opponent card: heroes both sides play, old notes marked for a re-check, hypotheses-only flagged', () => {
  const R = seedRosters(DATA.rivalRosters);
  const per = nationProfile('Belarus', {}).per.find((x) => x.title === 'Dota 2');
  const heroes = { 13: { name: 'Puck' }, 69: { name: 'Doom' }, 106: { name: 'Ember Spirit' } };
  const ours = [{ player: 'Mikoto', pool: [{ hero: 13, name: 'Puck', games: 22 }, { hero: 106, name: 'Ember Spirit', games: 3 }] }];
  const a = autoCard({ title: 'Dota 2', nation: 'Belarus', per, team: R['Dota 2|Belarus'], data: DATA, heroes, ours, asOf: '2026-11-07' });
  assert.deepEqual(a.contested, [{ hero: 'Puck', them: 'young G', theirGames: 38, us: 'Mikoto', ourGames: 22 }]); // Ember Spirit: only 3 of ours
  assert.match(cardMarkdown(a, null), /Puck: young G 38 games, our Mikoto 22/);
  const old = { ...per, notes: [{ kind: 'hypothesis', note: 'They draft greedy', source: 'VOD', date: '2026-10-01' }] };
  const b = autoCard({ title: 'Dota 2', nation: 'Belarus', per: old, team: R['Dota 2|Belarus'], data: DATA, heroes, asOf: '2026-11-07' });
  assert.ok(b.gaps.some((g) => /Newest note is 37 days old/.test(g)));
  assert.ok(b.gaps.some((g) => /Only hypotheses/.test(g)));
});
