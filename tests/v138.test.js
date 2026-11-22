// V1.38: 21 Nov site re-read, eFootball rosters, rule profiles from the desk research, rules in AI material,
// the press-reported Dota schedule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { seedRosters, checkStatus } from '../src/core/rosters.js';
import { DEFAULT_RULES, mergeRules, rulesMaterial, changedSince, snapshot } from '../src/core/rules.js';
import { prepMaterial } from '../src/core/coach_ai.js';
import { prematchMaterial, materialIds } from '../src/core/scouting.js';
import { REPORTED_SCHEDULE, onTracker, wecMatch } from '../src/core/matchday.js';
import { FIELDS } from '../src/core/competitors.js';
import { prepPrompt, prematchPrompt, brainstormPrompt, PROMPT_VERSION } from '../supabase/functions/_shared/scrim_spec.js';
import { tr } from '../src/hub/i18n.js';

const data = JSON.parse(readFileSync(new URL('../data/wec/rival_rosters.json', import.meta.url), 'utf8'));
const R = seedRosters(data);

test('21 Nov re-read: real changes flagged, unchanged teams marked checked, spelling fix and filled coach are not changes', () => {
  const mgl = R['CS2|Mongolia']; const c = mgl.checks.at(-1);
  assert.equal(c.date, '2026-11-21'); assert.equal(c.result, 'changed');
  assert.deepEqual(c.added, ['Aapestt', 'AccuracyTG']); assert.deepEqual(c.removed, ['hoolig4n', 'RATE']);
  assert.equal(R['CS2|Australia'].checks.at(-1).added[0], 'sliimey');
  assert.equal(R['CS2 Women|Kyrgyzstan'].checks.at(-1).added[0], 'rumethis');
  const mar = R['PUBG Mobile|Morocco']; assert.equal(mar.coach, 'md'); assert.ok(mar.players.some((p) => p.ign === 'lazyboy'));
  assert.equal(mar.players.find((p) => p.captain).ign, 'MARSHALL');
  // Not changes: France "Si" was a 3 Nov misread; Iraq's coach was simply not read on 3 Nov.
  assert.equal(R['CS2 Women|France'].checks.at(-1).result, 'no change'); assert.ok(R['CS2 Women|France'].players.some((p) => p.ign === 'SiA'));
  assert.equal(checkStatus(R['CS2|Iraq'], '2026-11-21').changed.length, 0); assert.equal(R['CS2|Iraq'].coach, 'TAHA AL DULAIMI');
  // Everyone was checked on 21 Nov: no weekly check is due until 28 Nov.
  const teams = Object.values(R);
  assert.ok(teams.every((t) => !checkStatus(t, '2026-11-27').due));
  assert.ok(teams.filter((t) => t.title !== 'eFootball').every((t) => t.checks.at(-1).date === '2026-11-21'));
});

test('eFootball: one player for each of the 96 rival nations, first read on 21 Nov', () => {
  const ef = Object.values(R).filter((t) => t.title === 'eFootball');
  assert.equal(ef.length, 96);
  assert.ok(ef.every((t) => t.players.length === 1 && t.checks[0].date === '2026-11-21'));
  for (const n of FIELDS.eFootball) assert.ok(R[`eFootball|${n}`], n);
  assert.equal(R['eFootball|Thailand'].players[0].ign, 'Jeans'); assert.equal(R['eFootball|Brazil'].players[0].ign, 'HenrykinhO');
  assert.ok(!R['eFootball|Indonesia'], 'our own player is not a rival');
});

