import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { defaultRunbook, tLabel, wecMatch, tick, setResult, gameNote, markApplied } from '../src/core/matchday.js';
import { vod, reviewVod, partner, partnerStats, goal, updateGoal } from '../src/core/library.js';
import { weeklyBrief } from '../src/core/brief.js';
import { DEFAULT_RULES } from '../src/core/rules.js';

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');

test('runbook template and WEC match tracker rules', () => {
  const rb = defaultRunbook('Dota 2');
  assert.ok(rb.some((x) => /Draft book/.test(x.item))); assert.equal(rb.at(-1).t, 0);
  assert.equal(tLabel(-1440), 'D-1'); assert.equal(tLabel(-90), 'T-1h 30m'); assert.equal(tLabel(-30), 'T-30m');
  assert.throws(() => wecMatch({ title: 'Dota 2', date: '2026-12-01', opponent: 'Mongolia' }), /within WEC/);
  assert.throws(() => wecMatch({ title: 'Dota 2', date: '2026-12-15', opponent: ' ' }), /Opponent/);
  let m = wecMatch({ title: 'Dota 2', date: '2026-12-15', opponent: 'Mongolia' });
  m = tick(m, rb[0].id, 'Aufa Bassam'); assert.equal(m.done[rb[0].id].by, 'Aufa Bassam');
  m = tick(m, rb[0].id, 'Aufa Bassam'); assert.equal(m.done[rb[0].id], undefined);
  assert.throws(() => setResult(m, { result: 'win', by: 'A' }), /Result must be/);
  assert.equal(setResult(m, { result: 'won', score: '2-0', by: 'A' }).result.score, '2-0');
});

test('between-games sheet: adjustment required, calls kept per player, applied marked', () => {
  let m = wecMatch({ title: 'Dota 2', date: '2026-12-16', opponent: 'Greece' });
  assert.throws(() => gameNote(m, { worked: 'x', adjust: '', by: 'A' }), /adjustment/);
  assert.throws(() => gameNote(m, { adjust: 'y', by: 'A' }), /worked or what failed/);
  m = gameNote(m, { side: 'Radiant', outcome: 'lost', failed: 'lost mid early', adjust: 'ban Puck first', calls: { Fbz: 'smoke at 6', Mikoto: ' ' }, by: 'Aufa Bassam' });
  assert.deepEqual(m.games[0].calls, { Fbz: 'smoke at 6' });
  m = gameNote(m, { worked: 'mid held', adjust: 'same draft', by: 'Aufa Bassam' });
  assert.equal(markApplied(m, 1, true).games[0].applied, true);
});

test('VOD library, partner bank and goals validate their inputs', () => {
  assert.throws(() => vod({ title: 'MLBB', nation: 'Philippines', url: 'https://x.y', event: 'e', by: 'A' }), /not in the published MLBB field/);
  assert.throws(() => vod({ title: 'MLBB', nation: 'Myanmar', url: 'youtube', event: 'e', by: 'A' }), /video link/);
  const v = vod({ title: 'MLBB', nation: 'Myanmar', url: 'https://youtu.be/abc', event: 'Asian Games final', by: 'Aufa Bassam', tags: ['draft'] });
  assert.equal(reviewVod(v, { by: 'Coach Indra', note: 'flex jungle' }).reviewed, true);
  assert.throws(() => partner({ title: 'Dota 2', name: 'T', level: 'Tier 2' }), /holds the contact/);
  assert.throws(() => partner({ title: 'Dota 2', name: 'T', level: 'Tier 2', contactOwner: 'A', resembles: 'Peru' }), /not in the Dota 2 field/);
  const p = partner({ title: 'Dota 2', name: 'Team A', level: 'Tier 2', contactOwner: 'Aufa Bassam', resembles: 'Mongolia' });
  assert.deepEqual(partnerStats(p, [{ title: 'Dota 2', partner: 'team a', status: 'done', date: '2026-11-10' }, { title: 'Dota 2', partner: 'Team A', status: 'planned', date: '2026-11-20' }]), { scrims: 1, last: '2026-11-10' });
  assert.throws(() => goal({ area: 'game', goal: 'x', owner: 'A' }), /measured/);
  const g = goal({ area: 'physical', goal: 'Sleep routine', measure: '7 h on 5 of 7 nights', owner: 'Donny Ardy Kusuma' });
  assert.equal(updateGoal(g, { status: 'at risk', by: 'Donny' }).updates.length, 1);
});

test('weekly brief: counts per title, gaps, no individual wellbeing values', () => {
  const checkins = [{ player: 'Fbz', title: 'Dota 2', date: '2026-11-09', wellness: 13, sleepH: 4.5, origin: 'operational' }];
  const md = weeklyBrief({ asOf: '2026-11-10', cycle: [], scrims: [], rivals: [], tiers: { 'MLBB|Myanmar': { title: 'MLBB', nation: 'Myanmar', tier: 'main threat', why: 'Asian Games gold', by: 'Aufa' } }, checkins, roster: { 'Dota 2': ['Fbz', 'Whitemon'] }, rules: DEFAULT_RULES, pending: ['Juara Umum scoring rule'],
    plans: [{ title: 'Dota 2', player: 'Fbz', goals: [{ area: 'game', status: 'at risk' }] }] });
  assert.match(md, /35 days to WEC/); assert.match(md, /\| Dota 2 \| Aufa Bassam \|/);
  assert.match(md, /Dota 2: no accepted objective/); assert.match(md, /MLBB: Myanmar/); assert.match(md, /Fbz: game goal at risk/);
  assert.match(md, /Juara Umum scoring rule/);
  assert.doesNotMatch(md, /4\.5|13\/25|wellness 13/);
  assert.match(md, /\| 7% \|/); // 1 of 14 possible check-ins
});

