import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { sessionBlocks, drillResults, planMaterial, cameBack, weeklyTrend, weeklyText, weeklyMaterial, blocksMinutes } from '../src/core/practice.js';
import { metaEntry, confirmMeta, retireMeta, metaOf, currentPatch, extractedEntries, openDotaRows, ourFacts, metaFit, metaFitMaterial } from '../src/core/meta.js';
import { planScrim } from '../src/core/scrims.js';
import { scrimReport, reportsCsv } from '../src/core/reports.js';
import { board } from '../src/core/competitors.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

const rep = (id, date, extra = {}) => scrimReport({ title: 'MLBB', date, by: 'Coach Indra', partner: 'Team X', focus: 'f', progress: 3, failed: 'x', adjust: 'y', won: 1, lost: 1, ...extra });

test('Focus 1 — timed drills: complete rows only, 5–180 minutes, a success criterion each; kept on the planned session', () => {
  assert.throws(() => sessionBlocks([{ name: 'Lord setup', minutes: 20, objective: 'vision', criterion: '' }]), /success criterion/);
  assert.throws(() => sessionBlocks([{ name: 'X', minutes: 2, objective: 'o', criterion: 'c' }]), /5 to 180/);
  assert.throws(() => sessionBlocks([{ name: '', minutes: 20, objective: 'o', criterion: 'c' }]), /needs a name/);
  const b = sessionBlocks([{ name: 'Lord setup', minutes: '25', objective: 'Ward before 7:00', criterion: '3 of 4 lords with vision' }, {}, { name: 'Mid rotate', minutes: 15, objective: 'rotate at 4:00', criterion: 'on time in 2 games' }, { name: 'a', minutes: 5, objective: 'o', criterion: 'c' }, { name: 'b', minutes: 5, objective: 'o', criterion: 'c' }]);
  assert.equal(b.length, 3, 'empty rows dropped; at most 4 rows read'); assert.equal(blocksMinutes(b), 45);
  const sc = planScrim({ title: 'MLBB', date: '2026-11-20', kind: 'scrim', partner: 'Team X', owner: 'Indra', blocks: b });
  assert.equal(sc.blocks.length, 3);
  assert.deepEqual(drillResults(b, ['yes', '', 'not tried']).map((d) => d.met), ['yes', 'not tried']);
});

test('Focus 1 — drill results on the report (and CSV); what came back; plan material', () => {
  const r = rep('R1', '2026-11-20', { drills: [{ name: 'Lord setup', criterion: 'c', met: 'no' }, { name: 'bad', met: 'maybe' }], fixCheck: 'No change', prevAdjust: 'Ward before lord' });
  assert.deepEqual(r.drills.map((d) => d.met), ['no']);
  assert.match(reportsCsv([r]).split('\r\n')[0], /,drills$/); assert.match(reportsCsv([r]), /Lord setup: no/);
  const r2 = rep('R2', '2026-11-21', { drills: [{ name: 'Lord setup', met: 'no' }] });
  const wt = ['R1', 'R2', 'R3'].map((id, i) => ({ title: 'MLBB', reportId: id, date: `2026-11-1${8 + i}`, tags: ['vision'] }));
  const back = cameBack('MLBB', { reports: [r, r2], wtags: wt, asOf: '2026-11-21' });
  assert.deepEqual(back.flagged, [{ label: 'vision', n: 3 }]); assert.equal(back.unfixed[0].adjustment, 'Ward before lord');
  assert.deepEqual(back.drillsMissedTwice, [{ name: 'Lord setup', n: 2 }]);
  const m = planMaterial('MLBB', { reports: [r, r2], wtags: wt, vods: [], asOf: '2026-11-21' });
  assert.equal(m.unfixed[0].id, r.id); assert.equal(m.weaknesses[0].flagged, true);
});

test('Focus 1 — weekly trend: fixed, persisting, new, exposed by partner, drills; small samples said plainly', () => {
  const now = ['2026-11-15', '2026-11-16', '2026-11-17'].map((d, i) => rep(`N${i}`, d, { partner: i < 2 ? 'Team A' : 'Team B', drills: [{ name: 'Lord', met: i ? 'yes' : 'no' }] }));
  const prev = ['2026-10-28', '2026-10-29'].map((d, i) => rep(`P${i}`, d));   // the 14 days before 4–17 Nov
  const wt = [...now.map((r) => ({ title: 'MLBB', reportId: r.id, date: r.date, tags: ['vision', ...(r.partner === 'Team A' ? ['draft'] : [])] })), ...prev.map((r) => ({ title: 'MLBB', reportId: r.id, date: r.date, tags: ['vision', 'rotation'] }))];
  const w = weeklyTrend('MLBB', { reports: [...now, ...prev], wtags: wt, asOf: '2026-11-17' });
  assert.equal(w.reports, 3); assert.equal(w.reportsPrev, 2); assert.equal(w.lowSample, true);
  assert.deepEqual(w.fixed, [{ label: 'rotation', prev: 2 }]); assert.deepEqual(w.persisting.map((x) => x.label), ['vision']); assert.deepEqual(w.fresh.map((x) => x.label), ['draft']);
  assert.ok(w.exposedBy.some((x) => x.partner === 'Team A' && x.label === 'draft' && x.n === 2));
  assert.deepEqual(w.drills, { yes: 2, no: 1, 'not tried': 0 });
  const en = weeklyText(w); assert.match(en, /Small sample/); assert.match(en, /No longer showing: rotation \(before 2\)/);
  assert.match(weeklyText(w, 'id'), /Sampel kecil/);
  assert.equal(weeklyMaterial(w).REPORTS.low_sample, true);
});