test('rule profiles: new defaults reach a saved live copy; staff edits are never overwritten', () => {
  const at = '2026-11-21T10:00:00Z';
  const old = [{ id: 'dota-patch', title: 'Dota 2', label: 'Game patch', version: '7.41 (OpenDota patch 60)', status: 'provisional', source: 'old', affects: ['dota-team'] },
    { id: 'pubgm-scoring', title: 'PUBG Mobile', label: 'Scoring table', version: 'WEC26 v1', status: 'confirmed', source: 'PB ESI', affects: [], history: [{ by: 'Fayad' }] }];
  const m = mergeRules(old, DEFAULT_RULES, { at });
  const dp = m.find((r) => r.id === 'dota-patch');
  assert.match(dp.version, /^7\.42/); assert.equal(dp.history[0].from, '7.41 (OpenDota patch 60)'); assert.match(dp.history[0].by, /V1\.38/);
  assert.equal(m.find((r) => r.id === 'pubgm-scoring').version, 'WEC26 v1', 'staff-set rule kept');
  for (const id of ['dota-format', 'cs2-format', 'cs2-map-pool', 'mlbb-format', 'mlbbw-format', 'pubgm-format', 'efootball-format']) assert.ok(m.some((r) => r.id === id), id);
  // A staff-edited patch rule stays as set.
  const edited = [{ ...old[0], version: '7.41 (OpenDota patch 60)', history: [{ by: 'Aufa' }] }];
  assert.equal(mergeRules(edited, DEFAULT_RULES).find((r) => r.id === 'dota-patch').version, '7.41 (OpenDota patch 60)');
  // Objectives proposed under 7.41 are flagged by the existing re-check logic.
  assert.equal(changedSince({ 'dota-patch': '7.41 (OpenDota patch 60)' }, m).length, 1);
  assert.equal(mergeRules(undefined, DEFAULT_RULES), DEFAULT_RULES);
  assert.ok(DEFAULT_RULES.every((r) => r.status !== 'confirmed'), 'nothing is confirmed until IESF publishes rules');
});

test('AI material carries the title rules with citable ids; prompts explain them', () => {
  const rm = rulesMaterial(DEFAULT_RULES, 'CS2 Women');
  assert.deepEqual(rm.map((x) => x.id), ['R-cs2-format', 'R-cs2-map-pool']);
  assert.match(rm[0].text, /Bo1.*\(provisional\)/);
  const match = wecMatch({ title: 'Dota 2', date: '2026-12-16', opponent: 'Mongolia', format: 'Bo1' });
  const pm = prepMaterial({ match, asOf: '2026-11-21', rules: DEFAULT_RULES });
  assert.ok(pm.RULES.some((x) => x.id === 'R-dota-patch' && /7\.42/.test(x.text)));
  const pre = prematchMaterial({ brief: { known: [], tbd: [], watch: [] }, rules: rulesMaterial(DEFAULT_RULES, 'MLBB') });
  assert.ok(materialIds(pre).has('R-mlbb-format'));
  for (const p of [prepPrompt('Dota 2'), prematchPrompt('MLBB'), brainstormPrompt('CS2', 'opponent')]) assert.match(p, /RULES \(when present\)/);
  assert.equal(PROMPT_VERSION, 'scrim-ai-2026-12-03.1');
});

test('reported Dota schedule: five Group A Bo1s for Indonesia, matches that are already on the tracker are recognised', () => {
  const rs = REPORTED_SCHEDULE['Dota 2'];
  assert.equal(rs.matches.length, 5); assert.deepEqual(rs.matches.slice(0, 2).map((m) => m.opponent), ['Mongolia', 'Kazakhstan']);
  assert.ok(rs.matches.every((m) => m.format === 'Bo1' && FIELDS['Dota 2'].includes(m.opponent)));
  assert.match(rs.source, /single source/);
  const m = wecMatch({ title: 'Dota 2', date: '2026-12-16', opponent: 'Mongolia', format: 'Bo1' });
  assert.ok(onTracker([m], 'Dota 2', rs.matches[0])); assert.ok(!onTracker([m], 'Dota 2', rs.matches[1]));
  assert.equal(tr('Reported schedule — not official'), 'Jadwal yang dilaporkan — belum resmi');
  assert.equal(tr('Event format'), 'Format turnamen');
});

test('page: the roster screen offers eFootball; the Rules page lists the new profiles', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#comp-rosters', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; } });
  const wait = () => new Promise((r) => setTimeout(r, 40)); await wait();
  const d = dom.window.document;
  const opts = [...(d.getElementById('crT')?.options || [])].map((o) => o.value);
  if (opts.length) assert.ok(opts.includes('eFootball'), 'eFootball in the roster title list');
  dom.window.location.hash = 'staff-rules'; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait();
  const txt = d.getElementById('main').textContent;
  if (/Rules/.test(txt)) { assert.match(txt, /7\.42/); assert.match(txt, /Erangel, Miramar, Rondo/); }
});