function mock() {
  const store = new Map(); const subs = []; const notify = () => subs.forEach((s) => s()); let n = 0;
  const ref = (p) => ({ set: async (d) => { store.set(p, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(p), data: () => store.get(p) }); subs.push(f); f(); return () => {}; } });
  return { store, doc: ref, collection: (c) => ({ doc: (id) => ref(`${c}/${id}`), add: async (d) => { store.set(`${c}/a${++n}`, structuredClone(d)); notify(); },
    onSnapshot: (next) => { const f = () => next({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }); subs.push(f); f(); return () => {}; } }) };
}

test('page: runbook, WEC match, between-games, VOD, partner, player plan and brief', async () => {
  const db = mock(); let saved = null;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#tour-runbook', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en');
    w.claude = { use: async (nm) => (nm === 'db' ? db : nm === 'downloads' ? { save: async (x) => { saved = x; return { status: 'saved' }; } } : null) };
    w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 25)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  assert.match(main(), /Bracket, match times and format not published/);
  assert.match(main(), /Starting template proposed by the hub/);
  // edit runbook
  d.getElementById('rbT').value = '15'; d.getElementById('rbI').value = 'Earplugs and headset check'; d.getElementById('rbAdd').click(); await wait();
  assert.ok(db.store.get('config/runbooks').runbooks['Dota 2'].some((x) => x.item === 'Earplugs and headset check'));
  // a match outside WEC is refused
  d.getElementById('wmD').value = '2026-12-01'; d.getElementById('wmAdd').click(); await wait();
  assert.match(d.getElementById('wmAddMsg').textContent, /within WEC/);
  d.getElementById('wmD').value = '2026-12-16'; d.getElementById('wmO').value = 'Mongolia'; d.getElementById('wmF').value = 'Bo3'; d.getElementById('wmAdd').click(); await wait();
  const mk = [...db.store.keys()].find((k) => k.startsWith('wec_matches/')); const mid = mk.split('/')[1];
  d.querySelector(`[data-tick^="${mid}|"]`).click(); await wait();
  assert.equal(Object.keys(db.store.get(mk).done).length, 1);
  // between games
  d.querySelector(`[data-series="${mid}"]`).click(); await wait(); dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  assert.match(main(), /WEC coaching-contact rules: blocked/);
  d.getElementById('gnF').value = 'lost mid'; d.getElementById('gnA').value = 'ban Puck first';
  d.querySelector('input[data-player="Fbz"]').value = 'smoke at 6'; d.getElementById('gnSave').click(); await wait();
  assert.equal(db.store.get(mk).games[0].calls.Fbz, 'smoke at 6');
  // VOD in competitors -> review -> competitor note
  await go('dota-scout');
  d.getElementById('vdN-Dota_2').value = 'Mongolia'; d.getElementById('vdU-Dota_2').value = 'https://example.com/vod1'; d.getElementById('vdE-Dota_2').value = 'SEA qualifier';
  d.querySelector('input[name="vdTag-Dota_2"]').checked = true; d.querySelector('[data-vod-add="Dota 2"]').click(); await wait();
  const vk = [...db.store.keys()].find((k) => k.startsWith('vods/')); const vid = vk.split('/')[1];
  d.getElementById(`vrN-${vid}`).value = 'Offlane Kez every game'; d.querySelector(`[data-vod-review="${vid}"]`).click(); await wait();
  d.querySelector(`[data-vod-note="${vid}"]`).click(); await wait();
  const rn = [...db.store.entries()].find(([k]) => k.startsWith('rivals/'))[1];
  assert.equal(rn.source, 'https://example.com/vod1'); assert.equal(rn.note, 'Offlane Kez every game');
  // partner bank feeds the scrim planner
  await go('dota-scrims');
  d.getElementById('ptN-Dota_2').value = 'Sparring Team A'; d.getElementById('ptA-Dota_2').value = 'call 081234567890'; d.querySelector('[data-partner-add="Dota 2"]').click(); await wait();
  assert.match(d.getElementById('ptMsg-Dota_2').textContent, /phone number/);
  d.getElementById('ptA-Dota_2').value = 'weeknights'; d.getElementById('ptM-Dota_2').value = 'Mongolia'; d.querySelector('[data-partner-add="Dota 2"]').click(); await wait();
  assert.ok(db.store.has('partners/Dota_2_Sparring_Team_A'));
  assert.equal(d.querySelector('#pbList-Dota_2 option').value, 'Sparring Team A');
  // player plan
  await go('players');
  d.getElementById('gaG').value = 'Two more established pos-4 heroes'; d.getElementById('gaM').value = '6 scrim games on each by 1 Dec'; d.getElementById('gaAdd').click(); await wait();
  const pk = [...db.store.keys()].find((k) => k.startsWith('player_plans/'));
  assert.equal(pk, 'player_plans/Dota_2_Whitemon');
  const gid = db.store.get(pk).goals[0].id;
  d.getElementById(`guS-${gid}`).value = 'at risk'; d.querySelector(`[data-goal-upd="${gid}"]`).click(); await wait();
  assert.equal(db.store.get(pk).goals[0].status, 'at risk');
  // brief
  await go('brief');
  assert.match(main(), /Whitemon: game goal at risk/); assert.match(main(), /Player availability for the pelatnas/);
  d.getElementById('brDl').click(); await wait();
  assert.match(saved.filename, /^timnas-brief-\d{4}-\d{2}-\d{2}\.md$/); assert.match(saved.data, /# Timnas weekly brief/);
});