test('Focus 2 — meta tracker: sources required, to confirm by default, confirm and retire, current patch', () => {
  assert.throws(() => metaEntry({ title: 'MLBB', category: 'strong', item: 'Ling', source: '', by: 'A' }), /Source is required/);
  assert.throws(() => metaEntry({ title: 'MLBB', category: 'tier S', item: 'Ling', source: 's', by: 'A' }), /category/);
  const e = metaEntry({ title: 'MLBB', category: 'strong', item: 'Ling', text: 'Most banned at MPL ID S16', source: 'MPL ID stats', by: 'Analyst' });
  assert.equal(e.kind, 'meta'); assert.equal(e.check, true);
  const p = metaEntry({ title: 'MLBB', category: 'patch', patch: '1.9.42', source: 'Patch notes', by: 'Analyst', confirmed: true });
  assert.equal(p.check, false); assert.equal(currentPatch(metaOf([e, p], 'MLBB')).version, '1.9.42');
  assert.equal(currentPatch([], '7.41').check, true);
  const c = confirmMeta(e, 'Head analyst'); assert.equal(c.check, false); assert.equal(c.confirmedBy, 'Head analyst');
  assert.throws(() => retireMeta(e, { why: '', by: 'A' }), /Say why/);
  assert.equal(metaOf([retireMeta(e, { why: 'outdated', by: 'A' }), p], 'MLBB').length, 1);
  assert.equal(board('MLBB', [e, p]).covered, board('MLBB').covered, 'meta entries are not scouting notes');
});

test('Focus 2 — AI extraction: an entry survives only with an exact quote from the pasted text', () => {
  const text = 'Patch 1.9.42\nLing: base damage reduced.\nFanny and Ling remain the most banned heroes.';
  const raw = { patch: '1.9.42', entries: [
    { category: 'change', item: 'Ling', text: 'Base damage reduced', quote: 'Ling: base damage reduced.' },
    { category: 'strong', item: 'Fanny', text: 'Most banned', quote: 'Fanny and Ling remain the most banned heroes.' },
    { category: 'strong', item: 'Valentina', text: 'Very strong', quote: 'Valentina is broken' },
    { category: 'tier', item: 'X', text: 'x', quote: 'Patch 1.9.42' },
  ] };
  const X = extractedEntries(raw, text, { title: 'MLBB', source: 'Patch notes', by: 'A' });
  assert.equal(X.entries.length, 2); assert.equal(X.dropped, 2); assert.ok(X.entries.every((e) => e.check && e.quote));
});

test('Focus 2 — OpenDota rows, our facts, good for us / bad for us', () => {
  const rows = openDotaRows([{ localized_name: 'Puck', pro_pick: 120, pro_win: 66, pro_ban: 200 }, { localized_name: 'Io', pro_pick: 8, pro_win: 3, pro_ban: 1 }, {}]);
  assert.equal(rows[0].hero, 'Puck'); assert.equal(rows[0].winRate, 55); assert.equal(rows[1].lowSample, true);
  const g = (id, hero, result) => ({ id, title: 'MLBB', date: '2026-11-1' + id.slice(-1), createdAt: `x${id}`, result, players: [{ team: 'ours', player: 'Aran', hero }, { team: 'partner', hero: 'Tigreal' }] });
  const games = [g('G1', 'Ling', 'win'), g('G2', 'Ling', 'loss'), g('G3', 'Ling', 'win'), g('G4', 'Lancelot', 'win')];
  const pools = [{ title: 'MLBB', player: 'Kevin', heroes: { Fanny: { tier: 'main' } } }];
  const facts = ourFacts('MLBB', { games, pools });
  assert.deepEqual(facts.find((f) => f.id === 'OG-Ling'), { id: 'OG-Ling', kind: 'games', hero: 'Ling', games: 3, wins: 2, players: ['Aran'], low_sample: false });
  const mk = (category, item) => metaEntry({ title: 'MLBB', category, item, source: 's', by: 'A' });
  const fit = metaFit([mk('strong', 'Ling'), mk('strong', 'Fanny'), mk('strong', 'Valentina'), mk('weak', 'Ling'), mk('strategy', 'Early lord')], facts);
  assert.equal(fit.aligned.length, 2, 'Ling played 3×; Fanny is a main in a pool');
  assert.ok(fit.exposed.some((x) => /Valentina is listed as strong — to confirm; no confirmed game, not in any hero pool/.test(x.text)));
  assert.ok(fit.exposed.some((x) => /We rely on Ling/.test(x.text)));
  assert.ok(fit.tbd.some((x) => /Early lord/.test(x.text)));
  const mat = metaFitMaterial('MLBB', [mk('strong', 'Ling')], facts); assert.equal(mat.META[0].confirmed, false); assert.ok(mat.OURS.length >= 2);
});

test('scrim-ai: new actions are routed with their schemas; plan sends the drill material; debrief sends the planned drills', async () => {
  const calls = []; const inserts = [];
  const deps = { env: { ANTHROPIC_API_KEY: 'k' }, uuid: () => 'u', now: () => new Date('2026-11-25T05:00:00Z'), heroes: HEROES, sleep: async () => {},
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: {} }) }; },
    clientFor: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x' } }, error: null }) }, rpc: async (fn) => ({ data: fn === 'can_write_title' ? true : 0, error: null }), from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) }) };
  const call = (body) => handle({ method: 'POST', headers: { authorization: 'Bearer t' }, json: async () => body }, deps);
  const ping = await call({ action: 'ping' }); assert.ok(['weekly', 'meta_extract', 'meta_fit'].every((a) => ping.body.actions.includes(a)));
  assert.equal((await call({ action: 'weekly', title: 'MLBB', material: { TITLE: 'MLBB', FIXED: [] } })).status, 200);
  assert.ok(calls.at(-1).output_config.format.schema.properties.practise_next); assert.equal(inserts.at(-1).action, 'weekly');
  assert.equal((await call({ action: 'meta_extract', title: 'MLBB', text: '', source: 's' })).status, 400);
  assert.equal((await call({ action: 'meta_extract', title: 'MLBB', text: 'x'.repeat(12001), source: 's' })).status, 413);
  assert.equal((await call({ action: 'meta_extract', title: 'MLBB', text: 'Ling nerfed', source: 'Patch notes' })).status, 200);
  assert.match(calls.at(-1).messages[0].content[0].text, /"SOURCE":"Patch notes"/);
  assert.equal((await call({ action: 'meta_fit', title: 'MLBB', material: { META: [{ id: 'm1' }], OURS: [] } })).status, 200);
  assert.ok(calls.at(-1).output_config.format.schema.properties.exposed);
  await call({ action: 'plan', title: 'MLBB', reports: [{ id: 'R1', date: '2026-11-20' }], material: { unfixed: [{ id: 'R1', adjustment: 'ward' }], weaknesses: [{ label: 'vision', n: 3 }], themes: [] } });
  assert.match(calls.at(-1).messages[0].content[0].text, /"UNFIXED":\[\{"id":"R1"/); assert.ok(calls.at(-1).output_config.format.schema.properties.blocks);
  await call({ action: 'debrief', title: 'MLBB', text: 'Lord setup worked, ward timing not tried', blocks: [{ name: 'Lord setup', criterion: '3 of 4 lords' }] });
  assert.match(calls.at(-1).messages[0].content[0].text, /^PLANNED DRILLS:\n0\. Lord setup — criterion: 3 of 4 lords/);
});

test('page: plan a session with timed drills; the report asks for each drill; Meta tab adds, confirms and compares', async () => {
  const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#mlbb-scrims', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async () => null }; w.console.error = (...a) => { throw new Error(a.join(' ')); }; } });
  const wait = () => new Promise((r) => setTimeout(r, 40)); await wait();
  const d = dom.window.document; const main = () => d.getElementById('main').textContent;
  const go = async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); };
  const set = (id, v) => { d.getElementById(id).value = v; };
  set('spP-MLBB', 'Team X'); set('spBn0-MLBB', 'Lord setup'); set('spBm0-MLBB', '25'); set('spBo0-MLBB', 'Ward before 7:00'); set('spBc0-MLBB', '3 of 4 lords with vision');
  d.querySelector('[data-scrim-plan="MLBB"]').click(); await wait();
  assert.match(main(), /Lord setup · 25 min/); assert.match(main(), /25 min of drills/);
  await go('mlbb-reports');
  const scSel = d.getElementById('rp-MLBB-scrim'); if (scSel) { scSel.value = [...scSel.options].find((o) => o.value).value; scSel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(); }
  assert.match(main(), /Planned drills/); assert.ok(d.getElementById('rp-MLBB-dr0'));
  await go('mlbb-trends'); assert.match(main(), /Weekly trend — MLBB/);
  await go('mlbb-meta'); assert.match(main(), /Meta — MLBB/); assert.match(main(), /Current patch: TBD/);
  set('mtC-MLBB', 'strong'); set('mtI-MLBB', 'Ling'); set('mtS-MLBB', 'MPL ID stats'); set('mtT-MLBB', 'Most banned');
  d.querySelector('[data-mt-add="MLBB"]').click(); await wait();
  assert.match(main(), /to confirm/); assert.match(main(), /Ling is listed as strong — to confirm; no confirmed game/);
  d.querySelector('[data-mt-confirm]').click(); await wait();
  assert.match(main(), /confirmed/);
});
